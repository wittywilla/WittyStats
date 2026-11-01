// WittyStats: the statistics screen for WittyMediaServer. A page gets one prop, `host`, and needs
// nothing else from the app. See the README.
import { StatsPage } from './src/StatsPage.tsx'

export const pages = { stats: StatsPage }
export type { Host } from './src/types.ts'
