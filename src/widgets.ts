// Every widget there is: what it's called, which part of the server's catalogue decides
// whether it can show anything, and what it needs. views.ts says what each one shows.
import type { Catalog } from './types.ts'

export type WidgetDef = {
  id: string
  title: string
  about: string // one line, in the list for adding
  group: 'Machine' | 'This server' | 'Playing now' | 'Libraries' | 'History'
  section: string // the catalogue's section that says whether this can show anything here
  full?: boolean // only for an account with the whole machine, even if the section is theirs
  live?: string[] // sections asked for on the stream
  report?: boolean
  series?: string[] // history on the card
  detailSeries?: string[] // and more in its detail view
  w: number
  h: number
  estimate?: boolean
}

const d = (id: string, title: string, about: string, group: WidgetDef['group'], section: string, w: number, h: number, more: Partial<WidgetDef> = {}): WidgetDef => ({ id, title, about, group, section, w, h, ...more })

export const WIDGETS: WidgetDef[] = [
  d('cpu', 'Processor', 'How busy the processor is, now and over time', 'Machine', 'cpu', 2, 1, { live: ['cpu'], series: ['cpu'] }),
  d('cores', 'Processor cores', 'Each core on its own', 'Machine', 'cpu', 2, 1, { live: ['cpu'] }),
  d('temperature', 'Temperature', 'What the machine’s sensors read', 'Machine', 'temperature', 1, 1, { live: ['temperature'] }),
  d('memory', 'Memory', 'How much is in use, now and over time', 'Machine', 'memory', 2, 1, { live: ['memory'], series: ['memory'] }),
  d('swap', 'Swap', 'Memory kept on disk when memory runs short', 'Machine', 'memory', 1, 1, { live: ['memory'], series: ['swap'] }),
  d('gpu', 'Graphics', 'How busy each card is, with its encoder sessions', 'Machine', 'gpu', 2, 1, { live: ['gpu'] }),
  d('disks', 'Disk space', 'What’s used and free on each disk', 'Machine', 'disks', 2, 1, { live: ['disks'], report: true }),
  d('diskio', 'Disk speed', 'Reading, writing and how busy each disk is', 'Machine', 'diskio', 2, 1, { live: ['diskio'], series: ['diskRead', 'diskWrite'] }),
  d('network', 'Network', 'Traffic on each connection', 'Machine', 'network', 2, 1, { live: ['network'], series: ['netRx', 'netTx'] }),
  d('process', 'This server', 'What the server program itself is using', 'This server', 'process', 2, 2, { live: ['process'], series: ['rss', 'heap'], detailSeries: ['processCpu', 'goroutines'] }),
  d('uptime', 'Uptime', 'How long the server has been running, and its version', 'This server', 'server', 1, 1, { live: ['server'] }),
  d('modules', 'Modules', 'What’s installed and whether updates are waiting', 'This server', 'modules', 2, 1, { live: ['modules'] }),
  d('tasks', 'Background work', 'Scans and other jobs going on now', 'This server', 'streams', 1, 1, { live: ['streams'], full: true }),
  d('database', 'Database', 'How big the server’s database is', 'This server', 'server', 1, 1, { report: true, full: true }),
  d('caches', 'Caches', 'Folders of things the server can make again', 'This server', 'server', 1, 1, { report: true, full: true }),
  d('logs', 'Warnings and errors', 'What went wrong over the last day', 'This server', 'logs', 2, 1, { report: true }),
  d('streams', 'Playing now', 'Who is playing what, on which device, and how it reaches them', 'Playing now', 'streams', 2, 1, { live: ['streams'] }),
  d('transcodes', 'Converting', 'How much converting is going on, and how much is allowed', 'Playing now', 'streams', 1, 1, { live: ['streams'], series: ['transcodes'], full: true }),
  d('games', 'Game sessions', 'Frame rate and encoding time of games being played', 'Playing now', 'games', 2, 1, { live: ['games'] }),
  d('libraries', 'Libraries', 'How much is in each library, and how big it is', 'Libraries', 'libraries', 2, 1, { report: true }),
  d('codecs', 'Video formats', 'Which formats your video is in', 'Libraries', 'libraries', 1, 1, { report: true }),
  d('resolutions', 'Picture sizes', 'How much is 4K, 1080p and so on', 'Libraries', 'libraries', 1, 1, { report: true }),
  d('duplicates', 'Duplicates', 'Titles held more than once, and what that could free up', 'Libraries', 'libraries', 2, 1, { report: true, full: true, estimate: true }),
  d('savings', 'Possible savings', 'What converting older video might save', 'Libraries', 'libraries', 1, 1, { report: true, full: true, estimate: true }),
  d('scans', 'Library scans', 'How long the latest scans took', 'Libraries', 'libraries', 2, 1, { report: true, full: true }),
  d('watched', 'Most watched', 'What’s been played the longest', 'History', 'libraries', 2, 1, { report: true }),
  d('bandwidth', 'Data by person', 'How much each person has been sent in 30 days', 'History', 'streams', 1, 1, { report: true, full: true }),
  d('peak', 'Busiest moment', 'The most people playing at once', 'History', 'streams', 1, 1, { report: true, full: true, detailSeries: ['streams'] }),
  d('activity', 'Playing over time', 'Streams, conversions and game sessions over time', 'History', 'streams', 2, 1, { live: ['streams', 'games'], series: ['streams', 'transcodes', 'games'], full: true }),
]

export const WIDGET_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]))

export type PresetId = 'simple' | 'standard' | 'advanced'
export const PRESET_NAMES: Record<PresetId, string> = { simple: 'Simple', standard: 'Standard', advanced: 'Advanced' }

const PRESETS: Record<PresetId, [string, number, number][]> = {
  simple: [['cpu', 2, 1], ['memory', 2, 1], ['disks', 2, 1], ['transcodes', 1, 1], ['uptime', 1, 1], ['streams', 2, 1], ['libraries', 2, 1]],
  standard: [
    ['cpu', 2, 1], ['memory', 2, 1],
    ['streams', 2, 1], ['disks', 2, 1], ['network', 2, 1], ['gpu', 2, 1],
    ['transcodes', 1, 1], ['tasks', 1, 1], ['uptime', 1, 1], ['temperature', 1, 1],
    ['process', 2, 2], ['libraries', 2, 1], ['logs', 2, 1], ['watched', 2, 1], ['games', 2, 1], ['cores', 2, 1], ['diskio', 2, 1],
  ],
  advanced: WIDGETS.map((w) => [w.id, w.w, w.h]),
}

// Someone without the whole machine has far fewer widgets, so a narrow one would have no
// neighbour and leave a hole. In their layouts every widget is at least two wide.
export const presetWidgets = (id: PresetId, own = false) => PRESETS[id].map(([wid, w, h]) => ({ id: wid, w: own ? Math.max(2, w) : w, h }))

// Whether this account can have a widget at all. No frame is ever drawn for one it can't.
export function allowed(def: WidgetDef, catalog: Catalog) {
  if (def.full && !catalog.access.full) return false
  return catalog.sections.some((s) => s.id === def.section)
}

// Whether this server can show it, and if not, why it can't.
export function availability(def: WidgetDef, catalog: Catalog): { ok: boolean; why?: string } {
  const s = catalog.sections.find((x) => x.id === def.section)
  if (!s) return { ok: false }
  return s.available ? { ok: true } : { ok: false, why: s.why || 'This server can’t provide it.' }
}

// What to ask the stream for: only what this list of widgets shows, in a steady order, so the
// same set doesn't look like a change.
export function liveSections(ids: string[], catalog: Catalog) {
  const out = new Set<string>()
  for (const id of ids) {
    const def = WIDGET_BY_ID.get(id)
    if (!def || !allowed(def, catalog) || !availability(def, catalog).ok) continue
    for (const s of def.live ?? []) out.add(s)
  }
  return [...out].sort()
}
