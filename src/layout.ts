// Layouts: which widgets, in what order, how big. Plain functions over plain data, with no
// page in sight. A stored layout comes from someone's account, may be years old or damaged, and
// is never trusted: parseSaved always gives something that can be drawn.
import { WIDGET_BY_ID, presetWidgets, type PresetId } from './widgets.ts'

export type ViewKind = 'chart' | 'table'
export type Placed = { id: string; w: number; h: number; view?: ViewKind }
export type Layout = { id: string; name: string; widgets: Placed[] }
export type Saved = { active: string; layouts: Layout[]; range: string; view: ViewKind }

export const MAX_W = 4
export const MAX_H = 3
export const MAX_LAYOUTS = 8
export const MAX_NAME = 40
export const MAX_STORED = 10 * 1024
export const DEFAULT_RANGE = '1h'

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export const STOCK_NAME = 'My dashboard'

// What everyone starts with, and what "reset to stock" brings back.
export const stock = (own = false): Saved => ({
  active: 'l1',
  range: DEFAULT_RANGE,
  view: 'chart',
  layouts: [{ id: 'l1', name: STOCK_NAME, widgets: presetWidgets('standard', own) }],
})

export const activeLayout = (s: Saved) => s.layouts.find((l) => l.id === s.active) ?? s.layouts[0]

// ---------------------------------------------------------------- one layout

export function addWidget(l: Layout, id: string): Layout {
  const def = WIDGET_BY_ID.get(id)
  if (!def || l.widgets.some((w) => w.id === id)) return l
  return { ...l, widgets: [...l.widgets, { id, w: def.w, h: def.h }] }
}

export function removeWidget(l: Layout, id: string): Layout {
  return l.widgets.some((w) => w.id === id) ? { ...l, widgets: l.widgets.filter((w) => w.id !== id) } : l
}

// One step earlier or later among what this person can see: a widget their account can't have
// is still in the list, and swapping with it would look like nothing happened.
export function moveWidget(l: Layout, id: string, dir: -1 | 1, visible: (id: string) => boolean = () => true): Layout {
  const at = l.widgets.findIndex((w) => w.id === id)
  if (at < 0) return l
  let to = at + dir
  while (to >= 0 && to < l.widgets.length && !visible(l.widgets[to].id)) to += dir
  if (to < 0 || to >= l.widgets.length) return l
  const widgets = [...l.widgets]
  ;[widgets[at], widgets[to]] = [widgets[to], widgets[at]]
  return { ...l, widgets }
}

// Dropped onto another widget: takes that one's place, and the rest shuffle along.
export function moveWidgetTo(l: Layout, id: string, onto: string): Layout {
  const from = l.widgets.findIndex((w) => w.id === id)
  const to = l.widgets.findIndex((w) => w.id === onto)
  if (from < 0 || to < 0 || from === to) return l
  const widgets = [...l.widgets]
  const [it] = widgets.splice(from, 1)
  widgets.splice(to, 0, it)
  return { ...l, widgets }
}

export function canMove(l: Layout, id: string, dir: -1 | 1, visible: (id: string) => boolean = () => true) {
  return moveWidget(l, id, dir, visible) !== l
}

export function setWidgetSize(l: Layout, id: string, w: number, h: number): Layout {
  const nw = clamp(Math.round(w), 1, MAX_W), nh = clamp(Math.round(h), 1, MAX_H)
  let changed = false
  const widgets = l.widgets.map((x) => {
    if (x.id !== id || (x.w === nw && x.h === nh)) return x
    changed = true
    return { ...x, w: nw, h: nh }
  })
  return changed ? { ...l, widgets } : l
}

export function resizeWidget(l: Layout, id: string, dw: number, dh: number): Layout {
  const x = l.widgets.find((v) => v.id === id)
  return x ? setWidgetSize(l, id, x.w + dw, x.h + dh) : l
}

export function setWidgetView(l: Layout, id: string, view: ViewKind | undefined): Layout {
  return { ...l, widgets: l.widgets.map((x) => (x.id === id ? { ...x, view } : x)) }
}

export const applyPreset = (l: Layout, preset: PresetId, own = false): Layout => ({ ...l, widgets: presetWidgets(preset, own) })

// ---------------------------------------------------------------- the saved set

export function replaceLayout(s: Saved, l: Layout): Saved {
  return { ...s, layouts: s.layouts.map((x) => (x.id === l.id ? l : x)) }
}

export function cleanName(name: unknown, fallback = '') {
  if (typeof name !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  const n = name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME).trim()
  return n || fallback
}

function nextId(s: Saved) {
  for (let i = 1; ; i++) if (!s.layouts.some((l) => l.id === 'l' + i)) return 'l' + i
}

export function nameTaken(s: Saved, name: string, except?: string) {
  const n = name.toLowerCase()
  return s.layouts.some((l) => l.id !== except && l.name.toLowerCase() === n)
}

// A new layout starts as a copy of the one on screen, and is the one on screen from then on.
export function createLayout(s: Saved, name: string, preset?: PresetId, own = false): Saved {
  if (s.layouts.length >= MAX_LAYOUTS) return s
  const clean = cleanName(name)
  if (!clean || nameTaken(s, clean)) return s
  const id = nextId(s)
  const from = activeLayout(s)
  const widgets = preset ? presetWidgets(preset, own) : from.widgets.map((w) => ({ ...w }))
  return { ...s, active: id, layouts: [...s.layouts, { id, name: clean, widgets }] }
}

export function renameLayout(s: Saved, id: string, name: string): Saved {
  const clean = cleanName(name)
  if (!clean || nameTaken(s, clean, id)) return s
  return { ...s, layouts: s.layouts.map((l) => (l.id === id ? { ...l, name: clean } : l)) }
}

// There's always one left to show.
export function deleteLayout(s: Saved, id: string): Saved {
  if (s.layouts.length <= 1 || !s.layouts.some((l) => l.id === id)) return s
  const at = s.layouts.findIndex((l) => l.id === id)
  const layouts = s.layouts.filter((l) => l.id !== id)
  return { ...s, layouts, active: s.active === id ? layouts[Math.min(at, layouts.length - 1)].id : s.active }
}

export function switchLayout(s: Saved, id: string): Saved {
  return s.layouts.some((l) => l.id === id) ? { ...s, active: id } : s
}

// ---------------------------------------------------------------- stored form

// Small on purpose: the account's store has room for 16 KB across everything that uses it.
// A widget is one short string, "cpu:2:1", or "cpu:2:1:t" when it's showing its table.
export function serialize(s: Saved) {
  return {
    v: 1, a: s.active, r: s.range, g: s.view === 'table' ? 't' : 'c',
    l: s.layouts.map((l) => ({ i: l.id, n: l.name, w: l.widgets.map((x) => `${x.id}:${x.w}:${x.h}${x.view ? ':' + x.view[0] : ''}`) })),
  }
}

export const fitsStore = (s: Saved) => JSON.stringify(serialize(s)).length <= MAX_STORED

const LAYOUT_ID = /^l\d{1,4}$/
const RANGE = /^\d{1,3}[mhd]$/

function parseWidget(raw: unknown): Placed | null {
  if (typeof raw !== 'string' || raw.length > 64) return null
  const [id, w, h, view] = raw.split(':')
  const def = WIDGET_BY_ID.get(id)
  if (!def) return null // from a newer version, or one that's gone
  const nw = Number(w), nh = Number(h)
  const placed: Placed = {
    id,
    w: Number.isFinite(nw) ? clamp(Math.round(nw), 1, MAX_W) : def.w,
    h: Number.isFinite(nh) ? clamp(Math.round(nh), 1, MAX_H) : def.h,
  }
  if (view === 't') placed.view = 'table'
  else if (view === 'c') placed.view = 'chart'
  return placed
}

export function parseSaved(raw: unknown, own = false): Saved {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return stock(own)
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.l)) return stock(own)
  const layouts: Layout[] = []
  const seen = new Set<string>()
  for (const item of r.l.slice(0, MAX_LAYOUTS)) {
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    if (!Array.isArray(it.w) || typeof it.i !== 'string' || !LAYOUT_ID.test(it.i) || seen.has(it.i)) continue
    const here = new Set<string>()
    const widgets: Placed[] = []
    for (const w of it.w.slice(0, 200)) {
      const p = parseWidget(w)
      if (p && !here.has(p.id)) { here.add(p.id); widgets.push(p) }
    }
    seen.add(it.i)
    layouts.push({ id: it.i, name: cleanName(it.n, 'Layout ' + (layouts.length + 1)), widgets })
  }
  if (!layouts.length) return stock(own)
  return {
    layouts,
    active: typeof r.a === 'string' && seen.has(r.a) ? r.a : layouts[0].id,
    range: typeof r.r === 'string' && RANGE.test(r.r) ? r.r : DEFAULT_RANGE,
    view: r.g === 't' ? 'table' : 'chart',
  }
}
