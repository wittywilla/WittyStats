import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fmtAgo, fmtBits, fmtBytes, fmtBytesRate, fmtCelsius, fmtCompact, fmtCount, fmtDuration, fmtFps, fmtKbps, fmtMbps, fmtMs, fmtPercent, formatValue, niceMax } from '../src/format.ts'

test('sizes are in the units people use', () => {
  assert.equal(fmtBytes(0), '0 B')
  assert.equal(fmtBytes(512), '512 B')
  assert.equal(fmtBytes(1536), '1.5 KB')
  assert.equal(fmtBytes(1024 ** 3), '1 GB')
  assert.equal(fmtBytes(5.25 * 1024 ** 3), '5.25 GB')
  assert.equal(fmtBytes(123.4 * 1024 ** 3), '123 GB')
  assert.equal(fmtBytes(2 * 1024 ** 4), '2 TB')
  assert.equal(fmtBytes(8 * 1024 ** 6), '8192 PB', 'runs out of names, not of numbers')
  assert.equal(fmtBytesRate(1024 * 1024), '1 MB/s')
})

test('network speeds are in bits', () => {
  assert.equal(fmtBits(900), '900 bps')
  assert.equal(fmtBits(12_400_000), '12.4 Mbps')
  assert.equal(fmtBits(1_000_000_000), '1 Gbps')
  assert.equal(fmtKbps(8200), '8.2 Mbps')
  assert.equal(fmtKbps(320), '320 kbps')
  assert.equal(fmtMbps(1000), '1 Gbps')
  assert.equal(formatValue('bitsRate', 1_000_000), '8 Mbps', 'a rate in bytes, shown in bits')
})

test('durations read the way people say them', () => {
  assert.equal(fmtDuration(0), '0 sec')
  assert.equal(fmtDuration(45), '45 sec')
  assert.equal(fmtDuration(600), '10 min')
  assert.equal(fmtDuration(3 * 3600 + 20 * 60), '3 hr 20 min')
  assert.equal(fmtDuration(3600), '1 hr')
  assert.equal(fmtDuration(3600 * 2 - 10), '2 hr', 'never “1 hr 60 min”')
  assert.equal(fmtDuration(86400), '1 day')
  assert.equal(fmtDuration(86400 * 2 + 3600 * 5), '2 days 5 hr')
  assert.equal(fmtDuration(86400 * 2 - 60), '2 days', 'never “1 day 24 hr”')
  assert.equal(fmtDuration(-5), '0 sec')
})

test('percentages', () => {
  assert.equal(fmtPercent(0), '0%')
  assert.equal(fmtPercent(0.4), '<1%')
  assert.equal(fmtPercent(3.44), '3.4%')
  assert.equal(fmtPercent(3), '3%')
  assert.equal(fmtPercent(99.6), '100%')
  assert.equal(fmtPercent(12.5), '13%')
})

test('counts, and short numbers for a scale', () => {
  assert.equal(fmtCount(1284), (1284).toLocaleString())
  assert.equal(fmtCompact(0), '0')
  assert.equal(fmtCompact(500), '500')
  assert.equal(fmtCompact(1500), '1.5K')
  assert.equal(fmtCompact(2_000_000), '2M')
})

test('the rest', () => {
  assert.equal(fmtMs(4.25), '4.3 ms')
  assert.equal(fmtMs(240), '240 ms')
  assert.equal(fmtFps(59.94), '59.9 fps')
  assert.equal(fmtCelsius(62.4), '62°C')
  assert.equal(fmtAgo(1000, 1010), 'just now')
  assert.equal(fmtAgo(1000, 1000 + 3600 * 3), '3 hr ago')
})

test('anything missing or nonsense shows a dash, never NaN', () => {
  for (const f of [fmtBytes, fmtBits, fmtDuration, fmtPercent, fmtCount, fmtMs, fmtFps, fmtCelsius, fmtKbps, fmtBytesRate]) {
    for (const bad of [undefined, null, NaN, Infinity, 'x']) assert.equal(f(bad), '–', `${f.name}(${bad})`)
  }
  assert.equal(formatValue('bytes', null), '–')
  assert.equal(formatValue('text', ''), '–')
  assert.equal(formatValue('text', 'hello'), 'hello')
  assert.equal(formatValue('count', 0), '0', 'a real zero is a zero')
})

test('a scale tops out at a round number at or above the largest value', () => {
  assert.equal(niceMax(0), 1)
  assert.equal(niceMax(3), 4)
  assert.equal(niceMax(7), 10)
  assert.equal(niceMax(101), 200)
  assert.equal(niceMax(1, 'count'), 1)
  assert.equal(niceMax(1.5 * 1024 ** 3, 'bytes'), 2 * 1024 ** 3, 'in steps of the unit shown')
  const rate = niceMax(1_000_000, 'bitsRate')
  assert.equal(rate * 8, 10_000_000, 'bytes in, a round number of bits out')
  for (const v of [1, 2.5, 9, 77, 999, 1001, 12345, 1e7]) assert.ok(niceMax(v) >= v, String(v))
})
