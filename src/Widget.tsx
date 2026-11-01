import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bars, Columns, DataTable, Figures, Items, LineChart, MeterBar } from './charts.tsx'
import type { Placed, ViewKind } from './layout.ts'
import { MAX_H, MAX_W } from './layout.ts'
import { Btn, Icon } from './parts.tsx'
import type { Slice, StatsStore } from './store.ts'
import { CARD_TABLE_ROWS, buildView, type Ctx, type Prepared, type View } from './views.ts'
import type { WidgetDef } from './widgets.ts'

// New readings reach a few widgets per frame, never all of them at once, so a cheap TV keeps a
// steady picture while they arrive.
const queue = new Map<object, () => void>()
let scheduled = false
function flush() {
  const end = performance.now() + 6
  for (const [key, run] of queue) {
    queue.delete(key)
    run()
    if (performance.now() >= end) break
  }
  scheduled = false
  if (queue.size) schedule()
}
function schedule() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(flush)
}
export function enqueue(key: object, run: () => void) {
  queue.set(key, run)
  schedule()
}
export const dequeue = (key: object) => queue.delete(key)

export function contextOf(store: StatsStore, range: string): Ctx {
  return {
    catalog: store.catalog!, now: store.now, samples: store.run, nowSections: store.nowSections, report: store.report, reportError: store.reportError, range,
    series: (name) => store.seriesData(name, range), history: store.historyState(range), clock: store.now?.time ?? Math.floor(Date.now() / 1000),
  }
}

const relevant = (def: WidgetDef, s: Slice) =>
  s === 'catalog' || (s === 'now' && (!!def.live || !!def.series)) || (s === 'report' && !!(def.report || def.alsoReport)) || (s === 'history' && !!(def.series || def.detailSeries))

// A widget's numbers, kept up to date. `showing` false means it's scrolled away, and it then
// costs nothing until it comes back.
export function useWidgetView(store: StatsStore, def: WidgetDef, range: string, detail: boolean, showing: boolean, minGap = 0) {
  const key = useRef({}).current
  const build = useCallback(() => buildView(def.id, contextOf(store, range), detail), [store, def.id, range, detail])
  const [prep, setPrep] = useState<Prepared>(build)
  const dirty = useRef(false)
  const last = useRef(0)
  const showingRef = useRef(showing)
  showingRef.current = showing
  useEffect(() => { setPrep(build()); dirty.current = false }, [build])
  useEffect(() => {
    if (showing && dirty.current) { dirty.current = false; enqueue(key, () => setPrep(build())) }
  }, [showing, build, key])
  useEffect(() => {
    let wait: ReturnType<typeof setTimeout> | null = null
    const off = store.subscribe((s) => {
      if (!relevant(def, s)) return
      if (!showingRef.current) { dirty.current = true; return }
      if (s === 'now' && minGap) {
        const gap = minGap - (performance.now() - last.current)
        if (gap > 0) { wait ??= setTimeout(() => { wait = null; last.current = performance.now(); enqueue(key, () => setPrep(build())) }, gap); return }
        last.current = performance.now()
      }
      enqueue(key, () => setPrep(build()))
    })
    return () => { off(); dequeue(key); if (wait) clearTimeout(wait) }
  }, [store, def, build, key, minGap])
  return prep
}

function Waiting({ text }: { text: string }) {
  return <p className="wst-state waiting"><span className="wst-dot" aria-hidden="true" />{text}</p>
}

export function Body({ view, as, large, name, onRetry }: { view: View; as: ViewKind; large?: boolean; name?: string; onRetry?: () => void }) {
  if (view.state === 'loading') return <Waiting text={view.message ?? 'Loading…'} />
  if (view.state === 'error') {
    return (
      <div className="wst-state error" role="alert">
        <p><Icon name="danger" size={16} /> {view.message}</p>
        {view.retry && onRetry && <Btn small icon="refresh" label="Try again" onClick={onRetry}>Try again</Btn>}
      </div>
    )
  }
  if (as === 'table' && view.tables.length) {
    return (
      <div className="wst-tables">
        {view.message && <p className="wst-state">{view.message}</p>}
        {view.tables.filter((t) => t.rows.length || !view.message).map((t) => <DataTable key={t.caption} t={t} limit={large ? undefined : CARD_TABLE_ROWS} />)}
        {view.notes?.map((n) => <p key={n} className="wst-note">{n}</p>)}
      </div>
    )
  }
  if (view.state === 'empty') return <p className="wst-state"><Icon name="check" size={16} /> {view.message}</p>
  const facts = (
    <>
      {view.figures && <Figures list={view.figures} />}
      {view.meters && <div className="wst-meters">{view.meters.map((m) => <MeterBar key={m.label} m={m} />)}</div>}
    </>
  )
  // A figure or two beside the chart, when the card has the width. Otherwise above it.
  const split = !large && view.lines?.length && (view.figures || view.meters) && (view.figures?.length ?? 0) <= 3
  return (
    <>
      {split
        ? (
          <div className="wst-split">
            <div className="wst-split-side">{facts}</div>
            <div className="wst-split-main">{view.lines!.map((l) => <LineChart key={l.id} spec={l} name={name} />)}</div>
          </div>
        )
        : <>{facts}{view.lines?.map((l) => <LineChart key={l.id} spec={l} large={large} name={name} />)}</>}
      {view.columns?.map((c) => <Columns key={c.title} spec={c} />)}
      {view.bars?.map((b) => <Bars key={b.title} spec={b} name={name} />)}
      {view.items && <Items list={view.items} />}
      {view.more && <p className="wst-more">{view.more}</p>}
      {view.notes?.map((n) => <p key={n} className="wst-note">{n}</p>)}
    </>
  )
}

type CardProps = {
  def: WidgetDef
  placed: Placed
  store: StatsStore
  range: string
  globalView: ViewKind
  customising: boolean
  showing: boolean
  first: boolean
  last: boolean
  onSetView: (id: string, view: ViewKind) => void
  onDetail: (id: string) => void
  onAct: (act: string, id: string) => void
  onDragStart?: (e: React.PointerEvent, id: string, how: 'move' | 'size') => void
}

export const Card = memo(function Card({ def, placed, store, range, globalView, customising, showing, first, last, onSetView, onDetail, onAct, onDragStart }: CardProps) {
  const prep = useWidgetView(store, def, range, false, showing)
  const as: ViewKind = placed.view ?? globalView
  const unavailable = prep.kind === 'unavailable'
  const cls = useMemo(() => `wst-card wst-w${placed.w} wst-h${placed.h}${customising ? ' customising' : ''}${unavailable ? ' unavailable' : ''}`, [placed.w, placed.h, customising, unavailable])
  if (prep.kind === 'hidden') return null
  const name = def.title
  return (
    <section className={cls} data-wst-card={def.id} aria-label={name} data-nav-group>
      <header className="wst-card-head">
        {customising && onDragStart && <span className="wst-grip" aria-hidden="true" title="Drag to move" onPointerDown={(e) => onDragStart(e, def.id, 'move')}><Icon name="grip" /></span>}
        <h2>{name}</h2>
        {def.estimate && <span className="wst-tag estimate">Estimate</span>}
        {!unavailable && (
          <div className="wst-card-actions">
            <Btn small variant="ghost" icon={as === 'table' ? 'chart' : 'table'} label={as === 'table' ? `Show ${name} as a chart` : `Show ${name} as a table`} act="view" who={def.id} onClick={() => onSetView(def.id, as === 'table' ? 'chart' : 'table')} />
            <Btn small variant="ghost" icon="expand" label={`Details of ${name}`} act="detail" who={def.id} onClick={() => onDetail(def.id)} />
          </div>
        )}
      </header>
      <div className="wst-card-body" aria-busy={prep.kind === 'view' && prep.view.state === 'loading'}>
        {unavailable
          ? <p className="wst-state"><Icon name="info" size={16} /> Not available here. {prep.why}</p>
          : <Body view={prep.view} as={as} name={name} onRetry={() => store.retryReport()} />}
      </div>
      {customising && (
        <div className="wst-card-tools" role="group" aria-label={`Arrange ${name}`}>
          <Btn small icon="left" label={`Move ${name} earlier`} act="earlier" who={def.id} off={first} onOff={() => onAct('earlier', def.id)} onClick={() => onAct('earlier', def.id)} />
          <Btn small icon="right" label={`Move ${name} later`} act="later" who={def.id} off={last} onOff={() => onAct('later', def.id)} onClick={() => onAct('later', def.id)} />
          <Btn small icon="wider" label={`Make ${name} wider`} act="wider" who={def.id} off={placed.w >= MAX_W} onOff={() => onAct('wider', def.id)} onClick={() => onAct('wider', def.id)} />
          <Btn small icon="narrower" label={`Make ${name} narrower`} act="narrower" who={def.id} off={placed.w <= 1} onOff={() => onAct('narrower', def.id)} onClick={() => onAct('narrower', def.id)} />
          <Btn small icon="taller" label={`Make ${name} taller`} act="taller" who={def.id} off={placed.h >= MAX_H} onOff={() => onAct('taller', def.id)} onClick={() => onAct('taller', def.id)} />
          <Btn small icon="shorter" label={`Make ${name} shorter`} act="shorter" who={def.id} off={placed.h <= 1} onOff={() => onAct('shorter', def.id)} onClick={() => onAct('shorter', def.id)} />
          <Btn small icon="trash" label={`Remove ${name}`} act="remove" who={def.id} onClick={() => onAct('remove', def.id)} />
        </div>
      )}
      {customising && onDragStart && <span className="wst-resize" aria-hidden="true" title="Drag to resize" onPointerDown={(e) => onDragStart(e, def.id, 'size')} />}
    </section>
  )
})
