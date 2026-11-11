// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 WittyWilla and contributors
import { useRef, useState } from 'react'
import { MAX_LAYOUTS, MAX_NAME, activeLayout, cleanName, nameTaken, type Saved } from './layout.ts'
import { Btn, Dialog, Icon } from './parts.tsx'
import { PRESET_NAMES, WIDGETS, allowed, type PresetId, type WidgetDef } from './widgets.ts'
import type { Catalog } from './types.ts'

const PRESET_IDS: PresetId[] = ['simple', 'standard', 'advanced']

// The bar of what can be changed about the whole screen. Each widget's own buttons are on it.
export function CustomiseBar({ saved, canUndo, onPreset, onAdd, onNew, onRename, onDelete, onReset, onUndo, onDone }: {
  saved: Saved; canUndo: boolean; onPreset: (p: PresetId) => void; onAdd: () => void; onNew: () => void; onRename: () => void; onDelete: () => void; onReset: () => void; onUndo: () => void; onDone: () => void
}) {
  return (
    <div className="wst-custom" role="group" aria-label="Customise this screen">
      <p className="wst-custom-hint">Each widget has buttons to move, resize or remove it. With a mouse or finger you can also drag its handle.</p>
      <div className="wst-custom-row" data-nav-group>
        <Btn icon="plus" label="Add widgets" act="add" onClick={onAdd}>Add widgets</Btn>
        <Btn icon="undo" label="Undo" act="undo" off={!canUndo} onClick={onUndo}>Undo</Btn>
        <Btn variant="primary" icon="check" label="Finish customising" act="done-custom" onClick={onDone}>Done</Btn>
      </div>
      <div className="wst-custom-row" role="group" aria-label="Start from a preset" data-nav-group>
        <span className="wst-custom-label">Start from</span>
        {PRESET_IDS.map((p) => <Btn key={p} small label={`${PRESET_NAMES[p]} preset`} act={'preset-' + p} onClick={() => onPreset(p)}>{PRESET_NAMES[p]}</Btn>)}
      </div>
      <div className="wst-custom-row" role="group" aria-label="This layout" data-nav-group>
        <span className="wst-custom-label">This layout</span>
        <Btn small icon="plus" label="New layout" act="new-layout" off={saved.layouts.length >= MAX_LAYOUTS} onClick={onNew}>New</Btn>
        <Btn small icon="edit" label={`Rename ${activeLayout(saved).name}`} act="rename-layout" onClick={onRename}>Rename</Btn>
        <Btn small icon="trash" label={`Delete ${activeLayout(saved).name}`} act="delete-layout" off={saved.layouts.length <= 1} onClick={onDelete}>Delete</Btn>
        <Btn small variant="danger" icon="refresh" label="Reset to stock" act="reset" onClick={onReset}>Reset to stock</Btn>
      </div>
    </div>
  )
}

export function AddDialog({ onClose, onAdd, catalog, on }: { onClose: () => void; onAdd: (id: string) => void; catalog: Catalog; on: Set<string> }) {
  const list = useRef<HTMLDivElement>(null)
  const left = WIDGETS.filter((d) => allowed(d, catalog) && !on.has(d.id))
  const groups = new Map<string, WidgetDef[]>()
  for (const d of left) groups.set(d.group, [...(groups.get(d.group) ?? []), d])
  const add = (id: string) => {
    // Focus stays in the list: on the next one along, as this one is about to go.
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-wst-add]') ?? [])]
    const at = buttons.findIndex((b) => b.dataset.wstAdd === id)
    const next = buttons[at + 1] ?? buttons[at - 1]
    onAdd(id)
    if (next) next.focus()
    else list.current?.closest<HTMLElement>('.modal')?.querySelector<HTMLElement>('[data-wst-act=done]')?.focus()
  }
  return (
    <Dialog wide title="Add widgets" onClose={onClose} actions={<Btn variant="primary" label="Done" act="done" onClick={onClose}>Done</Btn>}>
      <div ref={list} className="wst-add">
        {left.length === 0 && <p className="wst-state"><Icon name="check" size={16} /> Everything you can have is already on this layout.</p>}
        {[...groups].map(([name, defs]) => (
          <section key={name}>
            <h3>{name}</h3>
            <ul>
              {defs.map((d) => (
                <li key={d.id}>
                  <button type="button" className="wst-add-item" data-wst-add={d.id} onClick={() => add(d.id)}>
                    <Icon name="plus" />
                    <span><strong>{d.title}</strong><small>{d.about}</small></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  )
}

// Asks for a layout's name.
export function NameDialog({ saved, title, start, except, action, onClose, onSave }: { saved: Saved; title: string; start: string; except?: string; action: string; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(start)
  const clean = cleanName(name)
  const problem = !clean ? 'Give it a name.' : nameTaken(saved, clean, except) ? 'You already have a layout with that name.' : ''
  const [tried, setTried] = useState(false)
  const submit = () => { setTried(true); if (!problem) onSave(clean) }
  return (
    <Dialog title={title} onClose={onClose} initial="input"
      actions={<>
        <Btn variant="ghost" label="Cancel" act="cancel" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" label={action} act="save" onClick={submit}>{action}</Btn>
      </>}>
      <label className="wst-field">
        <span>Name</span>
        <input className="input" value={name} maxLength={MAX_NAME} aria-invalid={tried && !!problem} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }} />
      </label>
      {tried && problem && <p className="wst-field-error" role="alert">{problem}</p>}
    </Dialog>
  )
}

// A plain yes or no. The safe answer comes first and has the focus.
export function ConfirmDialog({ title, body, confirm, onCancel, onConfirm }: { title: string; body: string; confirm: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog alert title={title} description={body} onClose={onCancel} initial="[data-wst-act=cancel]"
      actions={<>
        <Btn variant="ghost" label="Cancel" act="cancel" onClick={onCancel}>Cancel</Btn>
        <Btn variant="danger" label={confirm} act="confirm" onClick={onConfirm}>{confirm}</Btn>
      </>} />
  )
}
