// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 WittyWilla and contributors
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKey, type PointerEvent as ReactPointer } from 'react'
import type { Column, Table } from './exports.ts'
import { fmtCompact, fmtTime, formatValue, niceMax, type Kind } from './format.ts'
import { Icon, usingRemote } from './parts.tsx'
import { cellText, type BarsSpec, type ColumnsSpec, type Figure, type Item, type LineSpec, type Meter, type SeriesSpec } from './views.ts'

// Hand-drawn charts, one system. Marks are thin, grids are hairlines, there's only ever one
// scale on a chart, and text wears text colours with a marked key beside it. Shapes are drawn
// with the plot stretched to its box and the strokes kept true, so a chart can be any size and
// nothing has to be measured. Hovering writes to the page directly: a pointer moving over a
// chart should never cost a render.

type Readout = { title: string; rows: { name: string; value: string; key?: string }[] }

function scaleText(kind: Kind, v: number) {
  if (v === 0) return '0'
  if (kind === 'count') return fmtCompact(v)
  return formatValue(kind, v)
}

// The little box beside the pointer or the focused chart. Built with textContent, as names on it
// are other people's words.
function paintTip(tip: HTMLElement, r: Readout, fraction: number) {
  tip.replaceChildren()
  const head = document.createElement('div')
  head.className = 'wst-tip-title'
  head.textContent = r.title
  tip.appendChild(head)
  for (const row of r.rows) {
    const line = document.createElement('div')
    line.className = 'wst-tip-row'
    if (row.key) {
      const k = document.createElement('i')
      k.className = 'wst-key-line ' + row.key
      line.appendChild(k)
    }
    const value = document.createElement('strong')
    value.textContent = row.value
    const name = document.createElement('span')
    name.textContent = row.name
    line.append(value, name)
    tip.appendChild(line)
  }
  tip.hidden = false
  // On whichever side has the room.
  if (fraction > 0.55) { tip.style.left = ''; tip.style.right = `${(1 - fraction) * 100}%` } else { tip.style.right = ''; tip.style.left = `${fraction * 100}%` }
}

function nearest(times: number[], t: number) {
  let lo = 0, hi = times.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] < t) lo = mid; else hi = mid
  }
  return Math.abs(times[lo] - t) <= Math.abs(times[hi] - t) ? lo : hi
}

const X = 1000 // the plot's own width, stretched to fit; its height is 100

// A gap in the record is drawn as a gap: a line across it would claim readings nobody took.
function pathOf(s: SeriesSpec, from: number, to: number, yMax: number) {
  const span = to - from || 1
  let gap = 0
  if (s.times.length > 2) {
    const steps = s.times.slice(1).map((t, i) => t - s.times[i]).sort((a, b) => a - b)
    gap = Math.max(steps[Math.floor(steps.length / 2)] * 4, 180)
  }
  let d = ''
  let area = ''
  let start = -1, lastX = 0
  const n = s.times.length
  for (let i = 0; i < n; i++) {
    const x = ((s.times[i] - from) / span) * X
    const y = 100 - (Math.min(s.values[i], yMax) / yMax) * 100
    const cut = i === 0 || (gap > 0 && s.times[i] - s.times[i - 1] > gap)
    if (cut) {
      if (start >= 0) area += `L${lastX.toFixed(1)} 100L${start.toFixed(1)} 100Z`
      start = x
      d += `M${x.toFixed(1)} ${y.toFixed(2)}`
      area += `M${x.toFixed(1)} ${y.toFixed(2)}`
    } else {
      const seg = `L${x.toFixed(1)} ${y.toFixed(2)}`
      d += seg
      area += seg
    }
    lastX = x
  }
  if (start >= 0) area += `L${lastX.toFixed(1)} 100L${start.toFixed(1)} 100Z`
  return { d, area }
}

const SHAPES = ['wst-m-muted', 'wst-m-round', 'wst-m-square', 'wst-m-diamond']

export const LineChart = memo(function LineChart({ spec, large, name }: { spec: LineSpec; large?: boolean; name?: string }) {
  const plot = useRef<HTMLDivElement>(null)
  const cross = useRef<HTMLDivElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const at = useRef<number | null>(null)
  const specRef = useRef(spec)
  specRef.current = spec
  const [remote, setRemote] = useState(false)
  useEffect(() => { setRemote(usingRemote()) }, [])

  const { series, from, to, kind } = spec
  const yMax = useMemo(() => {
    if (spec.yMax) return spec.yMax
    let m = 0
    for (const s of series) for (const v of s.values) if (v > m) m = v
    return niceMax(m, kind)
  }, [spec.yMax, series, kind])
  const shapes = useMemo(() => series.map((s) => ({ s, ...pathOf(s, from, to, yMax) })), [series, from, to, yMax])

  const show = (t: number, fraction?: number) => {
    const spec = specRef.current
    const lead = spec.series.find((s) => s.times.length) ?? spec.series[0]
    if (!lead || !tip.current || !cross.current) return
    const i = nearest(lead.times, t)
    const when = lead.times[i]
    at.current = when
    const f = fraction ?? (when - spec.from) / (spec.to - spec.from || 1)
    cross.current.style.left = `${f * 100}%`
    cross.current.hidden = false
    paintTip(tip.current, {
      title: fmtTime(when, spec.to - spec.from),
      rows: spec.series.filter((s) => s.times.length).map((s) => ({ name: s.name, value: formatValue(spec.kind, s.values[nearest(s.times, when)]), key: `wst-c${s.slot}` })),
    }, f)
  }
  const hide = () => {
    at.current = null
    if (cross.current) cross.current.hidden = true
    if (tip.current) tip.current.hidden = true
  }
  const onMove = (e: ReactPointer) => {
    const box = plot.current?.getBoundingClientRect()
    if (!box?.width) return
    const f = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width))
    show(from + f * (to - from))
  }
  // Keeps the readout right as new readings arrive under it.
  useEffect(() => { if (at.current !== null) show(at.current) })

  const onKey = (e: ReactKey) => {
    if (usingRemote()) return
    const lead = series.find((s) => s.times.length)
    if (!lead || at.current === null) return
    const i = nearest(lead.times, at.current)
    const step = Math.max(1, Math.round(lead.times.length / 24))
    let to2: number | null = null
    if (e.key === 'ArrowLeft' && i > 0) to2 = Math.max(0, i - step)
    else if (e.key === 'ArrowRight' && i < lead.times.length - 1) to2 = Math.min(lead.times.length - 1, i + step)
    else if (e.key === 'Home') to2 = 0
    else if (e.key === 'End') to2 = lead.times.length - 1
    if (to2 === null) return
    e.preventDefault()
    show(lead.times[to2])
  }

  if (spec.message) return <div className={'wst-chart-note' + (spec.waiting ? ' waiting' : '')}>{spec.message}</div>

  const legend = series.length > 1
  const ticks = [yMax, yMax / 2, 0]
  const span = to - from
  const lastPoints = series.filter((s) => s.times.length).map((s) => ({ s, x: ((s.times[s.times.length - 1] - from) / (span || 1)) * 100, y: 100 - (Math.min(s.values[s.values.length - 1], yMax) / yMax) * 100 }))
  return (
    <figure className={'wst-line' + (large ? ' large' : '')}>
      {spec.title !== name && <figcaption className="wst-chart-title">{spec.title}</figcaption>}
      {legend && (
        <ul className="wst-legend">
          {series.map((s) => (
            <li key={s.key}><i className={'wst-key-line wst-c' + s.slot} /><i className={'wst-key-mark wst-c' + s.slot + ' ' + SHAPES[s.slot]} />{s.name}<strong>{formatValue(kind, s.values[s.values.length - 1])}</strong></li>
          ))}
        </ul>
      )}
      <div className="wst-line-box">
        <div className="wst-yaxis" aria-hidden="true">
          {ticks.map((t, i) => <span key={i} style={{ top: `${(i / 2) * 100}%` }}>{scaleText(kind, t)}</span>)}
        </div>
        <div ref={plot} className="wst-plot" role="img" aria-label={spec.summary} tabIndex={remote ? undefined : 0}
          onPointerMove={onMove} onPointerLeave={hide} onFocus={() => { const l = series.find((s) => s.times.length); if (l) show(l.times[l.times.length - 1]) }} onBlur={hide} onKeyDown={onKey}>
          <svg viewBox={`0 0 ${X} 100`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <line className="wst-grid-line" x1="0" x2={X} y1="0.5" y2="0.5" vectorEffect="non-scaling-stroke" />
            <line className="wst-grid-line" x1="0" x2={X} y1="50" y2="50" vectorEffect="non-scaling-stroke" />
            <line className="wst-base-line" x1="0" x2={X} y1="99.5" y2="99.5" vectorEffect="non-scaling-stroke" />
            {series.length === 1 && <path className={'wst-area wst-c' + series[0].slot} d={shapes[0].area} />}
            {shapes.map(({ s, d }) => <path key={s.key} className={'wst-stroke wst-c' + s.slot} d={d} vectorEffect="non-scaling-stroke" />)}
          </svg>
          {lastPoints.map(({ s, x, y }) => <i key={s.key} className={'wst-end ' + SHAPES[s.slot] + ' wst-c' + s.slot} style={{ left: `${x}%`, top: `${y}%` }} />)}
          <div ref={cross} className="wst-cross" hidden />
          <div ref={tip} className="wst-tip" hidden />
        </div>
      </div>
      <div className="wst-xaxis" aria-hidden="true"><span>{fmtTime(from, span)}</span><span>{fmtTime(to, span)}</span></div>
    </figure>
  )
})

const TONE: Record<string, string> = { accent: 'wst-c1', warn: 'wst-warn', danger: 'wst-danger' }

export const Columns = memo(function Columns({ spec }: { spec: ColumnsSpec }) {
  const tip = useRef<HTMLDivElement>(null)
  const specRef = useRef(spec)
  specRef.current = spec
  const yMax = useMemo(() => {
    if (spec.yMax) return spec.yMax
    let m = 0
    for (let i = 0; i < spec.labels.length; i++) {
      let sum = 0
      for (const s of spec.series) sum += s.values[i]
      if (sum > m) m = sum
    }
    return niceMax(m, spec.kind)
  }, [spec])
  const paint = (e: ReactPointer) => {
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
    if (!hit || !tip.current) return
    const i = Number(hit.dataset.i)
    const s = specRef.current
    paintTip(tip.current, {
      title: (s.xTitle ? s.xTitle + ' ' : '') + s.labels[i],
      rows: s.series.map((x) => ({ name: x.name, value: formatValue(s.kind, x.values[i]), key: TONE[x.tone] })),
    }, (i + 0.5) / s.labels.length)
  }
  const ticks = [yMax, yMax / 2, 0]
  return (
    <figure className="wst-cols-figure">
      <figcaption className="wst-chart-title">{spec.title}</figcaption>
      {spec.series.length > 1 && (
        <ul className="wst-legend">
          {spec.series.map((s) => <li key={s.name}>{s.tone !== 'accent' && <Icon name={s.tone} size={14} />}<i className={'wst-key-box ' + TONE[s.tone]} />{s.name}</li>)}
        </ul>
      )}
      <div className="wst-line-box">
        <div className="wst-yaxis" aria-hidden="true">
          {ticks.map((t, i) => <span key={i} style={{ top: `${(i / 2) * 100}%` }}>{scaleText(spec.kind, t)}</span>)}
        </div>
        <div className="wst-cols" role="img" aria-label={spec.summary} onPointerMove={paint} onPointerLeave={() => { if (tip.current) tip.current.hidden = true }}>
          {spec.labels.map((_, i) => (
            <div key={i} className="wst-col" data-i={i}>
              {[...spec.series].reverse().map((s) => {
                const pct = (s.values[i] / yMax) * 100
                return pct > 0 ? <i key={s.name} className={'wst-seg ' + TONE[s.tone]} style={{ height: `${Math.min(100, pct)}%` }} /> : null
              })}
            </div>
          ))}
          <div ref={tip} className="wst-tip" hidden />
        </div>
      </div>
      <div className="wst-xlabels" aria-hidden="true">
        {spec.labels.map((l, i) => <span key={i}>{i % spec.every === 0 ? l : ''}</span>)}
      </div>
    </figure>
  )
})

export const Bars = memo(function Bars({ spec, name }: { spec: BarsSpec; name?: string }) {
  const max = spec.rows.reduce((m, r) => Math.max(m, r.value), 0) || 1
  return (
    <div className="wst-bars-box">
      {spec.title !== name && <div className="wst-chart-title">{spec.title}</div>}
      <ul className="wst-bars" aria-label={spec.summary}>
        {spec.rows.map((r, i) => (
          <li key={r.label + i}>
            <span className="wst-bar-label">{r.label}</span>
            <span className="wst-bar-value">{r.text}</span>
            <span className="wst-bar-track" aria-hidden="true"><i style={{ width: `${r.value > 0 ? Math.max(1, (r.value / max) * 100) : 0}%` }} /></span>
          </li>
        ))}
      </ul>
      {spec.more ? <p className="wst-more">{spec.more} more in the details.</p> : null}
    </div>
  )
})

export function MeterBar({ m }: { m: Meter }) {
  const pct = Math.max(0, Math.min(100, m.pct))
  return (
    <div className={'wst-meter' + (m.level ? ' ' + m.level : '')}>
      <div className="wst-meter-head">
        <span>{m.label}</span>
        <span className="wst-meter-text">{m.level && m.level !== 'ok' && <span className="wst-level"><Icon name={m.level === 'danger' ? 'danger' : 'warn'} size={14} />{m.word}</span>}{m.text}</span>
      </div>
      <div className="wst-meter-track" role="meter" aria-label={m.label + (m.word ? `, ${m.word}` : '')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={m.text}>
        <i style={{ transform: `translateX(${pct - 100}%)` }} />
      </div>
    </div>
  )
}

export function Figures({ list }: { list: Figure[] }) {
  return (
    <dl className="wst-figures">
      {list.map((f) => (
        <div key={f.label} className={f.big ? 'big' : undefined}>
          <dt>{f.label}</dt>
          <dd>{f.value}{f.sub && <small>{f.sub}</small>}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Items({ list }: { list: Item[] }) {
  return (
    <ul className="wst-items">
      {list.map((it) => (
        <li key={it.key} className="wst-item">
          {(it.title || it.tags?.length) && (
            <div className="wst-item-head">
              <div className="wst-item-name">
                {it.title && <strong>{it.title}</strong>}
                {it.sub && <span>{it.sub}</span>}
              </div>
              {it.tags?.length ? <div className="wst-tags">{it.tags.map((t) => <span key={t.text} className={'wst-tag' + (t.tone ? ' ' + t.tone : '')}>{t.tone === 'warn' && <Icon name="warn" size={14} />}{t.tone === 'danger' && <Icon name="danger" size={14} />}{t.text}</span>)}</div> : null}
            </div>
          )}
          {it.meters?.map((m) => <MeterBar key={m.label} m={m} />)}
          {it.facts?.length ? <dl className="wst-facts">{it.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl> : null}
          {it.note && <p className="wst-item-note">{it.note}</p>}
        </li>
      ))}
    </ul>
  )
}

function CellOf({ c, v }: { c: Column; v: Table['rows'][number][string] }) {
  return <>{cellText(c, v)}</>
}

const numeric = (c: Column) => !!c.kind && c.kind !== 'text' && c.kind !== 'time' && c.kind !== 'ago'

// A real table: a caption, headings with their scope, and the first column heading each row.
// Where it's too narrow for columns, each row stacks up with its labels beside the values.
export const DataTable = memo(function DataTable({ t, limit }: { t: Table; limit?: number }) {
  const rows = limit ? t.rows.slice(0, limit) : t.rows
  const hidden = t.rows.length - rows.length
  return (
    <div className="wst-table-wrap">
      <table className={'ui-table wst-table' + (t.columns.length > 4 ? ' many' : '')}>
        <caption>{t.caption}</caption>
        <thead><tr>{t.columns.map((c, j) => <th key={c.key} scope="col" className={j > 0 && numeric(c) ? 'end' : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {t.columns.map((c, j) => j === 0
                ? <th key={c.key} scope="row" data-label={c.label}><CellOf c={c} v={r[c.key]} /></th>
                : <td key={c.key} data-label={c.label} className={numeric(c) ? 'end' : undefined}><CellOf c={c} v={r[c.key]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {t.rows.length === 0 && <p className="wst-more">Nothing to list right now.</p>}
      {hidden > 0 && <p className="wst-more">Showing {rows.length} of {t.rows.length.toLocaleString()}. The details have them all.</p>}
      {t.note && <p className="wst-more">{t.note}</p>}
    </div>
  )
})
