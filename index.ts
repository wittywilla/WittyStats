// SPDX-License-Identifier: AGPL-3.0-or-later
//
// WittyStats - A statistics screen you arrange yourself: the machine, streams, libraries and history, as charts or tables, with exports.
// Copyright (C) 2026 WittyWilla and contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

// WittyStats: the statistics screen for WittyMediaServer. A page gets one prop, `host`, and needs
// nothing else from the app. See the README.
import { StatsPage } from './src/StatsPage.tsx'

export const pages = { stats: StatsPage }
export type { Host } from './src/types.ts'
