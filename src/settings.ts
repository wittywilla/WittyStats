// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 WittyWilla and contributors
// WittyStats' settings (sdui.json, "settings"): each profile's own, drawn by every app's Settings
// under Modules and read here through the server's module settings route.
import type { Saved, ViewKind } from './layout.ts'

export type StatsSettings = { openOn: string; view: 'last' | ViewKind; live: boolean }
export const DEFAULT_STATS_SETTINGS: StatsSettings = { openOn: 'last', view: 'last', live: true }
export const SETTINGS_PATH = '/sdui/modules/wittystats/settings'

/** The settings in an answer from the module settings route, with anything odd left at its default. */
export function readSettings(answer: unknown): StatsSettings {
  const v = (answer && typeof answer === 'object' ? (answer as { values?: unknown }).values : null) as Record<string, unknown> | null
  if (!v || typeof v !== 'object') return DEFAULT_STATS_SETTINGS
  return {
    openOn: typeof v.openOn === 'string' ? v.openOn : 'last',
    view: v.view === 'chart' || v.view === 'table' ? v.view : 'last',
    live: v.live !== false,
  }
}

/** Where the dashboard opens: the person's last choices, unless their settings say otherwise. */
export function openWith(saved: Saved, s: StatsSettings, ranges: string[]): Saved {
  let out = saved
  if (s.openOn !== 'last' && ranges.includes(s.openOn) && s.openOn !== out.range) out = { ...out, range: s.openOn }
  if (s.view !== 'last' && s.view !== out.view) out = { ...out, view: s.view }
  return out
}
