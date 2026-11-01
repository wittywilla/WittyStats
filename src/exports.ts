// CSV and JSON of what's on screen. Everything is made in the browser from what it already
// holds, so an export asks the server for nothing.
import { UNIT_NAMES, type Kind } from './format.ts'

export type Cell = string | number | boolean | null | undefined
export type Column = { key: string; label: string; kind?: Kind }
export type Row = Record<string, Cell>
export type Table = { caption: string; columns: Column[]; rows: Row[]; note?: string }

// A spreadsheet runs a cell starting with these as a formula. A title or a name on a media
// server is anyone's to choose, so text like that gets a quote in front, which shows the
// words and stops them running. Spaces first don't make it safe, nor do tabs and line
// breaks, which spreadsheets also skip.
const RUNS = /^[\s ]*[=+\-@＝＋－＠]|^[\t\r\n]/

export function neutralize(text: string) {
  return RUNS.test(text) ? "'" + text : text
}

export function csvCell(v: Cell) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  const safe = neutralize(v)
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export const headingOf = (c: Column) => {
  const unit = c.kind ? UNIT_NAMES[c.kind] : undefined
  return unit ? `${c.label} (${unit})` : c.label
}

// A time goes out as an ISO date, which every spreadsheet reads. Other numbers stay raw, with
// the unit in the heading, so they can be added up.
export function rawValue(c: Column, v: Cell): Cell {
  if ((c.kind === 'time' || c.kind === 'ago') && typeof v === 'number' && v > 0) return new Date(v * 1000).toISOString()
  return v
}

export function tableToCsv(t: Table) {
  const lines = [t.columns.map((c) => csvCell(headingOf(c))).join(',')]
  for (const r of t.rows) lines.push(t.columns.map((c) => csvCell(rawValue(c, r[c.key]))).join(','))
  return lines.join('\r\n')
}

// Several tables go one after another, each under its caption, with a blank line between. A
// byte order mark at the start tells spreadsheets it's UTF-8, or accents come out wrong.
export function tablesToCsv(tables: Table[]) {
  if (tables.length === 1) return '﻿' + tableToCsv(tables[0]) + '\r\n'
  return '﻿' + tables.map((t) => csvCell(t.caption) + '\r\n' + tableToCsv(t)).join('\r\n\r\n') + '\r\n'
}

export function tablesToJson(title: string, tables: Table[], exportedAt: Date, range?: string) {
  return JSON.stringify({
    title, exportedAt: exportedAt.toISOString(), ...(range ? { range } : {}),
    tables: tables.map((t) => ({
      caption: t.caption,
      ...(t.note ? { note: t.note } : {}),
      columns: t.columns.map((c) => ({ key: c.key, label: c.label, ...(c.kind && UNIT_NAMES[c.kind] ? { unit: UNIT_NAMES[c.kind] } : {}) })),
      rows: t.rows.map((r) => Object.fromEntries(t.columns.map((c) => [c.key, rawValue(c, r[c.key]) ?? null]))),
    })),
  }, null, 2) + '\n'
}

export function fileName(id: string, ext: string, at: Date) {
  const stamp = at.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return `wittystats-${id.replace(/[^a-z0-9-]/gi, '')}-${stamp}.${ext}`
}
