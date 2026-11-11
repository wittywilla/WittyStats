// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 WittyWilla and contributors
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FrameReader, retryWait } from '../src/frames.ts'
import { buildView } from '../src/views.ts'
import { WIDGETS } from '../src/widgets.ts'

const enc = new TextEncoder()

test('frames come out whole, wherever the pieces end', () => {
  const r = new FrameReader()
  assert.deepEqual(r.push(enc.encode('event: sample\ndata: {"a"')), [])
  assert.deepEqual(r.push(enc.encode(':1}\n\nevent: sample\ndata: 2\n\n: only a comment\n\n')), [{ event: 'sample', data: '{"a":1}' }, { event: 'sample', data: '2' }])
})

test('a character split across two pieces survives', () => {
  const r = new FrameReader()
  const bytes = enc.encode('data: é\n\n')
  assert.deepEqual(r.push(bytes.slice(0, 7)), [])
  assert.deepEqual(r.push(bytes.slice(7)), [{ event: 'message', data: 'é' }])
})

test('Windows line ends work too', () => {
  const r = new FrameReader()
  assert.deepEqual(r.push(enc.encode('event: x\r\ndata: y\r\n\r\n')), [{ event: 'x', data: 'y' }])
})

test('the wait before trying again grows, to a limit', () => {
  const waits = [0, 1, 2, 3, 4, 5, 6, 20].map(retryWait)
  assert.deepEqual(waits, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
})

// ---------------------------------------------------------------- every widget, every state

const full = {
  access: { visible: true, full: true },
  sections: ['server', 'cpu', 'temperature', 'memory', 'gpu', 'disks', 'diskio', 'network', 'process', 'modules', 'streams', 'games', 'libraries', 'logs'].map((id) => ({ id, title: id, available: true })),
  series: ['cpu', 'memory', 'swap', 'netRx', 'netTx', 'diskRead', 'diskWrite', 'processCpu', 'rss', 'heap', 'goroutines', 'streams', 'transcodes', 'games'],
  ranges: ['15m', '1h'], everySec: 2,
}
const now = {
  time: 100000,
  server: { name: 'Home', version: '0.6.0-alpha', os: 'linux', arch: 'amd64', uptimeSec: 12000 },
  cpu: { percent: 12.5, cores: [10, 15], temps: [{ name: 'Package', celsius: 91 }] },
  memory: { total: 1000, used: 400, available: 600, swapTotal: 100, swapUsed: 10 },
  gpu: [{ name: 'Card', percent: 20, encoderSessions: 1 }],
  disks: [{ name: 'sda', readRate: 100, writeRate: 200, busyPercent: 5 }],
  volumes: [{ mount: '/media', kind: 'local', type: 'ext4', total: 1000, free: 20 }],
  net: [{ name: 'eth0', up: true, rxRate: 1000, txRate: 2000, rxBytes: 1, txBytes: 2, rxErrs: 0, txErrs: 0 }],
  process: { cpuPercent: 1, rss: 100, heapAlloc: 50, heapSys: 70, goroutines: 30, gcPauseMs: 0.2, numGC: 3, uptimeSec: 12000 },
  modules: [{ id: 'a', name: 'A module', version: '1.0', latest: '1.1', installed: true }, { id: 'b', name: 'B', version: '1.0', installed: false }],
  streams: [{ id: 's', userId: 1, user: 'Sam', device: 'TV', where: 'home', title: 'A Made-up Film', decision: 'transcode', reasons: ['codec'], width: 1920, height: 1080, fileKbps: 8000, sendingKbps: 4000, bytes: 1000, startedAt: 90000 }],
  games: [{ id: 'g', userId: 1, user: 'Sam', title: 'A Made-up Game', gameFps: 60, sentFps: 59, encodeMs: 4, kbps: 3000, droppedFrames: 0, startedAt: 90000 }],
  transcodes: { active: 1, max: 2 },
  tasks: { active: 1, queued: 0, paused: 0, percent: 50 },
}
const report = {
  generatedAt: 100000,
  libraries: [{ id: 1, name: 'Films', type: 'movies', items: 3, bytes: 3000, missing: 1 }],
  byType: [{ name: 'movies', items: 3, bytes: 3000 }],
  codecs: [{ name: 'h264', items: 3, bytes: 3000 }],
  resolutions: [{ name: 'SD', items: 1, bytes: 10 }, { name: '4K', items: 2, bytes: 2990 }],
  duplicates: { groups: 1, wastedBytes: 500, top: [{ title: 'A Made-up Film', year: 2001, copies: 2, bytes: 1500, wasted: 500 }] },
  savings: { items: 3, bytes: 3000, estimatedSaved: 1200 },
  scans: [{ library: 'Films', state: 'done', files: 3, tookSec: 40, finishedAt: 99000 }],
  database: { bytes: 4000, walBytes: 100 },
  caches: [{ name: 'Artwork', bytes: 900, files: 3, partial: true }],
  logs: [{ hour: 100000 - (100000 % 3600), warnings: 2, errors: 1 }],
  mostWatched: [{ itemId: 1, title: 'A Made-up Film', seconds: 7200, people: 2 }],
  bandwidth: [{ userId: 1, user: 'Sam', bytes: 900 }],
  peak: { streams: 3, at: 90000 },
}
const line = { times: [99000, 99060, 99120], values: [1, 2, 3], peak: [2, 3, 4] }
const ctx = (over = {}) => ({ catalog: full, now, samples: 5, report, reportError: null, range: '1h', series: () => line, history: 'ok', clock: 100000, ...over })

test('every widget has something to show, in words and in a table', () => {
  for (const w of WIDGETS) {
    for (const detail of [false, true]) {
      const p = buildView(w.id, ctx(), detail)
      assert.equal(p.kind, 'view', w.id)
      assert.equal(p.view.state, 'ok', `${w.id}: ${p.view.message}`)
      assert.ok(p.view.summary.length > 10, `${w.id} has a summary`)
      assert.ok(p.view.tables.length > 0, `${w.id} has a table`)
      for (const t of p.view.tables) {
        assert.ok(t.caption, `${w.id} table has a caption`)
        assert.ok(t.columns.length, `${w.id} table has columns`)
        for (const c of t.columns) assert.ok(c.label, `${w.id} column has a label`)
      }
    }
  }
})

test('nothing received yet is “waiting”, never a zero', () => {
  for (const w of WIDGETS) {
    if (!w.live && !w.report) continue
    const p = buildView(w.id, ctx({ now: null, report: null, samples: 0 }))
    assert.equal(p.view.state, 'loading', w.id)
    assert.equal(p.view.tables.length, 0, w.id)
  }
})

test('a widget just added waits for a reading that was asked to include it', () => {
  const p = buildView('modules', ctx({ now: { time: 1 }, nowSections: ['cpu'] }))
  assert.equal(p.view.state, 'loading')
  assert.equal(buildView('cpu', ctx({ nowSections: ['cpu'] })).view.state, 'ok')
  assert.equal(buildView('streams', ctx({ now: { time: 1 }, nowSections: ['cpu'] })).view.state, 'loading', 'not “nobody is playing”')
})

test('a part still missing after a couple of readings says so', () => {
  const quiet = { time: 1 }
  for (const id of ['cpu', 'cores', 'memory', 'swap', 'gpu', 'disks', 'diskio', 'network', 'process', 'temperature', 'uptime', 'tasks', 'transcodes']) {
    assert.equal(buildView(id, ctx({ now: quiet, samples: 1 })).view.state, 'loading', id + ' straight after connecting')
    assert.equal(buildView(id, ctx({ now: quiet, samples: 3 })).view.state, 'empty', id + ' later')
  }
})

test('nobody playing is an empty state with an empty table, not a broken one', () => {
  const v = buildView('streams', ctx({ now: { time: 1 } })).view
  assert.equal(v.state, 'empty')
  assert.equal(v.tables[0].rows.length, 0)
  assert.match(v.message, /Nobody/)
  assert.match(buildView('streams', ctx({ now: { time: 1 }, catalog: { ...full, access: { visible: true, full: false } } })).view.message, /You aren/)
})

test('what the system can’t do says why, from the catalogue', () => {
  const c = { ...full, sections: full.sections.map((s) => (s.id === 'temperature' ? { ...s, available: false, why: 'No sensors here.' } : s)) }
  assert.deepEqual(buildView('temperature', ctx({ catalog: c })), { kind: 'unavailable', why: 'No sensors here.' })
})

test('a section that isn’t in the catalogue draws nothing at all', () => {
  const c = { ...full, sections: full.sections.filter((s) => s.id !== 'logs') }
  assert.deepEqual(buildView('logs', ctx({ catalog: c })), { kind: 'hidden' })
  assert.deepEqual(buildView('nonsense', ctx()), { kind: 'hidden' })
})

test('a report that failed offers another go', () => {
  const v = buildView('libraries', ctx({ report: null, reportError: 'Nope.' })).view
  assert.equal(v.state, 'error')
  assert.equal(v.retry, 'report')
})

test('no swap set up is said plainly', () => {
  const v = buildView('swap', ctx({ now: { ...now, memory: { ...now.memory, swapTotal: 0, swapUsed: 0 } } })).view
  assert.equal(v.state, 'empty')
  assert.match(v.message, /no swap/)
})

test('an estimate says it is one', () => {
  for (const id of ['duplicates', 'savings']) {
    const v = buildView(id, ctx()).view
    assert.ok(WIDGETS.find((w) => w.id === id).estimate)
    assert.match(v.summary, /estimate/)
    assert.match(v.notes.join(' '), /estimate/i)
    assert.match(JSON.stringify(v.tables), /estimate/i)
  }
})

test('encoding time says it’s the server’s part', () => {
  const v = buildView('games', ctx()).view
  assert.match(v.notes[0], /server’s part/)
  assert.match(v.summary, /server’s part/)
  assert.ok(v.tables[0].columns.some((c) => /server’s part/.test(c.label)))
})

test('a chart with too little to draw says why, and its loading and failing are told apart', () => {
  const none = () => null
  const spec = (history) => buildView('cpu', ctx({ series: none, history })).view.lines[0]
  assert.match(spec('loading').message, /Loading/)
  assert.match(spec('error').message, /couldn’t be loaded/)
  assert.match(spec('ok').message, /Nothing recorded/)
})

test('the detail view adds series and the highest readings', () => {
  const card = buildView('process', ctx()).view
  const more = buildView('process', ctx(), true).view
  assert.equal(card.lines.length, 1)
  assert.equal(more.lines.length, 3)
  const hist = more.tables.find((t) => /Processor used/.test(t.caption))
  assert.ok(hist.columns.some((c) => /highest/.test(c.label)))
  const cpu = buildView('cpu', ctx(), true).view.lines[0]
  assert.ok(cpu.series.some((s) => s.slot === 0), 'one series gets its peak drawn too')
})

test('points older than the range are left out', () => {
  const spec = buildView('cpu', ctx({ series: () => ({ times: [10, 99000, 99060], values: [50, 1, 2] }) })).view.lines[0]
  assert.deepEqual(spec.series[0].times, [99000, 99060])
})

test('picture sizes run from the largest down, whatever order they arrive in', () => {
  const v = buildView('resolutions', ctx()).view
  assert.deepEqual(v.bars[0].rows.map((r) => r.label), ['4K', 'SD'])
})

test('a drive\'s health is words, and nothing until it is known', () => {
  const ctx = (drives) => ({
    catalog: { access: { visible: true, full: true }, sections: [{ id: 'disks', title: 'Disks', available: true }], series: [], ranges: [], everySec: 2 },
    now: { time: 1, volumes: [{ mount: 'C:\\', kind: 'fixed', type: 'ntfs', total: 100, free: 50 }] }, samples: 1, report: drives ? { drives } : null, reportError: null,
    range: '1h', series: () => null, history: { loading: false, failed: false }, clock: 1,
  })
  const view = (drives) => buildView('disks', ctx(drives)).view
  assert.equal(view(undefined).state, 'ok', 'disks don\'t wait for the report')
  assert.doesNotMatch(view(undefined).items[0].sub, /health|healthy|attention/)
  assert.match(view([{ mount: 'C:\\', checked: true, lines: ['Fine.'] }]).items[0].sub, /healthy/)
  assert.match(view([{ mount: 'C:\\', checked: true, bad: true, lines: ['Failing.'] }]).items[0].sub, /needs attention/)
  const notChecked = view([{ mount: 'C:\\', checked: false, lines: [], note: 'Needs rights.' }])
  assert.match(notChecked.items[0].sub, /not checked/)
  assert.equal(notChecked.tables[0].rows[0].health, 'Needs rights.')
})
