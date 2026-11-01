import assert from 'node:assert/strict'
import { test } from 'node:test'
import { csvCell, fileName, neutralize, tableToCsv, tablesToCsv, tablesToJson } from '../src/exports.ts'

test('a cell a spreadsheet would run gets a quote in front', () => {
  for (const bad of ['=1+1', '+1', '-1', '@SUM(A1)', '=cmd|calc!A1', ' =1', '\t=1', ' =1', '\r=1', '\n=1', '＝1', '-']) {
    assert.ok(csvCell(bad).replace(/^"/, '').startsWith("'"), JSON.stringify(bad))
    assert.equal(neutralize(bad)[0], "'")
  }
})

test('ordinary words and numbers are left alone', () => {
  assert.equal(csvCell('Hello'), 'Hello')
  assert.equal(csvCell('a=b'), 'a=b')
  assert.equal(csvCell('2 + 2'), '2 + 2')
  assert.equal(csvCell(12.5), '12.5')
  assert.equal(csvCell(-3), '-3', 'a real negative number is a number, not a formula')
  assert.equal(csvCell(0), '0')
  assert.equal(csvCell(true), 'yes')
  assert.equal(csvCell(null), '')
  assert.equal(csvCell(undefined), '')
  assert.equal(csvCell(NaN), '')
})

test('commas, quotes and line breaks are quoted', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('two\nlines'), '"two\nlines"')
  assert.equal(csvCell('=a,b'), `"'=a,b"`, 'neutralized and quoted')
})

const columns = [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'size', label: 'Size', kind: 'bytes' }, { key: 'at', label: 'When', kind: 'time' }, { key: 'pct', label: 'Used', kind: 'pct' }]
const t = { caption: 'Things', columns, rows: [{ name: '=evil()', size: 1024, at: 86400, pct: 50 }, { name: 'plain, with comma', size: 0, at: 0 }] }

test('a table has its units in the headings, raw numbers and ISO dates', () => {
  assert.equal(tableToCsv(t), [
    'Name,Size (bytes),When,Used (percent)',
    `'=evil(),1024,1970-01-02T00:00:00.000Z,50`,
    '"plain, with comma",0,0,',
  ].join('\r\n'))
})

test('one table is just that, marked as UTF-8; several sit under their captions', () => {
  assert.ok(tablesToCsv([t]).startsWith('﻿Name,'))
  assert.ok(tablesToCsv([t]).endsWith('\r\n'))
  const two = tablesToCsv([t, { ...t, caption: 'More' }])
  assert.ok(two.startsWith('﻿Things\r\nName,'))
  assert.ok(two.includes('\r\n\r\nMore\r\nName,'))
})

test('JSON holds the raw values, with units beside the columns', () => {
  const j = JSON.parse(tablesToJson('A widget', [{ ...t, note: 'Note' }], new Date(0), 'the last hour'))
  assert.equal(j.title, 'A widget')
  assert.equal(j.range, 'the last hour')
  assert.equal(j.exportedAt, '1970-01-01T00:00:00.000Z')
  const table = j.tables[0]
  assert.equal(table.caption, 'Things')
  assert.equal(table.note, 'Note')
  assert.deepEqual(table.columns[1], { key: 'size', label: 'Size', unit: 'bytes' })
  assert.deepEqual(table.columns[0], { key: 'name', label: 'Name' })
  assert.deepEqual(table.rows[0], { name: '=evil()', size: 1024, at: '1970-01-02T00:00:00.000Z', pct: 50 })
  assert.equal(table.rows[1].pct, null, 'missing is null')
})

test('a file’s name is tidy and can’t hold a path', () => {
  assert.equal(fileName('cpu', 'csv', new Date(Date.UTC(2026, 10, 1, 14, 30))), 'wittystats-cpu-2026-11-01-14-30.csv')
  assert.equal(fileName('../x', 'json', new Date(0)), 'wittystats-x-1970-01-01-00-00.json')
})
