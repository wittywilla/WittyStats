// What each widget shows, worked out from what's been received. Plain data in, plain data out:
// the drawing is in charts.tsx, and one set of numbers feeds the chart, the table, the text a
// screen reader gets and the exports, so they can never disagree.
import type { Cell, Column, Row, Table } from './exports.ts'
import { fmtAgo, fmtBits, fmtBytes, fmtBytesRate, fmtCelsius, fmtCount, fmtDate, fmtDuration, fmtFps, fmtKbps, fmtMbps, fmtMs, fmtPercent, formatValue, type Kind } from './format.ts'
import type { Catalog, MetricsNow, Report, ReportCount } from './types.ts'
import { WIDGET_BY_ID, availability, type WidgetDef } from './widgets.ts'

export type Level = 'ok' | 'warn' | 'danger'
export type Figure = { label: string; value: string; sub?: string; big?: boolean }
export type Meter = { label: string; pct: number; text: string; level?: Level; word?: string }
export type SeriesSpec = { key: string; name: string; slot: 1 | 2 | 3 | 0; times: number[]; values: number[]; peak?: number[] }
export type LineSpec = { id: string; title: string; kind: Kind; yMax?: number; series: SeriesSpec[]; from: number; to: number; over: string; message?: string; waiting?: boolean; summary: string }
export type BarRow = { label: string; value: number; text: string }
export type BarsSpec = { title: string; rows: BarRow[]; summary: string; more?: number }
export type ColumnSeries = { name: string; values: number[]; tone: 'accent' | 'warn' | 'danger' }
export type ColumnsSpec = { title: string; labels: string[]; series: ColumnSeries[]; kind: Kind; yMax?: number; summary: string; xTitle?: string; every: number }
export type Tag = { text: string; tone?: Level }
export type Item = { key: string; title: string; sub?: string; tags?: Tag[]; facts?: { label: string; value: string }[]; meters?: Meter[]; note?: string }
export type View = {
  state: 'ok' | 'loading' | 'empty' | 'error'
  message?: string
  retry?: 'report'
  figures?: Figure[]
  meters?: Meter[]
  lines?: LineSpec[]
  columns?: ColumnsSpec[]
  bars?: BarsSpec[]
  items?: Item[]
  more?: string
  notes?: string[]
  tables: Table[]
  summary: string
}

export type SeriesData = { times: number[]; values: number[]; peak?: number[] }
export type HistoryState = 'loading' | 'ok' | 'error' | 'none'
export type Ctx = {
  catalog: Catalog
  now: MetricsNow | null
  samples: number // how many readings have come in on this connection
  nowSections?: string[] // what the reading in `now` was asked for
  report: Report | null
  reportError: string | null
  range: string
  series: (name: string) => SeriesData | null
  history: HistoryState
  clock: number // seconds, the server's where known
}

const RANGE_SECONDS: Record<string, number> = { '15m': 900, '1h': 3600, '6h': 21600, '24h': 86400, '7d': 604800, '30d': 2592000, '90d': 7776000 }
const RANGE_NAMES: Record<string, string> = { '15m': '15 min', '1h': '1 hr', '6h': '6 hr', '24h': '24 hr', '7d': '7 days', '30d': '30 days', '90d': '90 days' }
const RANGE_WORDS: Record<string, string> = { '15m': 'the last 15 minutes', '1h': 'the last hour', '6h': 'the last 6 hours', '24h': 'the last 24 hours', '7d': 'the last 7 days', '30d': 'the last 30 days', '90d': 'the last 90 days' }
export const rangeSeconds = (r: string) => RANGE_SECONDS[r] ?? 3600
export const rangeName = (r: string) => RANGE_NAMES[r] ?? r
export const rangeWords = (r: string) => RANGE_WORDS[r] ?? r

const col = (key: string, label: string, kind: Kind = 'text'): Column => ({ key, label, kind })
const table = (caption: string, columns: Column[], rows: Row[], note?: string): Table => ({ caption, columns, rows, note })

const usage = (p: number, warn = 85, danger = 95): { level?: Level; word?: string } =>
  p >= danger ? { level: 'danger', word: 'Very high' } : p >= warn ? { level: 'warn', word: 'High' } : {}
const fullness = (p: number) => (p >= 95 ? { level: 'danger' as Level, word: 'Almost full' } : p >= 90 ? { level: 'warn' as Level, word: 'Nearly full' } : {})
const heat = (c: number) => (c >= 90 ? { level: 'danger' as Level, word: 'Very hot' } : c >= 80 ? { level: 'warn' as Level, word: 'Hot' } : {})

const plural = (n: number, one: string, many = one + 's') => `${fmtCount(n)} ${n === 1 ? one : many}`
const nice = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const resolution = (w?: number, h?: number) => (w && h ? `${w} × ${h}` : '')

// ---------------------------------------------------------------- charts over time

function stats(values: number[]) {
  let sum = 0, peak = 0
  for (const v of values) { sum += v; if (v > peak) peak = v }
  return { avg: values.length ? sum / values.length : 0, peak, last: values[values.length - 1] ?? 0 }
}

function lineSpec(c: Ctx, id: string, title: string, kind: Kind, wanted: { key: string; name: string }[], yMax: number | undefined, detail: boolean): LineSpec {
  const span = rangeSeconds(c.range)
  const raw = wanted.map((w, i) => ({ ...w, data: c.series(w.key), slot: (i + 1) as 1 | 2 | 3 }))
  let to = 0
  for (const r of raw) to = Math.max(to, r.data?.times[r.data.times.length - 1] ?? 0)
  to = Math.max(to, c.clock)
  const from = to - span
  const series: SeriesSpec[] = []
  for (const r of raw) {
    if (!r.data) continue
    const start = r.data.times.findIndex((t) => t >= from)
    if (start < 0) continue
    series.push({ key: r.key, name: r.name, slot: r.slot, times: r.data.times.slice(start), values: r.data.values.slice(start), peak: r.data.peak?.slice(start) })
  }
  const enough = series.some((s) => s.times.length >= 2)
  let message: string | undefined
  let waiting = false
  if (!enough) {
    if (c.history === 'loading') { message = 'Loading the history…'; waiting = true }
    else if (c.history === 'error') message = 'The history couldn’t be loaded. It’s tried again every minute.'
    else message = `Nothing recorded for ${rangeWords(c.range)} yet. The server keeps a reading a minute.`
  }
  // In the detail view, one series gets its highest readings drawn too, when each point stands
  // for several. With more than one the lines would tangle, so those stay in the table.
  if (detail && series.length === 1 && series[0].peak?.length) {
    const s = series[0]
    series.push({ key: s.key + '-peak', name: `${s.name}, highest`, slot: 0, times: s.times, values: s.peak! })
  }
  const words = series.filter((s) => s.slot !== 0).map((s) => {
    const st = stats(s.values)
    return `${s.name} now ${formatValue(kind, st.last)}, average ${formatValue(kind, st.avg)}, highest ${formatValue(kind, st.peak)}`
  })
  const summary = enough ? `${title} over ${rangeWords(c.range)}. ${words.join('. ')}.` : `${title} over ${rangeWords(c.range)}. ${message}`
  return { id, title, kind, yMax, series, from, to, over: rangeWords(c.range), message, waiting, summary }
}

function historyTable(spec: LineSpec, detail: boolean): Table | null {
  const real = spec.series.filter((s) => s.slot !== 0)
  if (!real.some((s) => s.times.length)) return null
  const rows = new Map<number, Row>()
  for (const s of real) {
    s.times.forEach((t, i) => {
      let r = rows.get(t)
      if (!r) { r = { time: t }; rows.set(t, r) }
      r[s.key] = s.values[i]
      if (detail && s.peak?.length) r[s.key + 'Peak'] = s.peak[i]
    })
  }
  const columns: Column[] = [col('time', 'Time', 'time')]
  for (const s of real) {
    columns.push(col(s.key, s.name, spec.kind))
    if (detail && s.peak?.length) columns.push(col(s.key + 'Peak', `${s.name}, highest`, spec.kind))
  }
  return table(`${spec.title} over ${spec.over}, newest first`, columns, [...rows.values()].sort((a, b) => (b.time as number) - (a.time as number)))
}

function withLines(v: View, specs: LineSpec[], detail: boolean): View {
  const tables = specs.map((s) => historyTable(s, detail)).filter((t): t is Table => !!t)
  return { ...v, lines: [...(v.lines ?? []), ...specs], tables: [...v.tables, ...tables], summary: [v.summary, ...specs.map((s) => s.summary)].filter(Boolean).join(' ') }
}

const empty = (message: string, tables: Table[] = []): View => ({ state: 'empty', message, tables, summary: message })

// ---------------------------------------------------------------- bars

function bars(title: string, rows: BarRow[], limit: number, detail: boolean, unitWord = ''): BarsSpec {
  const shown = detail ? rows : rows.slice(0, limit)
  const top = rows[0]
  const summary = top ? `${title}: ${plural(rows.length, 'entry', 'entries')}${unitWord}. Largest is ${top.label} at ${top.text}.` : title
  return { title, rows: shown, summary, more: rows.length - shown.length || undefined }
}

const countRow = (c: ReportCount): Row => ({ name: c.name, items: c.items, bytes: c.bytes })
const countCols = (name: string) => [col('name', name), col('items', 'Files', 'count'), col('bytes', 'Size', 'bytes')]
const countText = (c: ReportCount) => `${fmtBytes(c.bytes)}, ${plural(c.items, 'file')}`

// ---------------------------------------------------------------- each widget

type Builder = (c: Ctx, detail: boolean) => View

const NOT_YET = 'Waiting for the first reading…'
// The first reading on a new connection can come before the sampler has looked at anything, so
// a part missing from it isn't news. If it's still missing after that, it's really not there.
const missing = (c: Ctx, later: string): View => (c.samples < 2 ? { state: 'loading', message: NOT_YET, tables: [], summary: NOT_YET } : empty(later))

const LIBRARY_TYPES: Record<string, string> = {
  movies: 'Movies', shows: 'TV shows', discs: 'Discs', anime: 'Anime', music: 'Music', audiobooks: 'Audiobooks', podcasts: 'Podcasts', books: 'Books and comics', videos: 'Home videos',
  photos: 'Photos', shorts: 'Vertical videos', channels: 'Creator videos', musicvideos: 'Music videos', radio: 'Internet radio', games: 'Games', commercials: 'Commercials',
}
const typeName = (t: string) => LIBRARY_TYPES[t] ?? nice(t)

const DECISIONS: Record<string, { word: string; about: string; tone?: Level }> = {
  direct: { word: 'Direct', about: 'sent as it is' },
  remux: { word: 'Remux', about: 'same picture, new wrapper' },
  transcode: { word: 'Transcode', about: 'being converted' },
}
// Why something isn't sent as it is, in words. The server's codes are in internal/playback.
const REASONS: Record<string, string> = {
  forced: 'asked to convert', 'direct-play-off': 'direct play is turned off', container: 'the device can’t open this kind of file', 'video-codec': 'the device can’t play this picture format',
  'video-tag': 'the device refuses how this picture is labelled', 'video-height': 'the picture is bigger than allowed', 'video-bitrate': 'more data than the device can take',
  'video-depth': 'the device can’t show 10-bit picture', 'video-range': 'the display can’t show this HDR', interlaced: 'the picture is interlaced', 'audio-codec': 'the device can’t play this sound format',
  'audio-channels': 'more sound channels than the device takes', 'audio-track': 'the device can’t switch sound tracks in a file', subtitle: 'subtitles have to be drawn on', 'no-video': 'there’s no picture',
  'burn-subtitle': 'asked for subtitles drawn on', 'hls-video-codec': 'this picture format can’t be streamed as it is', 'remux-unavailable': 'this device doesn’t take a new wrapper',
}
const reasonsText = (list?: string[]) => (list ?? []).map((r) => REASONS[r] ?? r).join('; ')
const decisionOf = (d: string) => DECISIONS[d] ?? { word: nice(d), about: '' }
const ownView = (c: Ctx) => !c.catalog.access.full

const BUILDERS: Record<string, Builder> = {
  cpu(c, detail) {
    const cpu = c.now?.cpu
    if (!cpu) return missing(c, 'The server didn’t send a processor reading.')
    const v: View = {
      state: 'ok', figures: [{ label: 'In use now', value: fmtPercent(cpu.percent), sub: plural(cpu.cores.length, 'core'), big: true }],
      tables: [table('Processor now', [col('what', 'What'), col('value', 'In use', 'pct')], [{ what: 'All cores', value: cpu.percent }])],
      summary: `Processor is ${fmtPercent(cpu.percent)} in use across ${plural(cpu.cores.length, 'core')}.`,
    }
    return withLines(v, [lineSpec(c, 'cpu', 'Processor use', 'pct', [{ key: 'cpu', name: 'In use' }], 100, detail)], detail)
  },
  cores(c) {
    const cpu = c.now?.cpu
    if (!cpu) return missing(c, 'The server didn’t send a processor reading.')
    if (!cpu.cores.length) return empty('This system doesn’t report its cores one by one.')
    const busiest = cpu.cores.reduce((b, v, i) => (v > cpu.cores[b] ? i : b), 0)
    const summary = `${plural(cpu.cores.length, 'core')}. The busiest is core ${busiest + 1} at ${fmtPercent(cpu.cores[busiest])}, and the average is ${fmtPercent(cpu.percent)}.`
    return {
      state: 'ok',
      columns: [{ title: 'Each core', labels: cpu.cores.map((_, i) => String(i + 1)), series: [{ name: 'In use', values: cpu.cores, tone: 'accent' }], kind: 'pct', yMax: 100, summary, xTitle: 'Core', every: Math.max(1, Math.ceil(cpu.cores.length / 8)) }],
      tables: [table('Each processor core now', [col('core', 'Core', 'count'), col('value', 'In use', 'pct')], cpu.cores.map((v, i) => ({ core: i + 1, value: v })))],
      summary,
    }
  },
  temperature(c) {
    const temps = c.now?.cpu?.temps
    if (!temps?.length) return missing(c, 'No sensor has reported yet. They’re read every 30 seconds.')
    const hottest = temps.reduce((a, b) => (b.celsius > a.celsius ? b : a))
    const summary = `${plural(temps.length, 'sensor')}. The hottest is ${hottest.name} at ${fmtCelsius(hottest.celsius)}.`
    return {
      state: 'ok', summary,
      figures: [{ label: 'Hottest', value: fmtCelsius(hottest.celsius), sub: hottest.name, big: true }],
      meters: temps.slice(0, 8).map((t) => ({ label: t.name, pct: Math.min(100, t.celsius), text: fmtCelsius(t.celsius), ...heat(t.celsius) })),
      tables: [table('Temperature sensors now', [col('name', 'Sensor'), col('celsius', 'Temperature', 'celsius')], temps.map((t) => ({ name: t.name, celsius: t.celsius })))],
    }
  },
  memory(c, detail) {
    const m = c.now?.memory
    if (!m) return missing(c, 'The server didn’t send a memory reading.')
    const pct = m.total ? (m.used / m.total) * 100 : 0
    const v: View = {
      state: 'ok', summary: `Memory is ${fmtPercent(pct)} in use: ${fmtBytes(m.used)} of ${fmtBytes(m.total)}.`,
      figures: [{ label: 'In use now', value: fmtBytes(m.used), sub: `${fmtPercent(pct)} of ${fmtBytes(m.total)}`, big: true }, { label: 'Available', value: fmtBytes(m.available) }],
      tables: [table('Memory now', [col('what', 'What'), col('bytes', 'Amount', 'bytes')], [{ what: 'In use', bytes: m.used }, { what: 'Available', bytes: m.available }, { what: 'Total', bytes: m.total }])],
    }
    return withLines(v, [lineSpec(c, 'memory', 'Memory use', 'pct', [{ key: 'memory', name: 'In use' }], 100, detail)], detail)
  },
  swap(c, detail) {
    const m = c.now?.memory
    if (!m) return missing(c, 'The server didn’t send a memory reading.')
    if (!m.swapTotal) return empty('This machine has no swap set up.')
    const pct = (m.swapUsed / m.swapTotal) * 100
    const v: View = {
      state: 'ok', summary: `Swap is ${fmtPercent(pct)} in use: ${fmtBytes(m.swapUsed)} of ${fmtBytes(m.swapTotal)}.`,
      meters: [{ label: 'In use', pct, text: `${fmtBytes(m.swapUsed)} of ${fmtBytes(m.swapTotal)}`, ...usage(pct, 50, 80) }],
      tables: [table('Swap now', [col('what', 'What'), col('bytes', 'Amount', 'bytes')], [{ what: 'In use', bytes: m.swapUsed }, { what: 'Total', bytes: m.swapTotal }])],
    }
    return withLines(v, [lineSpec(c, 'swap', 'Swap use', 'pct', [{ key: 'swap', name: 'In use' }], 100, detail)], detail)
  },
  gpu(c) {
    const list = c.now?.gpu
    if (!list?.length) return missing(c, 'No graphics card has reported yet.')
    const items: Item[] = list.map((g, i) => {
      const meters: Meter[] = []
      if (g.percent !== undefined) meters.push({ label: 'Busy', pct: g.percent, text: fmtPercent(g.percent), ...usage(g.percent) })
      if (g.encoderPercent !== undefined) meters.push({ label: 'Encoder', pct: g.encoderPercent, text: fmtPercent(g.encoderPercent) })
      if (g.decoderPercent !== undefined) meters.push({ label: 'Decoder', pct: g.decoderPercent, text: fmtPercent(g.decoderPercent) })
      if (g.memoryUsed !== undefined && g.memoryTotal) {
        const p = (g.memoryUsed / g.memoryTotal) * 100
        meters.push({ label: 'Graphics memory', pct: p, text: `${fmtBytes(g.memoryUsed)} of ${fmtBytes(g.memoryTotal)}`, ...usage(p) })
      }
      const facts: { label: string; value: string }[] = []
      if (g.encoderSessions !== undefined) facts.push({ label: 'Encoder sessions', value: fmtCount(g.encoderSessions) })
      if (g.encoderFps !== undefined) facts.push({ label: 'Encoder speed', value: fmtFps(g.encoderFps) })
      if (g.celsius !== undefined) facts.push({ label: 'Temperature', value: fmtCelsius(g.celsius) })
      return { key: g.name + i, title: g.name, meters, facts }
    })
    return {
      state: 'ok', items,
      summary: list.map((g) => `${g.name}${g.percent !== undefined ? ` is ${fmtPercent(g.percent)} busy` : ''}${g.encoderSessions !== undefined ? `, with ${plural(g.encoderSessions, 'encoder session')}` : ''}.`).join(' '),
      tables: [table('Graphics cards now', [col('name', 'Card'), col('percent', 'Busy', 'pct'), col('encoder', 'Encoder', 'pct'), col('decoder', 'Decoder', 'pct'), col('used', 'Memory used', 'bytes'), col('total', 'Memory total', 'bytes'), col('sessions', 'Encoder sessions', 'count'), col('fps', 'Encoder speed', 'fps'), col('celsius', 'Temperature', 'celsius')],
        list.map((g) => ({ name: g.name, percent: g.percent, encoder: g.encoderPercent, decoder: g.decoderPercent, used: g.memoryUsed, total: g.memoryTotal, sessions: g.encoderSessions, fps: g.encoderFps, celsius: g.celsius })))],
    }
  },
  disks(c, detail) {
    const vols = c.now?.volumes
    if (!vols?.length) return missing(c, 'The server didn’t list any disks.')
    const shown = detail ? vols : vols.slice(0, 6)
    const items: Item[] = shown.map((v) => {
      const used = v.total - v.free, pct = v.total ? (used / v.total) * 100 : 0
      return { key: v.mount, title: v.mount, sub: [nice(v.kind), v.type].filter(Boolean).join(', '), meters: [{ label: 'Used', pct, text: `${fmtBytes(v.free)} free of ${fmtBytes(v.total)}`, ...fullness(pct) }] }
    })
    const tightest = vols.reduce((a, b) => ((b.total ? (b.total - b.free) / b.total : 0) > (a.total ? (a.total - a.free) / a.total : 0) ? b : a))
    const tightPct = tightest.total ? ((tightest.total - tightest.free) / tightest.total) * 100 : 0
    return {
      state: 'ok', items, more: vols.length > shown.length ? `${plural(vols.length - shown.length, 'more disk')} in the details.` : undefined,
      summary: `${plural(vols.length, 'disk')}. The fullest is ${tightest.mount} at ${fmtPercent(tightPct)}, with ${fmtBytes(tightest.free)} free.`,
      tables: [table('Disk space now', [col('mount', 'Disk'), col('kind', 'Kind'), col('type', 'Format'), col('used', 'Used', 'pct'), col('free', 'Free', 'bytes'), col('total', 'Total', 'bytes')],
        vols.map((v) => ({ mount: v.mount, kind: nice(v.kind), type: v.type, used: v.total ? ((v.total - v.free) / v.total) * 100 : 0, free: v.free, total: v.total })))],
    }
  },
  diskio(c, detail) {
    const disks = c.now?.disks
    if (!disks?.length) return missing(c, 'The server didn’t send disk speeds.')
    const hasBusy = disks.some((d) => d.busyPercent !== undefined)
    const sorted = [...disks].sort((a, b) => b.readRate + b.writeRate - a.readRate - a.writeRate)
    const shown = detail ? sorted : sorted.slice(0, 4)
    const items: Item[] = shown.map((d) => ({
      key: d.name, title: d.name,
      facts: [{ label: 'Reading', value: fmtBytesRate(d.readRate) }, { label: 'Writing', value: fmtBytesRate(d.writeRate) }],
      meters: d.busyPercent !== undefined ? [{ label: 'Busy', pct: d.busyPercent, text: fmtPercent(d.busyPercent), ...usage(d.busyPercent) }] : undefined,
    }))
    const rd = disks.reduce((n, d) => n + d.readRate, 0), wr = disks.reduce((n, d) => n + d.writeRate, 0)
    const v: View = {
      state: 'ok', items, more: disks.length > shown.length ? `${plural(disks.length - shown.length, 'quieter disk')} in the details.` : undefined,
      summary: `${plural(disks.length, 'disk')}. Reading ${fmtBytesRate(rd)} and writing ${fmtBytesRate(wr)} altogether.`,
      tables: [table('Disk speed now', [col('name', 'Disk'), col('read', 'Reading', 'bytesRate'), col('write', 'Writing', 'bytesRate'), ...(hasBusy ? [col('busy', 'Busy', 'pct')] : [])],
        sorted.map((d) => ({ name: d.name, read: d.readRate, write: d.writeRate, busy: d.busyPercent })))],
    }
    return withLines(v, [lineSpec(c, 'diskio', 'Disk speed, all disks', 'bytesRate', [{ key: 'diskRead', name: 'Reading' }, { key: 'diskWrite', name: 'Writing' }], undefined, detail)], detail)
  },
  network(c, detail) {
    const nets = c.now?.net
    if (!nets?.length) return missing(c, 'The server didn’t send network readings.')
    const sorted = [...nets].sort((a, b) => b.rxRate + b.txRate - a.rxRate - a.txRate || b.rxBytes + b.txBytes - a.rxBytes - a.txBytes)
    const used = sorted.filter((n) => n.up || n.rxBytes || n.txBytes)
    const shown = detail ? sorted : used.slice(0, 3)
    const items: Item[] = shown.map((n) => ({
      key: n.name, title: n.name,
      sub: n.speedMbps ? `${fmtMbps(n.speedMbps)} link` : undefined,
      tags: n.up ? undefined : [{ text: 'Not connected' }],
      facts: [{ label: 'Receiving', value: fmtBits(n.rxRate * 8) }, { label: 'Sending', value: fmtBits(n.txRate * 8) }, ...(n.rxErrs + n.txErrs ? [{ label: 'Errors', value: fmtCount(n.rxErrs + n.txErrs) }] : [])],
    }))
    const rx = nets.reduce((a, n) => a + n.rxRate, 0), tx = nets.reduce((a, n) => a + n.txRate, 0)
    const v: View = {
      state: 'ok', items, more: nets.length > shown.length ? `${plural(nets.length - shown.length, 'more connection')} in the details.` : undefined,
      summary: `${plural(nets.length, 'connection')}. Receiving ${fmtBits(rx * 8)} and sending ${fmtBits(tx * 8)} altogether.`,
      tables: [table('Network connections now', [col('name', 'Connection'), col('up', 'Connected'), col('rx', 'Receiving', 'bitsRate'), col('tx', 'Sending', 'bitsRate'), col('rxTotal', 'Received in all', 'bytes'), col('txTotal', 'Sent in all', 'bytes'), col('errs', 'Errors', 'count'), col('speed', 'Link speed', 'mbps')],
        sorted.map((n) => ({ name: n.name, up: n.up ? 'Yes' : 'No', rx: n.rxRate, tx: n.txRate, rxTotal: n.rxBytes, txTotal: n.txBytes, errs: n.rxErrs + n.txErrs, speed: n.speedMbps })))],
    }
    return withLines(v, [lineSpec(c, 'network', 'Network traffic, all connections', 'bitsRate', [{ key: 'netRx', name: 'Receiving' }, { key: 'netTx', name: 'Sending' }], undefined, detail)], detail)
  },
  process(c, detail) {
    const p = c.now?.process
    if (!p) return missing(c, 'The server didn’t send its own numbers.')
    const figures: Figure[] = [
      { label: 'Processor', value: fmtPercent(p.cpuPercent), sub: 'of the whole machine' },
      { label: 'Memory', value: fmtBytes(p.rss), sub: 'what it holds' },
      { label: 'Heap', value: fmtBytes(p.heapAlloc), sub: `of ${fmtBytes(p.heapSys)} set aside` },
      { label: 'Goroutines', value: fmtCount(p.goroutines), sub: 'small jobs inside it' },
    ]
    if (p.threads) figures.push({ label: 'Threads', value: fmtCount(p.threads) })
    if (p.handles) figures.push({ label: 'Handles', value: fmtCount(p.handles), sub: 'files and connections' })
    figures.push({ label: 'Last memory clean-up', value: fmtMs(p.gcPauseMs), sub: plural(p.numGC, 'clean-up') + ' so far' })
    figures.push({ label: 'Running for', value: fmtDuration(p.uptimeSec) })
    const v: View = {
      state: 'ok', figures,
      summary: `The server is using ${fmtPercent(p.cpuPercent)} of the processor and ${fmtBytes(p.rss)} of memory, and has been running for ${fmtDuration(p.uptimeSec)}.`,
      tables: [table('This server now', [col('what', 'What'), col('value', 'Value')], figures.map((f) => ({ what: f.label, value: f.value })))],
    }
    const specs = [lineSpec(c, 'process-memory', 'Memory held by the server', 'bytes', [{ key: 'rss', name: 'Memory' }, { key: 'heap', name: 'Heap' }], undefined, detail)]
    if (detail) {
      specs.push(lineSpec(c, 'process-cpu', 'Processor used by the server', 'pct', [{ key: 'processCpu', name: 'In use' }], undefined, detail))
      specs.push(lineSpec(c, 'process-go', 'Goroutines', 'count', [{ key: 'goroutines', name: 'Goroutines' }], undefined, detail))
    }
    return withLines(v, specs, detail)
  },
  uptime(c) {
    const s = c.now?.server
    if (!s) return missing(c, 'The server didn’t send this reading.')
    const facts = [{ label: 'Version', value: s.version }, { label: 'System', value: `${s.os} on ${s.arch}` }]
    return {
      state: 'ok',
      figures: [{ label: s.name ? `${s.name} has been running for` : 'Running for', value: fmtDuration(s.uptimeSec), big: true }],
      items: [{ key: 'server', title: '', facts, tags: s.updateAvailable ? [{ text: `Update available: ${s.updateAvailable}`, tone: 'warn' }] : undefined }],
      summary: `The server has been running for ${fmtDuration(s.uptimeSec)}. Version ${s.version}${s.updateAvailable ? `, with an update available: ${s.updateAvailable}` : ''}.`,
      tables: [table('The server', [col('what', 'What'), col('value', 'Value')], [{ what: 'Running for', value: fmtDuration(s.uptimeSec) }, { what: 'Version', value: s.version }, { what: 'System', value: `${s.os} on ${s.arch}` }, ...(s.updateAvailable ? [{ what: 'Update available', value: s.updateAvailable }] : [])])],
    }
  },
  modules(c, detail) {
    const list = c.now?.modules
    if (!list?.length) return c.samples < 1 ? { state: 'loading', message: NOT_YET, tables: [], summary: NOT_YET } : empty('No modules here yet.')
    const updates = list.filter((m) => m.installed && m.latest && m.latest !== m.version)
    const installed = list.filter((m) => m.installed)
    const failed = list.filter((m) => m.error)
    const sorted = [...list].sort((a, b) => Number(!!b.error) - Number(!!a.error) || Number(!!(b.latest && b.latest !== b.version && b.installed)) - Number(!!(a.latest && a.latest !== a.version && a.installed)) || Number(b.installed) - Number(a.installed) || a.name.localeCompare(b.name))
    const shown = detail ? sorted : sorted.filter((m) => m.installed).slice(0, 5)
    return {
      state: 'ok',
      figures: [{ label: 'Installed', value: fmtCount(installed.length) }, { label: 'Updates waiting', value: fmtCount(updates.length) }],
      items: shown.map((m) => ({
        key: m.id, title: m.name, sub: m.installed ? `Version ${m.version}` : 'Not installed',
        tags: [
          ...(m.error ? [{ text: 'Problem', tone: 'danger' as Level }] : []),
          ...(m.installed && m.latest && m.latest !== m.version ? [{ text: `Update to ${m.latest}`, tone: 'warn' as Level }] : m.installed ? [{ text: 'Up to date' }] : []),
          ...(m.phase && m.phase !== 'idle' ? [{ text: nice(m.phase) }] : []),
        ],
        note: detail ? m.error : undefined,
      })),
      more: !detail && sorted.length > shown.length ? `${plural(sorted.length - shown.length, 'more module')} in the details.` : undefined,
      summary: `${plural(installed.length, 'module')} installed, ${plural(updates.length, 'update')} waiting${failed.length ? `, ${plural(failed.length, 'problem')}` : ''}.`,
      tables: [table('Modules', [col('name', 'Module'), col('state', 'State'), col('version', 'Version'), col('latest', 'Newest'), col('error', 'Problem')],
        sorted.map((m) => ({ name: m.name, state: m.installed ? 'Installed' : 'Not installed', version: m.version, latest: m.latest, error: m.error })))],
    }
  },
  tasks(c) {
    const t = c.now?.tasks
    if (!t) return missing(c, 'The server didn’t send this reading.')
    const running = Math.max(0, t.active - t.paused)
    if (!t.active && !t.queued) {
      return { ...empty('Nothing going on in the background.', [table('Background work now', [col('what', 'What'), col('count', 'How many', 'count')], [{ what: 'Running', count: 0 }, { what: 'Paused', count: 0 }, { what: 'Waiting', count: 0 }])]) }
    }
    return {
      state: 'ok',
      figures: [{ label: 'Running', value: fmtCount(running) }, { label: 'Paused', value: fmtCount(t.paused) }, { label: 'Waiting', value: fmtCount(t.queued) }],
      meters: t.percent >= 0 ? [{ label: 'Done so far', pct: t.percent, text: fmtPercent(t.percent) }] : undefined,
      summary: `${fmtCount(running)} running, ${fmtCount(t.paused)} paused, ${fmtCount(t.queued)} waiting${t.percent >= 0 ? `, ${fmtPercent(t.percent)} done` : ''}.`,
      tables: [table('Background work now', [col('what', 'What'), col('count', 'How many', 'count')], [{ what: 'Running', count: running }, { what: 'Paused', count: t.paused }, { what: 'Waiting', count: t.queued }])],
    }
  },
  database(c) {
    const r = c.report!, db = r.database
    if (!db) return empty('The size of the database isn’t known yet.')
    const summary = `The database is ${fmtBytes(db.bytes + db.walBytes)}: ${fmtBytes(db.bytes)} in the main file and ${fmtBytes(db.walBytes)} not yet written in.`
    return {
      state: 'ok', summary,
      figures: [{ label: 'Size', value: fmtBytes(db.bytes + db.walBytes), big: true }, { label: 'Main file', value: fmtBytes(db.bytes) }, { label: 'Not yet written in', value: fmtBytes(db.walBytes) }],
      tables: [table('The database', [col('what', 'What'), col('bytes', 'Size', 'bytes')], [{ what: 'Main file', bytes: db.bytes }, { what: 'Not yet written in', bytes: db.walBytes }])],
    }
  },
  caches(c, detail) {
    const list = c.report!.caches
    if (!list?.length) return empty('There’s nothing in the caches yet.')
    const sorted = [...list].sort((a, b) => b.bytes - a.bytes)
    const partial = sorted.some((x) => x.partial)
    const rows = sorted.map((x) => ({ label: x.name, value: x.bytes, text: (x.partial ? 'at least ' : '') + fmtBytes(x.bytes) }))
    const spec = bars('Caches', rows, 6, detail)
    return {
      state: 'ok', bars: [spec], summary: spec.summary,
      notes: partial ? ['A folder too big to count quickly says “at least”.'] : undefined,
      tables: [table('Caches', [col('name', 'Folder'), col('bytes', 'Size', 'bytes'), col('files', 'Files', 'count'), col('counted', 'Fully counted')], sorted.map((x) => ({ name: x.name, bytes: x.bytes, files: x.files, counted: x.partial ? 'No' : 'Yes' })))],
    }
  },
  logs(c) {
    const r = c.report!
    const hours = r.logs ?? []
    const byHour = new Map(hours.map((h) => [h.hour, h]))
    const end = r.generatedAt - (r.generatedAt % 3600)
    const labels: string[] = [], warnings: number[] = [], errors: number[] = []
    for (let h = end - 23 * 3600; h <= end; h += 3600) {
      const v = byHour.get(h)
      labels.push(new Date(h * 1000).toLocaleTimeString(undefined, { hour: 'numeric' }))
      warnings.push(v?.warnings ?? 0)
      errors.push(v?.errors ?? 0)
    }
    const wn = warnings.reduce((a, b) => a + b, 0), er = errors.reduce((a, b) => a + b, 0)
    const summary = `Over the last day: ${plural(er, 'error')} and ${plural(wn, 'warning')}.`
    const tables = [table('Warnings and errors by hour, newest first', [col('hour', 'Hour', 'time'), col('warnings', 'Warnings', 'count'), col('errors', 'Errors', 'count')],
      [...hours].sort((a, b) => b.hour - a.hour).map((h) => ({ hour: h.hour, warnings: h.warnings, errors: h.errors })))]
    if (!wn && !er) return { ...empty('No warnings or errors in the last day.', tables), summary }
    return {
      state: 'ok', summary, tables,
      figures: [{ label: 'Errors', value: fmtCount(er) }, { label: 'Warnings', value: fmtCount(wn) }],
      columns: [{ title: 'By hour', labels, series: [{ name: 'Warnings', values: warnings, tone: 'warn' }, { name: 'Errors', values: errors, tone: 'danger' }], kind: 'count', summary, every: 6 }],
    }
  },
  streams(c, detail) {
    const list = c.now?.streams ?? []
    const columns = [col('user', 'Person'), col('device', 'Device'), col('title', 'Playing'), col('decision', 'How'), col('reasons', 'Why'), col('sending', 'Sending', 'kbps'), col('file', 'File’s own rate', 'kbps'), col('res', 'Picture'), col('where', 'From'), col('bytes', 'Sent so far', 'bytes'), col('started', 'Started', 'time')]
    if (!c.now) return { state: 'loading', message: NOT_YET, tables: [], summary: NOT_YET }
    if (!list.length) return empty(ownView(c) ? 'You aren’t playing anything right now.' : 'Nobody is playing anything right now.', [table('Playing now', columns, [])])
    const converting = list.filter((s) => s.decision === 'transcode').length
    const sending = list.reduce((n, s) => n + s.sendingKbps, 0)
    const sorted = [...list].sort((a, b) => a.startedAt - b.startedAt)
    const shown = detail ? sorted : sorted.slice(0, 6)
    return {
      state: 'ok',
      figures: [{ label: 'Playing', value: fmtCount(list.length), big: true }, { label: 'Being converted', value: fmtCount(converting) }, { label: 'Sending', value: fmtKbps(sending) }],
      items: shown.map((s) => {
        const d = decisionOf(s.decision)
        return {
          key: s.id, title: s.title || 'Something untitled', sub: [s.user, s.device].filter(Boolean).join(' on '),
          tags: [{ text: d.about ? `${d.word}: ${d.about}` : d.word, tone: d.tone }],
          facts: [{ label: 'Sending', value: fmtKbps(s.sendingKbps) }, ...(s.fileKbps ? [{ label: 'File’s own rate', value: fmtKbps(s.fileKbps) }] : []), ...(resolution(s.width, s.height) ? [{ label: 'Picture', value: resolution(s.width, s.height) }] : []), ...(s.where ? [{ label: 'From', value: nice(s.where) }] : []), { label: 'Started', value: fmtAgo(s.startedAt, c.clock || undefined) }],
          note: s.reasons?.length ? `Why: ${reasonsText(s.reasons)}` : undefined,
        }
      }),
      more: list.length > shown.length ? `${plural(list.length - shown.length, 'more stream')} in the details.` : undefined,
      summary: `${plural(list.length, 'stream')} playing, ${fmtCount(converting)} being converted, ${fmtKbps(sending)} going out.`,
      tables: [table('Playing now', columns, sorted.map((s) => ({ user: s.user, device: s.device, title: s.title, decision: decisionOf(s.decision).word, reasons: reasonsText(s.reasons), sending: s.sendingKbps, file: s.fileKbps, res: resolution(s.width, s.height), where: s.where ? nice(s.where) : undefined, bytes: s.bytes, started: s.startedAt })))],
    }
  },
  transcodes(c, detail) {
    const t = c.now?.transcodes
    if (!t) return missing(c, 'The server didn’t send this reading.')
    const pct = t.max > 0 ? Math.min(100, (t.active / t.max) * 100) : 0
    const v: View = {
      state: 'ok',
      figures: [{ label: 'Being converted', value: fmtCount(t.active), sub: t.max > 0 ? `${fmtCount(t.max)} allowed at once` : 'No limit set', big: true }],
      meters: t.max > 0 ? [{ label: 'Of what’s allowed', pct, text: `${fmtCount(t.active)} of ${fmtCount(t.max)}`, ...(t.active >= t.max ? { level: 'warn' as Level, word: 'At the limit' } : {}) }] : undefined,
      summary: `${plural(t.active, 'stream')} being converted${t.max > 0 ? `, of ${fmtCount(t.max)} allowed at once` : ''}.`,
      tables: [table('Converting now', [col('what', 'What'), col('count', 'How many', 'count')], [{ what: 'Being converted', count: t.active }, ...(t.max > 0 ? [{ what: 'Allowed at once', count: t.max }] : [])])],
    }
    return withLines(v, [lineSpec(c, 'transcodes', 'Conversions', 'count', [{ key: 'transcodes', name: 'Being converted' }], undefined, detail)], detail)
  },
  games(c, detail) {
    const list = c.now?.games ?? []
    const columns = [col('user', 'Person'), col('title', 'Game'), col('game', 'Game speed', 'fps'), col('sent', 'Frames sent', 'fps'), col('encode', 'Encoding time (server’s part of the delay)', 'ms'), col('kbps', 'Sending', 'kbps'), col('dropped', 'Frames dropped', 'count'), col('res', 'Picture'), col('core', 'Emulator'), col('encoder', 'Encoder'), col('paused', 'Paused'), col('started', 'Started', 'time')]
    if (!c.now) return { state: 'loading', message: NOT_YET, tables: [], summary: NOT_YET }
    if (!list.length) return empty(ownView(c) ? 'You aren’t playing a game right now.' : 'Nobody is playing a game right now.', [table('Game sessions now', columns, [])])
    const shown = detail ? list : list.slice(0, 4)
    return {
      state: 'ok',
      items: shown.map((g) => ({
        key: g.id, title: g.title, sub: g.user,
        tags: g.paused ? [{ text: 'Paused' }] : undefined,
        facts: [
          { label: 'Game speed', value: fmtFps(g.gameFps) }, { label: 'Frames sent', value: fmtFps(g.sentFps) },
          { label: 'Encoding time', value: fmtMs(g.encodeMs) }, { label: 'Sending', value: fmtKbps(g.kbps) },
          ...(g.droppedFrames ? [{ label: 'Frames dropped', value: fmtCount(g.droppedFrames) }] : []),
          ...(resolution(g.width, g.height) ? [{ label: 'Picture', value: resolution(g.width, g.height) }] : []),
        ],
      })),
      notes: ['Encoding time is only the server’s part of the delay. The network’s part is known only to the player.'],
      more: list.length > shown.length ? `${plural(list.length - shown.length, 'more session')} in the details.` : undefined,
      summary: `${plural(list.length, 'game session')}. ${list.map((g) => `${g.title} at ${fmtFps(g.gameFps)}, with ${fmtMs(g.encodeMs)} of encoding time, the server’s part of the delay.`).join(' ')}`,
      tables: [table('Game sessions now', columns, list.map((g) => ({ user: g.user, title: g.title, game: g.gameFps, sent: g.sentFps, encode: g.encodeMs, kbps: g.kbps, dropped: g.droppedFrames, res: resolution(g.width, g.height), core: g.core, encoder: g.encoder, paused: g.paused ? 'Yes' : 'No', started: g.startedAt })))],
    }
  },
  libraries(c, detail) {
    const r = c.report!
    if (!r.libraries.length) return empty(ownView(c) ? 'You don’t have any libraries to see yet.' : 'No libraries yet.')
    const items = r.libraries.reduce((n, l) => n + l.items, 0), bytes = r.libraries.reduce((n, l) => n + l.bytes, 0)
    const missingFiles = r.libraries.reduce((n, l) => n + l.missing, 0)
    const rows = [...r.libraries].sort((a, b) => b.bytes - a.bytes).map((l) => ({ label: l.name, value: l.bytes, text: `${fmtBytes(l.bytes)}, ${plural(l.items, 'item')}` }))
    const spec = bars('By library', rows, 6, detail)
    const typeSpec = bars('By type', r.byType.map((t) => ({ label: typeName(t.name), value: t.bytes, text: countText({ ...t }).replace('file', 'item') })), 8, true)
    return {
      state: 'ok',
      figures: [{ label: 'Items', value: fmtCount(items) }, { label: 'Size', value: fmtBytes(bytes) }, ...(missingFiles ? [{ label: 'Missing files', value: fmtCount(missingFiles) }] : [])],
      bars: detail ? [spec, typeSpec] : [spec],
      summary: `${plural(r.libraries.length, 'library', 'libraries')} with ${plural(items, 'item')}, ${fmtBytes(bytes)} altogether. ${spec.summary}`,
      tables: [
        table('Each library', [col('name', 'Library'), col('type', 'Type'), col('items', 'Items', 'count'), col('bytes', 'Size', 'bytes'), col('missing', 'Missing files', 'count'), col('scan', 'Last scan', 'time')], r.libraries.map((l) => ({ name: l.name, type: typeName(l.type), items: l.items, bytes: l.bytes, missing: l.missing, scan: l.lastScanAt }))),
        table('By type', [col('name', 'Type'), col('items', 'Items', 'count'), col('bytes', 'Size', 'bytes')], r.byType.map((t) => ({ name: typeName(t.name), items: t.items, bytes: t.bytes }))),
      ],
    }
  },
  codecs(c, detail) {
    const list = c.report!.codecs
    if (!list.length) return empty('No video to count yet.')
    const spec = bars('Video formats', list.map((x) => ({ label: x.name.toUpperCase(), value: x.bytes, text: countText(x) })), 5, detail)
    return { state: 'ok', bars: [spec], summary: spec.summary, tables: [table('Video formats', countCols('Format'), list.map((x) => countRow({ ...x, name: x.name.toUpperCase() })))] }
  },
  resolutions(c, detail) {
    const order = ['4K', '1080p', '720p', 'SD', 'Unknown']
    const list = [...c.report!.resolutions].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
    if (!list.length) return empty('No video to count yet.')
    const spec = bars('Picture sizes', list.map((x) => ({ label: x.name, value: x.bytes, text: countText(x) })), 5, detail)
    return { state: 'ok', bars: [spec], summary: `Picture sizes. ${list.map((x) => `${x.name}: ${countText(x)}`).join('; ')}.`, tables: [table('Picture sizes', countCols('Picture'), list.map(countRow))] }
  },
  duplicates(c, detail) {
    const d = c.report!.duplicates
    if (!d || !d.groups) return empty('Nothing is held twice.')
    const spec = bars('Most to gain', d.top.map((x) => ({ label: x.title + (x.year ? ` (${x.year})` : ''), value: x.wasted, text: `${fmtBytes(x.wasted)}, ${plural(x.copies, 'copy', 'copies')}` })), 4, detail)
    return {
      state: 'ok',
      figures: [{ label: 'Could be freed, as an estimate', value: fmtBytes(d.wastedBytes), big: true }, { label: 'Titles held more than once', value: fmtCount(d.groups) }],
      bars: [spec],
      notes: ['An estimate: what would go if only the largest copy of each title stayed. Nothing here changes or removes anything.'],
      summary: `About ${fmtBytes(d.wastedBytes)} could be freed, as an estimate. ${plural(d.groups, 'title')} held more than once.`,
      tables: [table('Titles held more than once', [col('title', 'Title'), col('year', 'Year'), col('copies', 'Copies', 'count'), col('bytes', 'Size of all copies', 'bytes'), col('wasted', 'Could be freed (estimate)', 'bytes')], d.top.map((x) => ({ title: x.title, year: x.year === undefined ? undefined : String(x.year), copies: x.copies, bytes: x.bytes, wasted: x.wasted })), d.groups > d.top.length ? `The ${d.top.length} with the most to gain, of ${fmtCount(d.groups)}.` : undefined)],
    }
  },
  savings(c) {
    const s = c.report!.savings
    if (!s || !s.items) return empty('Nothing here is in an older video format.')
    return {
      state: 'ok',
      figures: [{ label: 'Might be saved, as an estimate', value: fmtBytes(s.estimatedSaved), big: true }, { label: 'Older video', value: plural(s.items, 'file'), sub: fmtBytes(s.bytes) }],
      notes: ['An estimate: older video in a newer format, at about 40% smaller. It isn’t a promise for any one file.'],
      summary: `About ${fmtBytes(s.estimatedSaved)} might be saved, as an estimate, by converting ${plural(s.items, 'file')} of older video.`,
      tables: [table('Possible savings (estimate)', [col('what', 'What'), col('value', 'Value')], [{ what: 'Older video', value: plural(s.items, 'file') }, { what: 'Its size', value: fmtBytes(s.bytes) }, { what: 'Might be saved (estimate)', value: fmtBytes(s.estimatedSaved) }])],
    }
  },
  scans(c, detail) {
    const list = c.report!.scans
    if (!list?.length) return empty('No library has been scanned yet.')
    const spec = bars('Time taken, latest first', list.map((s) => ({ label: `${s.library}, ${fmtAgo(s.finishedAt)}`, value: s.tookSec, text: fmtDuration(s.tookSec) })), 4, detail)
    const last = list[0]
    return {
      state: 'ok', bars: [spec],
      summary: `${plural(list.length, 'scan')} listed. The latest was ${last.library}, which took ${fmtDuration(last.tookSec)} and went through ${plural(last.files, 'file')}.`,
      tables: [table('Library scans, latest first', [col('library', 'Library'), col('state', 'How it went'), col('files', 'Files', 'count'), col('took', 'Took', 'dur'), col('finished', 'Finished', 'time')], list.map((s) => ({ library: s.library, state: nice(s.state), files: s.files, took: s.tookSec, finished: s.finishedAt })))],
    }
  },
  watched(c, detail) {
    const list = c.report!.mostWatched
    if (!list.length) return empty(ownView(c) ? 'You haven’t played anything yet.' : 'Nothing has been played yet.')
    const spec = bars(ownView(c) ? 'What you’ve played the longest' : 'Played the longest', list.map((w) => ({ label: w.title, value: w.seconds, text: fmtDuration(w.seconds) })), 5, detail)
    return {
      state: 'ok', bars: [spec], summary: spec.summary,
      tables: [table('Most watched', [col('title', 'Title'), col('seconds', 'Time played', 'dur'), col('people', 'People', 'count')], list.map((w) => ({ title: w.title, seconds: w.seconds, people: w.people })))],
    }
  },
  bandwidth(c, detail) {
    const list = c.report!.bandwidth
    if (!list?.length) return empty('Nothing has been sent in the last 30 days.')
    const spec = bars('Sent in the last 30 days', list.map((b) => ({ label: b.user, value: b.bytes, text: fmtBytes(b.bytes) })), 5, detail)
    return { state: 'ok', bars: [spec], summary: spec.summary, tables: [table('Data sent to each person in the last 30 days', [col('user', 'Person'), col('bytes', 'Sent', 'bytes')], list.map((b) => ({ user: b.user, bytes: b.bytes })))] }
  },
  peak(c, detail) {
    const p = c.report!.peak
    if (!p || !p.streams) return empty('Nobody has played anything yet.')
    const v: View = {
      state: 'ok',
      figures: [{ label: 'Most at once', value: fmtCount(p.streams), sub: p.at ? fmtDate(p.at) : undefined, big: true }],
      summary: `The most playing at once was ${fmtCount(p.streams)}${p.at ? `, on ${fmtDate(p.at)}` : ''}.`,
      tables: [table('Busiest moment', [col('streams', 'Most at once', 'count'), col('at', 'When', 'time')], [{ streams: p.streams, at: p.at }])],
    }
    return detail ? withLines(v, [lineSpec(c, 'peak', 'Playing', 'count', [{ key: 'streams', name: 'Playing' }], undefined, detail)], detail) : v
  },
  activity(c, detail) {
    const v: View = { state: 'ok', tables: [], summary: '' }
    return withLines(v, [lineSpec(c, 'activity', 'Playing over time', 'count', [{ key: 'streams', name: 'Playing' }, { key: 'transcodes', name: 'Being converted' }, { key: 'games', name: 'Game sessions' }], undefined, detail)], detail)
  },
}

// Everything a widget's frame needs. The frame draws the unavailable and error cases the same
// way every time, so no builder has to think about them.
export type Prepared = { kind: 'hidden' } | { kind: 'unavailable'; why: string } | { kind: 'view'; view: View }

export function buildView(id: string, c: Ctx, detail = false): Prepared {
  const def = WIDGET_BY_ID.get(id)
  const build = BUILDERS[id]
  if (!def || !build) return { kind: 'hidden' }
  const a = availability(def, c.catalog)
  if (!a.ok) return a.why ? { kind: 'unavailable', why: a.why } : { kind: 'hidden' }
  if (def.report) {
    if (c.reportError && !c.report) return { kind: 'view', view: { state: 'error', message: c.reportError, retry: 'report', tables: [], summary: c.reportError } }
    if (!c.report) return { kind: 'view', view: { state: 'loading', message: 'Adding things up…', tables: [], summary: 'Adding things up…' } }
  }
  // A widget just added waits for a reading that was asked to include it. The one held now wasn't,
  // and what's missing from it says nothing: there may well be someone playing.
  if (def.live && (!c.now || (c.nowSections && def.live.some((s) => !c.nowSections!.includes(s))))) return { kind: 'view', view: { state: 'loading', message: NOT_YET, tables: [], summary: NOT_YET } }
  return { kind: 'view', view: build(c, detail) }
}

// What a widget needs from the server at this moment.
export const seriesFor = (def: WidgetDef, detail: boolean) => [...(def.series ?? []), ...(detail ? def.detailSeries ?? [] : [])]

export const CARD_TABLE_ROWS = 6

export const cellText = (c: Column, v: Cell) => formatValue(c.kind ?? 'text', v)
