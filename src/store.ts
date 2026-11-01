// Everything received from the server, and the rules for how little to ask for it:
// - the stream is open only while the page is showing and not paused, and only for the
//   sections of widgets on this layout. It's what keeps the server's sampler going;
// - the report and histories are fetched only when a widget on screen needs them, and each no
//   more than once a minute. Live numbers are never polled.
import { FrameReader, retryWait } from './frames.ts'
import type { Catalog, History, Host, MetricsNow, Report } from './types.ts'
import type { HistoryState, SeriesData } from './views.ts'

export type StreamState = 'off' | 'connecting' | 'live' | 'retrying' | 'hidden' | 'paused'
export type Slice = 'catalog' | 'now' | 'report' | 'history' | 'stream'

const MINUTE = 60000
const WATCHDOG = 15000 // a reading comes every two seconds, so this long means it has gone quiet
const KEEP = 150 // five minutes of readings, for the end of a chart

const statusOf = (e: unknown) => (e as { status?: number } | null)?.status

// The numbers a chart can draw, from one reading.
function seriesNow(n: MetricsNow): Record<string, number> {
  const out: Record<string, number> = {}
  if (n.cpu) out.cpu = n.cpu.percent
  if (n.memory) {
    if (n.memory.total) out.memory = (n.memory.used / n.memory.total) * 100
    if (n.memory.swapTotal) out.swap = (n.memory.swapUsed / n.memory.swapTotal) * 100
  }
  if (n.net) {
    out.netRx = n.net.reduce((a, x) => a + x.rxRate, 0)
    out.netTx = n.net.reduce((a, x) => a + x.txRate, 0)
  }
  if (n.disks) {
    out.diskRead = n.disks.reduce((a, x) => a + x.readRate, 0)
    out.diskWrite = n.disks.reduce((a, x) => a + x.writeRate, 0)
  }
  if (n.process) {
    out.processCpu = n.process.cpuPercent
    out.rss = n.process.rss
    out.heap = n.process.heapAlloc
    out.goroutines = n.process.goroutines
  }
  if (n.transcodes) out.transcodes = n.transcodes.active
  return out
}

type Block = { at: number; data: History }
type RangeEntry = { blocks: Block[]; loading: number; error: boolean }

export class StatsStore {
  catalog: Catalog | null = null
  catalogError: string | null = null
  now: MetricsNow | null = null
  samples = 0
  run = 0 // readings on this connection
  nowSections: string[] = [] // what the connection that sent `now` was asked for
  report: Report | null = null
  reportError: string | null = null
  reportAt = 0
  stream: StreamState = 'off'
  denied = false // the server stopped allowing this account

  private host: Host
  private listeners = new Set<(s: Slice) => void>()
  private sections: string[] = []
  private visible = typeof document === 'undefined' || document.visibilityState !== 'hidden'
  private paused = false
  private closed = false
  private ctl: AbortController | null = null
  private retry: ReturnType<typeof setTimeout> | null = null
  private watchdog: ReturnType<typeof setTimeout> | null = null
  private tick: ReturnType<typeof setTimeout> | null = null
  private attempt = 0
  private tail = new Map<string, { t: number[]; v: number[] }>()
  private reportBusy = false
  private ranges = new Map<string, RangeEntry>()
  private wantReport = false
  private wantSeries: string[] = []
  private range = '1h'

  constructor(host: Host) { this.host = host }

  subscribe(fn: (s: Slice) => void) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
  private emit(s: Slice) { this.listeners.forEach((l) => l(s)) }

  async loadCatalog() {
    try {
      this.catalog = await this.host.request<Catalog>('GET', '/system/metrics')
      this.catalogError = null
    } catch (e) {
      this.catalogError = (e as Error).message || 'The statistics couldn’t be loaded.'
    }
    this.emit('catalog')
  }

  // ------------------------------------------------------------ the stream

  setSections(list: string[]) {
    if (list.join() === this.sections.join()) return
    this.sections = list
    if (!list.length) { this.closeStream(); this.setStream('off'); return }
    this.openStream()
  }

  setVisible(v: boolean) {
    if (v === this.visible) return
    this.visible = v
    if (v) { this.attempt = 0; this.openStream(); this.ensure() } else { this.closeStream(); this.setStream('hidden'); this.stopTick() }
  }

  setPaused(p: boolean) {
    if (p === this.paused) return
    this.paused = p
    if (p) { this.closeStream(); this.setStream('paused') } else { this.attempt = 0; this.openStream() }
  }
  get isPaused() { return this.paused }

  close() {
    this.closed = true
    this.closeStream()
    this.stopTick()
    this.setStream('off')
  }

  reopen() {
    this.closed = false
    this.openStream()
    this.ensure()
  }

  private setStream(s: StreamState) {
    if (s === this.stream) return
    this.stream = s
    this.emit('stream')
  }

  private closeStream() {
    this.ctl?.abort()
    this.ctl = null
    if (this.retry) { clearTimeout(this.retry); this.retry = null }
    if (this.watchdog) { clearTimeout(this.watchdog); this.watchdog = null }
  }

  private pet(ctl: AbortController) {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = setTimeout(() => ctl.abort(), WATCHDOG)
  }

  private openStream() {
    this.closeStream()
    if (this.closed || !this.catalog?.access.visible || !this.sections.length) return
    if (!this.visible) { this.setStream('hidden'); return }
    if (this.paused) { this.setStream('paused'); return }
    const ctl = new AbortController()
    this.ctl = ctl
    this.run = 0
    this.setStream(this.samples ? 'retrying' : 'connecting')
    void this.read(ctl)
  }

  private async read(ctl: AbortController) {
    let refused = false
    try {
      const headers: Record<string, string> = {}
      const tok = this.host.token?.()
      if (tok) headers.Authorization = 'Bearer ' + tok
      const res = await fetch((this.host.base?.() ?? '') + '/api/system/metrics/stream?sections=' + this.sections.join(','), { headers, credentials: 'same-origin', signal: ctl.signal })
      if (res.status === 401 || res.status === 403) { refused = true; throw new Error('refused') }
      if (!res.ok || !res.body) throw new Error('no stream')
      const reader = res.body.getReader()
      const frames = new FrameReader()
      this.pet(ctl)
      this.setStream('live')
      this.attempt = 0
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        this.pet(ctl)
        for (const f of frames.push(value)) {
          if (f.event !== 'sample') continue
          try { this.takeSample(JSON.parse(f.data) as MetricsNow) } catch { /* a bad frame is only a missed reading */ }
        }
      }
    } catch { /* a gone connection is handled below, the same as an ended one */ }
    if (ctl !== this.ctl) return // closed on purpose, or replaced by a newer one
    if (this.watchdog) { clearTimeout(this.watchdog); this.watchdog = null }
    this.ctl = null
    if (refused) {
      // Told no, perhaps because the owner changed who may look: ask what's allowed now.
      this.denied = true
      this.setStream('off')
      await this.loadCatalog()
      if (this.catalog?.access.visible && !this.closed && !this.ctl) this.retry = setTimeout(() => { this.retry = null; this.openStream() }, retryWait(this.attempt++))
      return
    }
    this.setStream('retrying')
    this.retry = setTimeout(() => { this.retry = null; this.openStream() }, retryWait(this.attempt++))
  }

  private takeSample(n: MetricsNow) {
    this.now = n
    this.nowSections = this.sections
    this.samples++
    this.run++
    const vals = seriesNow(n)
    // Left out of an answer when there are none, which is a real zero if it was asked for.
    if (this.sections.includes('streams')) vals.streams = n.streams?.length ?? 0
    if (this.sections.includes('games')) vals.games = n.games?.length ?? 0
    for (const k in vals) {
      let row = this.tail.get(k)
      if (!row) { row = { t: [], v: [] }; this.tail.set(k, row) }
      if (row.t[row.t.length - 1] === n.time) continue
      row.t.push(n.time)
      row.v.push(vals[k])
      if (row.t.length > KEEP) { row.t.shift(); row.v.shift() }
    }
    this.emit('now')
  }

  // ------------------------------------------------------------ report and histories

  // What's on screen now. Only what's on screen is fetched.
  setNeeds(report: boolean, series: string[], range: string) {
    this.wantReport = report
    this.wantSeries = series
    this.range = range
    this.ensure()
  }

  ensure() {
    if (this.closed || !this.visible || !this.catalog?.access.visible) return
    this.ensureReport()
    this.ensureHistory()
    this.stopTick()
    if (this.wantReport || this.wantSeries.length) this.tick = setTimeout(() => this.ensure(), MINUTE)
  }

  private stopTick() {
    if (this.tick) { clearTimeout(this.tick); this.tick = null }
  }

  retryReport() {
    this.reportAt = 0
    this.reportError = null
    this.emit('report')
    this.ensureReport()
  }

  private ensureReport() {
    if (!this.wantReport || this.reportBusy || Date.now() - this.reportAt < MINUTE) return
    this.reportBusy = true
    this.host.request<Report>('GET', '/system/metrics/report').then((r) => {
      this.report = r
      this.reportError = null
    }).catch((e) => {
      this.reportError = statusOf(e) === 403 ? 'This account can’t see this any more.' : 'The numbers couldn’t be added up just now.'
    }).finally(() => {
      this.reportAt = Date.now()
      this.reportBusy = false
      this.emit('report')
    })
  }

  private ensureHistory() {
    const allowed = this.catalog?.series ?? []
    const names = this.wantSeries.filter((n) => allowed.includes(n))
    if (!names.length) return
    let e = this.ranges.get(this.range)
    if (!e) { e = { blocks: [], loading: 0, error: false }; this.ranges.set(this.range, e) }
    const at = Date.now()
    const fresh = e.blocks.filter((b) => at - b.at < MINUTE)
    const have = new Set(fresh.flatMap((b) => Object.keys(b.data.series)))
    const stale = !fresh.length
    const ask = stale ? names : names.filter((n) => !have.has(n))
    if (!ask.length || e.loading) return
    const entry = e
    const range = this.range
    entry.loading++
    this.emit('history')
    this.host.request<History>('GET', `/system/metrics/history?range=${encodeURIComponent(range)}&series=${ask.join(',')}`).then((h) => {
      entry.blocks = stale ? [{ at: Date.now(), data: h }] : [...entry.blocks, { at: Date.now(), data: h }]
      entry.error = false
    }).catch(() => {
      // What was held stays on screen, and an empty block marks this as asked, so the next try
      // is a minute away.
      entry.error = true
      entry.blocks = [...entry.blocks.filter((b) => b.data.times.length), { at: Date.now(), data: { from: 0, to: 0, stepSec: 0, times: [], series: Object.fromEntries(ask.map((n) => [n, []])) } }]
    }).finally(() => {
      entry.loading--
      this.emit('history')
      this.ensureHistory() // anything that became wanted while this was on its way
    })
  }

  historyState(range: string): HistoryState {
    const e = this.ranges.get(range)
    if (!e) return 'loading'
    if (e.loading) return e.blocks.length ? 'ok' : 'loading'
    return e.error ? 'error' : 'ok'
  }

  // A series for this range: what the server has kept, with the readings since on the end, so a
  // chart moves while it's watched. On longer ranges those would only crowd the last pixel.
  seriesData(name: string, range: string): SeriesData | null {
    const e = this.ranges.get(range)
    let block: History | undefined
    if (e) for (const b of e.blocks) if (b.data.series[name]?.length) block = b.data
    const base: SeriesData = block ? { times: block.times, values: block.series[name], peak: block.peak?.[name] } : { times: [], values: [] }
    const live = this.tail.get(name)
    if (!live?.t.length) return block ? base : null
    // With nothing kept yet, every reading since opening is all there is to draw.
    const stride = !base.times.length || range === '15m' ? 1 : range === '1h' ? 5 : range === '6h' ? 30 : 0
    const after = base.times[base.times.length - 1] ?? 0
    const times = [...base.times], values = [...base.values]
    const peak = base.peak ? [...base.peak] : undefined
    const last = live.t.length - 1
    for (let i = 0; i <= last; i++) {
      if (live.t[i] <= after) continue
      if (i !== last && (!stride || (last - i) % stride !== 0)) continue
      times.push(live.t[i]); values.push(live.v[i])
      if (peak) peak.push(live.v[i])
    }
    return { times, values, peak }
  }
}
