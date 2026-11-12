// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 WittyWilla and contributors
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_STATS_SETTINGS, openWith, readSettings } from '../src/settings.ts'

const saved = { active: 'a', layouts: [], range: '1h', view: 'chart' }
const ranges = ['15m', '1h', '24h', '7d']

test('settings are read from the module settings answer, oddities left at their defaults', () => {
  assert.deepEqual(readSettings({ values: { openOn: '24h', view: 'table', live: false } }), { openOn: '24h', view: 'table', live: false })
  assert.deepEqual(readSettings({ values: { openOn: 3, view: 'pie' } }), DEFAULT_STATS_SETTINGS)
  assert.deepEqual(readSettings(null), DEFAULT_STATS_SETTINGS)
})

test('the dashboard opens as left, unless the settings choose a range or a view', () => {
  assert.equal(openWith(saved, DEFAULT_STATS_SETTINGS, ranges), saved)
  assert.deepEqual(openWith(saved, { openOn: '7d', view: 'table', live: true }, ranges), { ...saved, range: '7d', view: 'table' })
  assert.equal(openWith(saved, { openOn: '90d', view: 'last', live: true }, ranges), saved, 'a range this server does not offer is ignored')
})
