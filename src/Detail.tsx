import { useEffect } from 'react'
import { fileName, tablesToCsv, tablesToJson } from './exports.ts'
import { Btn, Dialog, saveFile } from './parts.tsx'
import type { StatsStore } from './store.ts'
import { rangeName, rangeWords, seriesFor } from './views.ts'
import { Body, useWidgetView } from './Widget.tsx'
import type { WidgetDef } from './widgets.ts'

// The advanced view of one widget: more series, every row, and files of what's shown. Its table
// updates at most every five seconds, as a long one is a lot to redraw and hard to read while
// it moves.
export function Detail({ def, store, range, ranges, onRange, onClose, onAnnounce }: { def: WidgetDef; store: StatsStore; range: string; ranges: string[]; onRange: (r: string) => void; onClose: () => void; onAnnounce: (s: string) => void }) {
  const prep = useWidgetView(store, def, range, true, true, 5000)
  const usesHistory = seriesFor(def, true).length > 0 && (store.catalog?.series.length ?? 0) > 0
  useEffect(() => { store.ensure() }, [store, range])
  const view = prep.kind === 'view' ? prep.view : null
  const tables = view?.tables ?? []
  const save = (kind: 'csv' | 'json') => {
    if (!tables.length) { onAnnounce('There’s nothing to export yet.'); return }
    const at = new Date()
    const name = fileName(def.id, kind, at)
    if (kind === 'csv') saveFile(name, 'text/csv;charset=utf-8', tablesToCsv(tables))
    else saveFile(name, 'application/json', tablesToJson(def.title, tables, at, usesHistory ? rangeWords(range) : undefined))
    onAnnounce(`${name} saved.`)
  }
  return (
    <Dialog wide title={def.title} onClose={onClose}
      actions={<>
        <Btn icon="download" label={`Save ${def.title} as CSV`} act="csv" off={!tables.length} onClick={() => save('csv')}>Save as CSV</Btn>
        <Btn icon="download" label={`Save ${def.title} as JSON`} act="json" off={!tables.length} onClick={() => save('json')}>Save as JSON</Btn>
        <Btn variant="primary" label="Done" act="done" onClick={onClose}>Done</Btn>
      </>}>
      <p className="wst-dialog-desc">{def.about}{def.estimate ? '. These figures are estimates' : ''}.</p>
      {usesHistory && (
        <div className="chips wst-chips" role="group" aria-label="Time range" data-nav-group>
          {ranges.map((r) => <button key={r} type="button" className={'chip' + (r === range ? ' active' : '')} aria-pressed={r === range} onClick={() => onRange(r)}>{rangeName(r)}</button>)}
        </div>
      )}
      <div className="wst-detail">
        {prep.kind === 'unavailable' && <p className="wst-state">Not available here. {prep.why}</p>}
        {view && <div className="wst-detail-charts"><Body view={{ ...view, tables: [] }} as="chart" large name={def.title} onRetry={() => store.retryReport()} /></div>}
        {view?.state !== 'loading' && tables.length > 0 && <Body view={{ ...view!, state: 'ok', notes: undefined, message: undefined }} as="table" large />}
      </div>
    </Dialog>
  )
}
