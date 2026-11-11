// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 WittyWilla and contributors
import { useEffect, useId, useRef, type KeyboardEvent as ReactKey, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// The module's own small parts: it can't import the app's, so it builds on the classes and
// tokens that are the app's public contract (.btn, .chip, .modal and so on).

const paths: Record<string, string> = {
  chart: 'M4 20V10h3v10H4Zm6.5 0V4h3v16h-3Zm6.5 0v-7h3v7h-3Z',
  table: 'M3 4h18v16H3V4Zm2 2v3h14V6H5Zm0 5v3h6v-3H5Zm8 0v3h6v-3h-6Zm-8 5v2h6v-2H5Zm8 0v2h6v-2h-6Z',
  expand: 'M4 4h7v2H7.4l4.3 4.3-1.4 1.4L6 7.4V11H4V4Zm9 0h7v7h-2V7.4l-4.3 4.3-1.4-1.4L16.6 6H13V4ZM6 16.6l4.3-4.3 1.4 1.4L7.4 18H11v2H4v-7h2v3.6Zm11.3-4.3L18 13h2v7h-7v-2h3.6l-4.3-4.3 1.4-1.4Z',
  left: 'M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12l6.6-6.6Z',
  right: 'M8.6 18.6 10 20l8-8-8-8-1.4 1.4 6.6 6.6-6.6 6.6Z',
  wider: 'M2 12l4-4v3h12V8l4 4-4 4v-3H6v3l-4-4Z',
  narrower: 'M11 12 7 8v3H2v2h5v3l4-4Zm2 0 4 4v-3h5v-2h-5V8l-4 4Z',
  taller: 'M12 2l4 4h-3v12h3l-4 4-4-4h3V6H8l4-4Z',
  shorter: 'M12 11l4-4h-3V2h-2v5H8l4 4Zm0 2-4 4h3v5h2v-5h3l-4-4Z',
  close: 'M18.3 5.7 16.9 4.3 12 9.2 7.1 4.3 5.7 5.7 10.6 10.6 5.7 15.5l1.4 1.4 4.9-4.9 4.9 4.9 1.4-1.4-4.9-4.9 4.9-4.9Z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5h2v2h-2V7Zm0 4h2v6h-2v-6Z',
  warn: 'M12 2 1 21h22L12 2Zm-1 7h2v6h-2V9Zm0 7h2v2h-2v-2Z',
  danger: 'M7.9 2 2 7.9v8.2L7.9 22h8.2L22 16.1V7.9L16.1 2H7.9ZM11 7h2v6h-2V7Zm0 8h2v2h-2v-2Z',
  check: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20 8.5l-1.4-1.4L9.5 16.2Z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z',
  grip: 'M9 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM9 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
  pause: 'M6 4h4v16H6V4Zm8 0h4v16h-4V4Z',
  play: 'M7 4v16l13-8L7 4Z',
  tune: 'M3 6h10V4h2v6h-2V8H3V6Zm14 0h4v2h-4V6ZM3 16h4v-2h2v6H7v-2H3v-2Zm8 0h10v2H11v-2Z',
  undo: 'M12.5 8c-2.6 0-5 1-6.9 2.6L2 7v9h9l-3.6-3.6A8 8 0 0 1 20.2 16l2.4-.8A10.5 10.5 0 0 0 12.5 8Z',
  download: 'M11 3h2v10l3.3-3.3 1.4 1.4L12 16.8l-5.7-5.7 1.4-1.4L11 13V3ZM4 19h16v2H4v-2Z',
  edit: 'M4 17.3V20h2.7l9.9-9.9-2.7-2.7L4 17.3ZM18.7 8a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0l-1.1 1.1 2.7 2.7L18.7 8Z',
  trash: 'M9 3h6l1 1h4v2H4V4h4l1-1Zm-3 5h12l-1 13H7L6 8Z',
  refresh: 'M12 4a8 8 0 1 0 7.7 10h-2.1A6 6 0 1 1 12 6c1.6 0 3.1.7 4.2 1.8L13 11h7V4l-2.4 2.4A8 8 0 0 0 12 4Z',
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="wst-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>
}

type BtnProps = {
  icon?: IconName
  label: string // what a screen reader hears, and the tooltip of a button showing only its icon
  children?: ReactNode
  onClick: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  small?: boolean
  off?: boolean // can't be used now, but keeps its place in the order and its focus
  onOff?: () => void // what pressing it says then
  pressed?: boolean
  act?: string
  who?: string
  autoFocus?: boolean
}

export function Btn({ icon, label, children, onClick, variant, small, off, onOff, pressed, act, who, autoFocus }: BtnProps) {
  const cls = ['btn', variant, small && 'sm', !children && 'square', 'wst-btn'].filter(Boolean).join(' ')
  return (
    <button type="button" className={cls} aria-label={children ? undefined : label} title={children ? undefined : label} aria-disabled={off || undefined} aria-pressed={pressed}
      data-wst-act={act} data-wst-for={who} autoFocus={autoFocus} onClick={off ? onOff : onClick}>
      {icon && <Icon name={icon} />}{children}
    </button>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// A dialog: focus moves in, Tab stays in, Escape or Back cancels, and focus goes back to what
// opened it. It sits on <body> so that nothing around it can clip it.
export function Dialog({ title, onClose, children, actions, wide, alert, description, initial }: { title: string; onClose: () => void; children?: ReactNode; actions?: ReactNode; wide?: boolean; alert?: boolean; description?: ReactNode; initial?: string }) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const back = useRef<HTMLElement | null>(null)
  const pressedInside = useRef(false)
  useEffect(() => {
    back.current = document.activeElement as HTMLElement | null
    const el = box.current
    const first = (initial && el?.querySelector<HTMLElement>(initial)) || el?.querySelector<HTMLElement>('[autofocus]') || el?.querySelector<HTMLElement>(FOCUSABLE) || el
    first?.focus({ preventScroll: true })
    return () => { if (back.current?.isConnected) back.current.focus({ preventScroll: true }) }
    // Only on opening and closing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const keys = (e: ReactKey) => {
    if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !box.current) return
    const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null)
    if (!items.length) { e.preventDefault(); return }
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }
  return createPortal(
    <div className="modal-backdrop"
      onMouseDown={(e) => { pressedInside.current = e.target !== e.currentTarget }}
      onClick={(e) => { const inside = pressedInside.current; pressedInside.current = false; if (e.target === e.currentTarget && !inside) onClose() }}>
      <div ref={box} className={'modal wst-dialog' + (wide ? ' wst-dialog-wide' : '')} role={alert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby={id + 't'} aria-describedby={description ? id + 'd' : undefined} tabIndex={-1} onKeyDown={keys}>
        <header className="wst-dialog-head">
          <h2 id={id + 't'}>{title}</h2>
          <Btn icon="close" label="Close" variant="ghost" onClick={onClose} act="close-dialog" />
        </header>
        {description && <p className="wst-dialog-desc" id={id + 'd'}>{description}</p>}
        {children}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}

// Saves a file made here in the browser. Nothing is asked of the server.
export function saveFile(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// A TV or a controller moves focus with the arrows, so a chart can't keep them.
export function usingRemote() {
  return document.documentElement.classList.contains('using-controller') || window.matchMedia('(pointer: none)').matches
}
