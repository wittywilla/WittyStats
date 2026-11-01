// Numbers for people: GB, Mbps, "3 hr 20 min". Nothing here touches the page.

export type Kind = 'text' | 'count' | 'bytes' | 'bytesRate' | 'bitsRate' | 'kbps' | 'pct' | 'dur' | 'time' | 'ago' | 'ms' | 'fps' | 'celsius' | 'mbps'

const known = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const NOTHING = '–'

// Three figures at most: enough to compare by eye, and no more than anyone reads.
function short(v: number) {
  return v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/\.?0+$/, '') || '0'
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
export function fmtBytes(n: unknown): string {
  if (!known(n)) return NOTHING
  if (n < 0) return '-' + fmtBytes(-n)
  let v = n, i = 0
  while (v >= 1024 && i < BYTE_UNITS.length - 1) { v /= 1024; i++ }
  return `${i === 0 ? Math.round(v) : short(v)} ${BYTE_UNITS[i]}`
}

export const fmtBytesRate = (n: unknown) => (known(n) ? fmtBytes(n) + '/s' : NOTHING)

// Network speeds are in bits, in thousands, as anyone's internet plan is.
const BIT_UNITS = ['bps', 'kbps', 'Mbps', 'Gbps', 'Tbps']
export function fmtBits(bitsPerSec: unknown) {
  if (!known(bitsPerSec)) return NOTHING
  let v = Math.max(0, bitsPerSec), i = 0
  while (v >= 1000 && i < BIT_UNITS.length - 1) { v /= 1000; i++ }
  return `${i === 0 ? Math.round(v) : short(v)} ${BIT_UNITS[i]}`
}
export const fmtKbps = (k: unknown) => (known(k) ? fmtBits(k * 1000) : NOTHING)

export function fmtDuration(sec: unknown) {
  if (!known(sec)) return NOTHING
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s} sec`
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) {
    let h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
    if (m === 60) { h++; m = 0 }
    return m ? `${h} hr ${m} min` : `${h} hr`
  }
  let d = Math.floor(s / 86400), h = Math.round((s % 86400) / 3600)
  if (h === 24) { d++; h = 0 }
  const days = d === 1 ? '1 day' : `${d} days`
  return h ? `${days} ${h} hr` : days
}

export function fmtPercent(p: unknown) {
  if (!known(p)) return NOTHING
  const v = Math.max(0, p)
  if (v === 0) return '0%'
  if (v < 1) return '<1%'
  return v < 10 ? `${v.toFixed(1).replace(/\.0$/, '')}%` : `${Math.round(v)}%`
}

export const fmtCount = (n: unknown) => (known(n) ? Math.round(n).toLocaleString() : NOTHING)

// For a scale: 0, 500, 1K, 2M.
export function fmtCompact(n: number) {
  const a = Math.abs(n)
  if (a >= 1e9) return short(n / 1e9) + 'B'
  if (a >= 1e6) return short(n / 1e6) + 'M'
  if (a >= 1e3) return short(n / 1e3) + 'K'
  return short(n)
}

export function fmtTime(unix: unknown, spanSec = 86400) {
  if (!known(unix) || unix <= 0) return NOTHING
  const d = new Date(unix * 1000)
  if (spanSec <= 86400) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
export const fmtDate = (unix: unknown) => (known(unix) && unix > 0 ? new Date(unix * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : NOTHING)

export function fmtAgo(unix: unknown, now = Date.now() / 1000) {
  if (!known(unix) || unix <= 0) return NOTHING
  const s = now - unix
  if (s < 45) return 'just now'
  if (s < 7 * 86400) return `${fmtDuration(s)} ago`
  return fmtDate(unix)
}

export const fmtMs = (n: unknown) => (known(n) ? `${n >= 100 ? Math.round(n) : n.toFixed(1)} ms` : NOTHING)
export const fmtFps = (n: unknown) => (known(n) ? `${n >= 100 ? Math.round(n) : n.toFixed(1)} fps` : NOTHING)
export const fmtCelsius = (n: unknown) => (known(n) ? `${Math.round(n)}°C` : NOTHING)
export const fmtMbps = (n: unknown) => (known(n) ? fmtBits(n * 1e6) : NOTHING)

// One cell of a table or one value of a chart, by what kind of number it is.
export function formatValue(kind: Kind, v: unknown): string {
  if (v === null || v === undefined || v === '') return NOTHING
  switch (kind) {
    case 'text': return String(v)
    case 'count': return fmtCount(v)
    case 'bytes': return fmtBytes(v)
    case 'bytesRate': return fmtBytesRate(v)
    case 'bitsRate': return fmtBits(typeof v === 'number' ? v * 8 : v)
    case 'kbps': return fmtKbps(v)
    case 'pct': return fmtPercent(v)
    case 'dur': return fmtDuration(v)
    case 'time': return fmtDate(v)
    case 'ago': return fmtAgo(v)
    case 'ms': return fmtMs(v)
    case 'fps': return fmtFps(v)
    case 'celsius': return fmtCelsius(v)
    case 'mbps': return fmtMbps(v)
  }
}

// What a raw number in an export is counted in, for its column heading.
export const UNIT_NAMES: Partial<Record<Kind, string>> = {
  bytes: 'bytes', bytesRate: 'bytes a second', bitsRate: 'bytes a second', kbps: 'kbps', pct: 'percent', dur: 'seconds', ms: 'ms', fps: 'frames a second', celsius: '°C', mbps: 'Mbps',
}

// The top of a scale: a round number at or above the largest value, in the steps people
// expect for that unit, so that the ticks read 0, 1 GB, 2 GB and not 0, 1.07 GB, 2.15 GB.
export function niceMax(max: number, kind: Kind = 'count') {
  if (!(max > 0)) return 1
  const base = kind === 'bytes' || kind === 'bytesRate' ? 1024 : 1000
  const scaled = kind === 'bitsRate' ? max * 8 : max
  let unit = 1
  while (scaled / unit >= base) unit *= base
  const v = scaled / unit
  const step = [1, 2, 4, 5, 10, 20, 40, 50, 100, 200, 400, 500, 1000].find((s) => v <= s) ?? v
  const top = step * unit
  return kind === 'bitsRate' ? top / 8 : top
}
