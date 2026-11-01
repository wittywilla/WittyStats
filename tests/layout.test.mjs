import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_H, MAX_LAYOUTS, MAX_NAME, MAX_STORED, MAX_W, activeLayout, addWidget, applyPreset, canMove, cleanName, createLayout, deleteLayout, fitsStore, moveWidget, moveWidgetTo, nameTaken, parseSaved,
  removeWidget, renameLayout, replaceLayout, resizeWidget, serialize, setWidgetSize, setWidgetView, stock, switchLayout,
} from '../src/layout.ts'
import { WIDGETS, allowed, availability, liveSections, presetWidgets } from '../src/widgets.ts'

const ids = (l) => l.widgets.map((w) => w.id)
const base = () => ({ id: 'l1', name: 'Mine', widgets: [{ id: 'cpu', w: 2, h: 1 }, { id: 'memory', w: 2, h: 1 }, { id: 'disks', w: 1, h: 1 }] })

test('adding puts a widget at the end, at its own size, once', () => {
  const l = addWidget(base(), 'swap')
  assert.deepEqual(ids(l), ['cpu', 'memory', 'disks', 'swap'])
  const def = WIDGETS.find((w) => w.id === 'swap')
  assert.deepEqual(l.widgets[3], { id: 'swap', w: def.w, h: def.h })
  assert.equal(addWidget(l, 'swap'), l, 'already there')
  assert.equal(addWidget(l, 'nonsense'), l, 'no such widget')
})

test('removing takes it out and leaves the rest in order', () => {
  assert.deepEqual(ids(removeWidget(base(), 'memory')), ['cpu', 'disks'])
  const l = base()
  assert.equal(removeWidget(l, 'nonsense'), l)
})

test('moving swaps with the neighbour, and stops at the ends', () => {
  assert.deepEqual(ids(moveWidget(base(), 'memory', -1)), ['memory', 'cpu', 'disks'])
  assert.deepEqual(ids(moveWidget(base(), 'memory', 1)), ['cpu', 'disks', 'memory'])
  const l = base()
  assert.equal(moveWidget(l, 'cpu', -1), l)
  assert.equal(moveWidget(l, 'disks', 1), l)
  assert.equal(canMove(l, 'cpu', -1), false)
  assert.equal(canMove(l, 'cpu', 1), true)
})

test('moving skips what this person can’t see, or it would look like nothing happened', () => {
  const seen = (id) => id !== 'memory'
  assert.deepEqual(ids(moveWidget(base(), 'cpu', 1, seen)), ['disks', 'memory', 'cpu'])
  const l = { ...base(), widgets: [{ id: 'memory', w: 1, h: 1 }, { id: 'cpu', w: 1, h: 1 }] }
  assert.equal(moveWidget(l, 'cpu', -1, seen), l, 'nothing it can see lies that way')
  assert.equal(canMove(l, 'cpu', -1, seen), false)
})

test('dropping onto another takes its place', () => {
  assert.deepEqual(ids(moveWidgetTo(base(), 'disks', 'cpu')), ['disks', 'cpu', 'memory'])
  assert.deepEqual(ids(moveWidgetTo(base(), 'cpu', 'disks')), ['memory', 'disks', 'cpu'])
  const l = base()
  assert.equal(moveWidgetTo(l, 'cpu', 'cpu'), l)
  assert.equal(moveWidgetTo(l, 'cpu', 'nonsense'), l)
})

test('resizing stays within limits and reports no change at them', () => {
  const l = base()
  assert.deepEqual(resizeWidget(l, 'disks', 1, 0).widgets[2], { id: 'disks', w: 2, h: 1 })
  assert.deepEqual(resizeWidget(l, 'disks', 0, 1).widgets[2], { id: 'disks', w: 1, h: 2 })
  assert.equal(resizeWidget(l, 'disks', -1, 0), l, 'can’t go narrower than one')
  assert.equal(resizeWidget(l, 'disks', 0, -1), l, 'can’t go shorter than one')
  const big = setWidgetSize(l, 'disks', 99, 99)
  assert.deepEqual(big.widgets[2], { id: 'disks', w: MAX_W, h: MAX_H })
  assert.equal(resizeWidget(big, 'disks', 1, 1), big)
})

test('a widget remembers showing as a table', () => {
  assert.equal(setWidgetView(base(), 'cpu', 'table').widgets[0].view, 'table')
})

test('stock has one layout with the standard preset, and reset is that again', () => {
  const s = stock()
  assert.equal(s.layouts.length, 1)
  assert.deepEqual(activeLayout(s).widgets, presetWidgets('standard'))
  assert.equal(s.view, 'chart')
  assert.deepEqual(stock(), s)
})

test('each preset replaces the widgets, lists only real ones, and the largest has everything', () => {
  const known = new Set(WIDGETS.map((w) => w.id))
  for (const p of ['simple', 'standard', 'advanced']) {
    const l = applyPreset(base(), p)
    assert.ok(l.widgets.length >= 5, p)
    assert.equal(new Set(ids(l)).size, l.widgets.length, `${p} has no repeats`)
    for (const w of l.widgets) assert.ok(known.has(w.id), w.id)
  }
  assert.equal(applyPreset(base(), 'advanced').widgets.length, WIDGETS.length)
  assert.ok(applyPreset(base(), 'simple').widgets.length < applyPreset(base(), 'standard').widgets.length)
})

test('someone without the machine gets no narrow widget from a preset, as it would have no neighbour', () => {
  for (const p of ['simple', 'standard', 'advanced']) assert.ok(presetWidgets(p, true).every((w) => w.w >= 2), p)
  assert.ok(stock(true).layouts[0].widgets.every((w) => w.w >= 2))
  assert.ok(parseSaved(null, true).layouts[0].widgets.every((w) => w.w >= 2))
  assert.deepEqual(ids(applyPreset(base(), 'simple', true)), ids(applyPreset(base(), 'simple')))
})

test('layouts are created, renamed, switched and deleted, and one always stays', () => {
  let s = stock()
  s = createLayout(s, ' Second  one ')
  assert.equal(s.layouts.length, 2)
  assert.equal(activeLayout(s).name, 'Second one', 'tidied, and on screen')
  assert.deepEqual(activeLayout(s).widgets, s.layouts[0].widgets, 'starts as a copy')
  assert.equal(createLayout(s, 'second ONE'), s, 'names don’t repeat')
  assert.equal(createLayout(s, '   '), s, 'needs a name')
  const made = activeLayout(s).id
  s = renameLayout(s, made, 'Third')
  assert.equal(activeLayout(s).name, 'Third')
  assert.equal(renameLayout(s, made, s.layouts[0].name), s, 'can’t take another’s name')
  s = switchLayout(s, 'l1')
  assert.equal(s.active, 'l1')
  assert.equal(switchLayout(s, 'nope'), s)
  s = switchLayout(s, made)
  s = deleteLayout(s, made)
  assert.equal(s.layouts.length, 1)
  assert.equal(s.active, 'l1', 'moves to one that’s left')
  assert.equal(deleteLayout(s, 'l1'), s, 'the last one stays')
})

test('no more layouts than there’s room for', () => {
  let s = stock()
  for (let i = 0; i < MAX_LAYOUTS + 3; i++) s = createLayout(s, 'Layout number ' + i)
  assert.equal(s.layouts.length, MAX_LAYOUTS)
})

test('a full set of the longest layouts still fits the store', () => {
  let s = stock()
  for (let i = 0; i < MAX_LAYOUTS - 1; i++) s = createLayout(s, ('x'.repeat(MAX_NAME - 2)) + i, 'advanced')
  s = replaceLayout(s, { ...s.layouts[0], name: 'y'.repeat(MAX_NAME), widgets: presetWidgets('advanced').map((w) => ({ ...w, view: 'table' })) })
  const size = JSON.stringify(serialize(s)).length
  assert.ok(size < MAX_STORED, `${size} bytes`)
  assert.ok(fitsStore(s))
})

test('what’s stored comes back the same', () => {
  let s = stock()
  s = createLayout(s, 'Second', 'simple')
  s = replaceLayout(s, setWidgetView(setWidgetSize(activeLayout(s), 'cpu', 4, 3), 'cpu', 'table'))
  s = { ...s, range: '7d', view: 'table' }
  assert.deepEqual(parseSaved(JSON.parse(JSON.stringify(serialize(s)))), s)
})

test('a damaged store gives stock, whatever it holds', () => {
  for (const bad of [null, undefined, 7, 'text', [], {}, { l: 'no' }, { l: [] }, { l: [null, 3, 'x', {}] }, { l: [{ i: 'bad id', w: [] }] }, { l: [{ i: 'l1' }] }, { v: 99, l: [{ i: '<img>', n: 'x', w: ['cpu:1:1'] }] }]) {
    assert.deepEqual(parseSaved(bad), stock(), JSON.stringify(bad))
  }
})

test('a stored layout naming unknown widgets keeps the rest', () => {
  const s = parseSaved({ a: 'l1', l: [{ i: 'l1', n: 'Mine', w: ['cpu:2:1', 'from-the-future:9:9', 42, null, { id: 'memory' }, 'memory:2:1', 'cpu:1:1', 'constructor:1:1', '__proto__:1:1'] }] })
  assert.deepEqual(ids(s.layouts[0]), ['cpu', 'memory'], 'unknown, malformed and repeated ones all go')
  assert.deepEqual(s.layouts[0].widgets[0], { id: 'cpu', w: 2, h: 1 }, 'the first of a repeat stays')
})

test('sizes and names from a store are held to the limits', () => {
  const s = parseSaved({ a: 'nope', r: 'forever', g: 'odd', l: [{ i: 'l1', n: 'A\u0000B\n' + 'c'.repeat(100), w: ['cpu:999:-4', 'memory:x:y:t', 'disks:1.6:1.2:zzz'] }, { i: 'l1', n: 'Twin', w: [] }, { i: 'l2', n: 12, w: [] }] })
  assert.equal(s.layouts.length, 2, 'one id, one layout')
  assert.equal(s.active, 'l1', 'a missing choice falls back to the first')
  assert.equal(s.range, '1h')
  assert.equal(s.view, 'chart')
  const [cpu, memory, disks] = s.layouts[0].widgets
  assert.deepEqual(cpu, { id: 'cpu', w: MAX_W, h: 1 })
  const def = WIDGETS.find((w) => w.id === 'memory')
  assert.deepEqual(memory, { id: 'memory', w: def.w, h: def.h, view: 'table' })
  assert.deepEqual(disks, { id: 'disks', w: 2, h: 1 })
  assert.ok(s.layouts[0].name.length <= MAX_NAME)
  assert.ok(!/[\u0000\n]/.test(s.layouts[0].name))
  assert.equal(s.layouts[1].name, 'Layout 2', 'a name that isn’t text gets one')
  assert.deepEqual(s.layouts[1].widgets, [], 'an empty layout is allowed, and is drawn as one')
})

test('too many layouts in a store are cut to the limit', () => {
  const l = Array.from({ length: 50 }, (_, i) => ({ i: 'l' + (i + 1), n: 'L' + i, w: ['cpu:1:1'] }))
  assert.equal(parseSaved({ l }).layouts.length, MAX_LAYOUTS)
})

test('names are tidied and compared without regard to case', () => {
  assert.equal(cleanName('  a\tb  '), 'a b')
  assert.equal(cleanName(5, 'fallback'), 'fallback')
  assert.ok(nameTaken(stock(), 'MY DASHBOARD'))
  assert.ok(!nameTaken(stock(), 'MY DASHBOARD', 'l1'))
})

// ---------------------------------------------------------------- the catalogue

const catalog = (full, sections) => ({ access: { visible: true, full }, sections, series: [], ranges: [], everySec: 2 })
const sec = (id, available = true, why) => ({ id, title: id, available, why })
const def = (id) => WIDGETS.find((w) => w.id === id)

test('someone without the machine gets no frame for it', () => {
  const own = catalog(false, ['server', 'streams', 'games', 'libraries'].map((s) => sec(s)))
  const left = WIDGETS.filter((d) => allowed(d, own)).map((d) => d.id).sort()
  assert.deepEqual(left, ['codecs', 'games', 'libraries', 'resolutions', 'streams', 'uptime', 'watched'])
  for (const p of ['simple', 'standard', 'advanced']) assert.ok(presetWidgets(p).some((w) => allowed(def(w.id), own)), `${p} still shows something`)
})

test('what this server can’t do says why, and asks for nothing', () => {
  const c = catalog(true, [sec('cpu'), sec('temperature', false, 'No sensors.'), sec('streams')])
  assert.deepEqual(availability(def('temperature'), c), { ok: false, why: 'No sensors.' })
  assert.deepEqual(availability(def('cpu'), c), { ok: true })
  assert.deepEqual(liveSections(['cpu', 'cores', 'temperature', 'streams', 'nonsense'], c), ['cpu', 'streams'])
  assert.deepEqual(liveSections(['libraries'], catalog(true, [sec('libraries')])), [], 'a report isn’t a stream')
})
