import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointer } from 'react'
import { AddDialog, ConfirmDialog, CustomiseBar, NameDialog } from './Customise.tsx'
import { Detail } from './Detail.tsx'
import {
  DEFAULT_RANGE, activeLayout, addWidget, applyPreset, canMove, createLayout, deleteLayout, fitsStore, moveWidget, moveWidgetTo, parseSaved, removeWidget, renameLayout, replaceLayout, resizeWidget,
  serialize, setWidgetSize, setWidgetView, stock, switchLayout, type Layout, type Saved, type ViewKind,
} from './layout.ts'
import { Btn, Icon } from './parts.tsx'
import { StatsStore, type StreamState } from './store.ts'
import type { Catalog, Host } from './types.ts'
import { rangeName, seriesFor } from './views.ts'
import { Card } from './Widget.tsx'
import { PRESET_NAMES, WIDGET_BY_ID, allowed, availability, liveSections, type PresetId } from './widgets.ts'
import './stats.css'

const STORE_KEY = 'layouts'
const SAVE_WAIT = 400

const STREAM_WORDS: Record<StreamState, string> = {
  off: '', connecting: 'Connecting…', live: 'Live', retrying: 'Reconnecting. These numbers may be out of date.', hidden: 'Stopped while this page is hidden', paused: 'Paused',
}

export function StatsPage({ host }: { host: Host }) {
  const store = useMemo(() => new StatsStore(host), [host])
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [saved, setSavedState] = useState<Saved | null>(null)

  useEffect(() => {
    let gone = false
    const off = store.subscribe((s) => {
      if (s !== 'catalog') return
      setCatalog(store.catalog)
      setFailed(store.catalog ? null : store.catalogError)
    })
    store.reopen()
    void store.loadCatalog()
    Promise.resolve().then(() => host.store.get(STORE_KEY)).then((raw) => { if (!gone) setSavedState(parseSaved(raw, !host.user.admin)) }).catch(() => { if (!gone) setSavedState(stock(!host.user.admin)) })
    return () => { gone = true; off(); store.close() }
  }, [store, host])

  if (failed) {
    return (
      <div className="wst-page">
        <h1 className="wst-title">Statistics</h1>
        <div className="wst-state error" role="alert">
          <p><Icon name="danger" size={16} /> {failed}</p>
          <Btn icon="refresh" label="Try again" onClick={() => { setFailed(null); void store.loadCatalog() }}>Try again</Btn>
        </div>
      </div>
    )
  }
  if (!catalog || !saved) return <div className="wst-page"><h1 className="wst-title">Statistics</h1><p className="wst-state waiting" role="status"><span className="wst-dot" aria-hidden="true" />Loading…</p></div>
  if (!catalog.access.visible) {
    return (
      <div className="wst-page">
        <h1 className="wst-title">Statistics</h1>
        <p className="wst-state"><Icon name="info" size={16} /> Statistics aren’t available to this account. The server’s owner chooses who can see them, in Settings.</p>
      </div>
    )
  }
  return <Dashboard host={host} store={store} catalog={catalog} initial={saved} />
}

function Dashboard({ host, store, catalog, initial }: { host: Host; store: StatsStore; catalog: Catalog; initial: Saved }) {
  const ranges = catalog.ranges
  const [saved, setSaved] = useState<Saved>(() => (ranges.includes(initial.range) ? initial : { ...initial, range: ranges.includes(DEFAULT_RANGE) ? DEFAULT_RANGE : ranges[0] ?? DEFAULT_RANGE }))
  const [customising, setCustomising] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'add' | 'new' | 'rename' | 'delete' | 'reset' | null>(null)
  const [undo, setUndo] = useState<Saved[]>([])
  const [spoken, setSpoken] = useState('')
  const [stream, setStream] = useState<StreamState>(store.stream)
  const page = useRef<HTMLDivElement>(null)
  const [showing, setShowing] = useState<Set<string>>(new Set())
  const focusAfter = useRef<string | null>(null)
  const grid = useRef<HTMLDivElement>(null)

  const layout = activeLayout(saved)
  const may = useCallback((id: string) => { const d = WIDGET_BY_ID.get(id); return !!d && allowed(d, catalog) }, [catalog])
  const placed = useMemo(() => layout.widgets.filter((w) => may(w.id)), [layout, may])
  const ids = useMemo(() => placed.map((w) => w.id), [placed])

  const say = useCallback((text: string) => { setSpoken((was) => (was === text ? text + ' ' : text)) }, [])

  // ---------------------------------------------------------- saving, a moment after the last change

  const latest = useRef(saved)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushSave = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!dirty.current) return
    dirty.current = false
    Promise.resolve().then(() => host.store.set(STORE_KEY, serialize(latest.current))).catch(() => say('Your layout couldn’t be saved just now.'))
  }, [host, say])
  useEffect(() => {
    window.addEventListener('pagehide', flushSave)
    return () => { window.removeEventListener('pagehide', flushSave); flushSave() }
  }, [flushSave])

  const commit = useCallback((next: Saved, message?: string, remember = true) => {
    if (next === latest.current) return
    if (!fitsStore(next)) { say('That won’t fit in the space kept for your layouts. Delete a layout first.'); return }
    const before = latest.current
    if (remember) setUndo((u) => [...u.slice(-9), before])
    latest.current = next
    dirty.current = true
    setSaved(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flushSave, SAVE_WAIT)
    if (message) say(message)
  }, [flushSave, say])

  const changeLayout = useCallback((fn: (l: Layout) => Layout, message?: string) => {
    const cur = latest.current
    const l = activeLayout(cur)
    const nl = fn(l)
    if (nl !== l) commit(replaceLayout(cur, nl), message)
  }, [commit])

  // ---------------------------------------------------------- what the server is asked for

  const sections = useMemo(() => liveSections(ids, catalog), [ids, catalog])
  useEffect(() => { store.setSections(sections) }, [store, sections])

  // Only what's near the screen is drawn or fetched. Live numbers come for the whole layout, as
  // one stream, because reopening it on every scroll would cost more than it saves.
  useEffect(() => {
    const el = grid.current
    if (!el || typeof IntersectionObserver === 'undefined') { setShowing(new Set(ids)); return }
    const on = new Set<string>()
    let t: ReturnType<typeof setTimeout> | null = null
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.wstCard
        if (!id) continue
        if (e.isIntersecting) on.add(id); else on.delete(id)
      }
      if (t) clearTimeout(t)
      t = setTimeout(() => setShowing(new Set(on)), 80)
    }, { rootMargin: '200px' })
    el.querySelectorAll('[data-wst-card]').forEach((c) => io.observe(c))
    return () => { io.disconnect(); if (t) clearTimeout(t) }
  }, [ids])

  useEffect(() => {
    const onScreen = detail ? [...showing, detail] : [...showing]
    let report = false
    const series = new Set<string>()
    for (const id of onScreen) {
      const d = WIDGET_BY_ID.get(id)
      if (!d || !allowed(d, catalog) || !availability(d, catalog).ok) continue
      if (d.report) report = true
      for (const s of seriesFor(d, id === detail)) series.add(s)
    }
    store.setNeeds(report, [...series].sort(), saved.range)
  }, [store, showing, detail, saved.range, catalog])

  useEffect(() => {
    const vis = () => store.setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', vis)
    vis()
    return () => document.removeEventListener('visibilitychange', vis)
  }, [store])

  useEffect(() => store.subscribe((s) => {
    if (s === 'stream') setStream(store.stream)
    if (s === 'now' && page.current) page.current.dataset.samples = String(store.samples)
  }), [store])

  // ---------------------------------------------------------- focus follows what was just changed

  useLayoutEffect(() => {
    const want = focusAfter.current
    if (!want) return
    focusAfter.current = null
    const el = document.querySelector<HTMLElement>(want)
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }) }
  })
  const focusOn = (act: string, id: string) => `[data-wst-act="${act}"][data-wst-for="${id}"]`

  // ---------------------------------------------------------- arranging

  const name = (id: string) => WIDGET_BY_ID.get(id)?.title ?? id
  const act = useCallback((a: string, id: string) => {
    const cur = activeLayout(latest.current)
    const w = cur.widgets.find((x) => x.id === id)
    if (!w) return
    const visible = cur.widgets.filter((x) => may(x.id))
    const at = visible.findIndex((x) => x.id === id)
    focusAfter.current = focusOn(a, id)
    switch (a) {
      case 'earlier':
      case 'later': {
        const dir = a === 'earlier' ? -1 : 1
        if (!canMove(cur, id, dir, may)) { say(`${name(id)} is already ${dir < 0 ? 'first' : 'last'}.`); return }
        changeLayout((l) => moveWidget(l, id, dir, may), `${name(id)} moved to place ${at + dir + 1} of ${visible.length}.`)
        return
      }
      case 'wider': case 'narrower': case 'taller': case 'shorter': {
        const next = resizeWidget(cur, id, a === 'wider' ? 1 : a === 'narrower' ? -1 : 0, a === 'taller' ? 1 : a === 'shorter' ? -1 : 0)
        if (next === cur) { say(`${name(id)} can’t get any ${a}.`); return }
        const n = next.widgets.find((x) => x.id === id)!
        changeLayout(() => next, `${name(id)} is now ${n.w} wide and ${n.h} tall.`)
        return
      }
      case 'remove': {
        const nextOne = visible[at + 1] ?? visible[at - 1]
        focusAfter.current = nextOne ? focusOn('remove', nextOne.id) : '[data-wst-act=add]'
        changeLayout((l) => removeWidget(l, id), `${name(id)} removed. Undo brings it back.`)
        return
      }
    }
  }, [may, changeLayout, say])

  // Dragging writes to the page directly and only saves at the end, so it can't cost a render.
  const onDragStart = useCallback((e: ReactPointer, id: string, how: 'move' | 'size') => {
    if (e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget as HTMLElement
    const pid = e.pointerId
    handle.setPointerCapture(pid)
    const card = handle.closest<HTMLElement>('[data-wst-card]')
    const box = grid.current
    if (!card || !box) return
    const cols = getComputedStyle(box).gridTemplateColumns.split(' ').length
    const gap = parseFloat(getComputedStyle(box).columnGap) || 0
    const unit = (box.clientWidth - gap * (cols - 1)) / cols + gap
    const start = card.getBoundingClientRect()
    let over: HTMLElement | null = null
    let size: { w: number; h: number } | null = null
    const w0 = latest.current && activeLayout(latest.current).widgets.find((x) => x.id === id)
    card.classList.add('dragging')
    const move = (ev: PointerEvent) => {
      // Near the top or bottom of the window, the page moves along to where it's going.
      if (ev.clientY < 60) window.scrollBy(0, -24)
      else if (ev.clientY > window.innerHeight - 60) window.scrollBy(0, 24)
      if (how === 'move') {
        const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-wst-card]') ?? null
        const next = hit && hit !== card ? hit : null
        if (next !== over) { over?.classList.remove('drop-here'); next?.classList.add('drop-here'); over = next }
      } else if (w0) {
        const w = Math.max(1, Math.min(cols, Math.round((ev.clientX - start.left) / unit)))
        const h = Math.max(1, Math.min(3, Math.round((ev.clientY - start.top) / (start.height / w0.h))))
        if (!size || size.w !== w || size.h !== h) {
          size = { w, h }
          card.className = card.className.replace(/wst-w\d/, `wst-w${w}`).replace(/wst-h\d/, `wst-h${h}`)
        }
      }
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      card.classList.remove('dragging')
      over?.classList.remove('drop-here')
      if (how === 'move' && over?.dataset.wstCard) {
        const onto = over.dataset.wstCard
        changeLayout((l) => moveWidgetTo(l, id, onto), `${name(id)} moved.`)
      } else if (how === 'size' && size) {
        const { w, h } = size
        changeLayout((l) => setWidgetSize(l, id, w, h), `${name(id)} is now ${w} wide and ${h} tall.`)
      }
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }, [changeLayout])

  const setView = useCallback((id: string, view: ViewKind) => {
    focusAfter.current = focusOn('view', id)
    changeLayout((l) => setWidgetView(l, id, view), `${name(id)} is showing as a ${view}.`)
  }, [changeLayout])

  const onDetail = useCallback((id: string) => setDetail(id), [])

  const setAllViews = (view: ViewKind) => {
    const cur = latest.current
    if (cur.view === view && !activeLayout(cur).widgets.some((w) => w.view)) return
    commit(replaceLayout({ ...cur, view }, { ...activeLayout(cur), widgets: activeLayout(cur).widgets.map(({ view: _drop, ...w }) => w) }), view === 'table' ? 'Every widget is showing as a table.' : 'Every widget is showing as a chart.', false)
  }

  const pickRange = (r: string) => {
    commit({ ...latest.current, range: r }, `Showing ${rangeName(r)}.`, false)
  }

  const applyPresetTo = (p: PresetId) => changeLayout((l) => applyPreset(l, p, !host.user.admin), `${PRESET_NAMES[p]} preset applied. Undo brings back what was here.`)

  const undoLast = () => {
    const last = undo[undo.length - 1]
    if (!last) { say('Nothing to undo.'); return }
    setUndo((u) => u.slice(0, -1))
    commit(last, 'Undone.', false)
  }

  const closeDialog = () => setDialog(null)

  const hasHistory = catalog.series.length > 0 && placed.some((p) => (WIDGET_BY_ID.get(p.id)?.series?.length ?? 0) > 0)
  const detailDef = detail ? WIDGET_BY_ID.get(detail) : null
  const on = useMemo(() => new Set(layout.widgets.map((w) => w.id)), [layout])

  return (
    <div ref={page} className="wst-page" data-stream={stream} data-sections={sections.join(',')}>
      <header className="wst-head">
        <div>
          <h1 className="wst-title">Statistics</h1>
          {STREAM_WORDS[stream] && <p className={'wst-live ' + stream} role="status"><i aria-hidden="true" />{STREAM_WORDS[stream]}</p>}
        </div>
        <div className="wst-head-actions" data-nav-group>
          {sections.length > 0 && <Btn small variant="ghost" icon={stream === 'paused' ? 'play' : 'pause'} label={stream === 'paused' ? 'Resume live numbers' : 'Pause live numbers'} act="pause" onClick={() => { store.setPaused(!store.isPaused) }}>{stream === 'paused' ? 'Resume' : 'Pause'}</Btn>}
          <Btn small variant={customising ? undefined : 'ghost'} icon="tune" label="Customise this screen" act="customise" pressed={customising} onClick={() => { focusAfter.current = customising ? '[data-wst-act=customise]' : '[data-wst-act=add]'; setCustomising((c) => !c) }}>Customise</Btn>
        </div>
      </header>

      <div className="wst-filters">
        {saved.layouts.length > 1 && (
          <div className="chips wst-chips" role="group" aria-label="Layouts" data-nav-group>
            <span className="wst-filter-label">Layout</span>
            {saved.layouts.map((l) => <button key={l.id} type="button" className={'chip' + (l.id === saved.active ? ' active' : '')} aria-pressed={l.id === saved.active} data-wst-act={'layout-' + l.id} onClick={() => { commit(switchLayout(latest.current, l.id), `${l.name} is on screen.`, false); focusAfter.current = `[data-wst-act="layout-${l.id}"]` }}>{l.name}</button>)}
          </div>
        )}
        {hasHistory && (
          <div className="chips wst-chips" role="group" aria-label="Time range" data-nav-group>
            <span className="wst-filter-label">Time</span>
            {ranges.map((r) => <button key={r} type="button" className={'chip' + (r === saved.range ? ' active' : '')} aria-pressed={r === saved.range} data-wst-act={'range-' + r} onClick={() => pickRange(r)}>{rangeName(r)}</button>)}
          </div>
        )}
        <div className="chips wst-chips" role="group" aria-label="Show every widget as" data-nav-group>
          <span className="wst-filter-label">Show</span>
          <button type="button" className={'chip' + (saved.view === 'chart' ? ' active' : '')} aria-pressed={saved.view === 'chart'} data-wst-act="all-charts" onClick={() => setAllViews('chart')}>Charts</button>
          <button type="button" className={'chip' + (saved.view === 'table' ? ' active' : '')} aria-pressed={saved.view === 'table'} data-wst-act="all-tables" onClick={() => setAllViews('table')}>Tables</button>
        </div>
      </div>

      {customising && (
        <CustomiseBar saved={saved} canUndo={undo.length > 0} onPreset={applyPresetTo} onAdd={() => setDialog('add')} onNew={() => setDialog('new')} onRename={() => setDialog('rename')} onDelete={() => { if (saved.layouts.length > 1) setDialog('delete') }} onReset={() => setDialog('reset')} onUndo={undoLast}
          onDone={() => { focusAfter.current = '[data-wst-act=customise]'; setCustomising(false); say('Finished customising.') }} />
      )}

      {placed.length === 0
        ? (
          <div className="wst-nothing">
            <p>There’s nothing on this layout.</p>
            <div className="wst-custom-row">
              <Btn variant="primary" icon="plus" label="Add widgets" act={customising ? 'add-empty' : 'add-empty-closed'} onClick={() => { setCustomising(true); setDialog('add') }}>Add widgets</Btn>
              <Btn icon="refresh" label="Standard preset" onClick={() => applyPresetTo('standard')}>Use the Standard preset</Btn>
            </div>
          </div>
        )
        : (
          <div ref={grid} className="wst-grid">
            {placed.map((p, i) => {
              const def = WIDGET_BY_ID.get(p.id)!
              return (
                <Card key={p.id} def={def} placed={p} store={store} range={saved.range} globalView={saved.view} customising={customising} showing={showing.has(p.id)} first={i === 0} last={i === placed.length - 1}
                  onSetView={setView} onDetail={onDetail} onAct={act} onDragStart={onDragStart} />
              )
            })}
          </div>
        )}

      <div className="wst-sr" aria-live="polite" role="status">{spoken}</div>

      {detailDef && <Detail def={detailDef} store={store} range={saved.range} ranges={ranges} onRange={pickRange} onClose={() => setDetail(null)} onAnnounce={say} />}
      {dialog === 'add' && <AddDialog catalog={catalog} on={on} onClose={closeDialog} onAdd={(id) => changeLayout((l) => addWidget(l, id), `${name(id)} added.`)} />}
      {dialog === 'new' && <NameDialog saved={saved} title="New layout" start={nextName(saved)} action="Create" onClose={closeDialog} onSave={(n) => { commit(createLayout(latest.current, n), `${n} created, as a copy of what was on screen.`); closeDialog() }} />}
      {dialog === 'rename' && <NameDialog saved={saved} title="Rename this layout" start={layout.name} except={layout.id} action="Rename" onClose={closeDialog} onSave={(n) => { commit(renameLayout(latest.current, layout.id, n), `Renamed to ${n}.`); closeDialog() }} />}
      {dialog === 'delete' && <ConfirmDialog title={`Delete ${layout.name}?`} body="This layout goes. Your other layouts stay, and no statistics are lost." confirm="Delete layout" onCancel={closeDialog} onConfirm={() => { commit(deleteLayout(latest.current, layout.id), `${layout.name} deleted.`); closeDialog() }} />}
      {dialog === 'reset' && (
        <ConfirmDialog title="Reset to stock?" body={saved.layouts.length > 1 ? `Your ${saved.layouts.length} layouts go, and the screen goes back to how it first came. No statistics are lost.` : 'Your layout goes, and the screen goes back to how it first came. No statistics are lost.'} confirm="Reset to stock" onCancel={closeDialog}
          onConfirm={() => { commit(stock(!host.user.admin), 'Back to stock. Undo brings back what was here.'); closeDialog() }} />
      )}
    </div>
  )
}

function nextName(s: Saved) {
  for (let i = s.layouts.length + 1; ; i++) {
    const n = `Layout ${i}`
    if (!s.layouts.some((l) => l.name === n)) return n
  }
}
