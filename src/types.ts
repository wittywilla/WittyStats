// What the module is given, and the answers it reads. The shapes are the server's: Go types in
// internal/server/api_metrics.go, internal/server/streams_live.go and internal/metrics.

// The one thing a page gets from the app. `token` and `base` are optional: without them the
// stream is opened on the page's own address with its cookies.
export type Host = {
  request: <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>
  user: { admin: boolean }
  store: {
    get: (key: string) => unknown | Promise<unknown>
    set: (key: string, value: unknown) => unknown | Promise<unknown>
  }
  token?: () => string
  base?: () => string
}

export type Access = { visible: boolean; full: boolean }
export type Section = { id: string; title: string; available: boolean; why?: string; full?: boolean }
export type Catalog = { access: Access; sections: Section[]; series: string[]; ranges: string[]; everySec: number }

export type CpuNow = { percent: number; cores: number[]; temps?: { name: string; celsius: number }[] }
export type MemoryNow = { total: number; used: number; available: number; swapTotal: number; swapUsed: number }
export type GpuNow = {
  name: string; percent?: number; encoderPercent?: number; decoderPercent?: number; memoryUsed?: number; memoryTotal?: number
  celsius?: number; encoderSessions?: number; encoderFps?: number
}
export type DiskNow = { name: string; readRate: number; writeRate: number; busyPercent?: number }
export type VolumeNow = { mount: string; device?: string; type?: string; kind: string; total: number; free: number }
export type NetNow = { name: string; up: boolean; speedMbps?: number; rxRate: number; txRate: number; rxBytes: number; txBytes: number; rxErrs: number; txErrs: number }
export type ProcessNow = {
  cpuPercent: number; rss: number; heapAlloc: number; heapSys: number; goroutines: number; threads?: number; handles?: number
  gcPauseMs: number; numGC: number; uptimeSec: number
}
export type ServerNow = { name?: string; version: string; os: string; arch: string; uptimeSec: number; updateAvailable?: string }
export type ModuleNow = { id: string; name: string; version: string; latest?: string; phase?: string; error?: string; installed: boolean }
export type StreamNow = {
  id: string; userId: number; user: string; device?: string; where?: string; itemId?: number; title?: string; decision: string; reasons: string[]
  width?: number; height?: number; fileKbps?: number; sendingKbps: number; bytes: number; startedAt: number
}
export type GameNow = {
  id: string; userId: number; user: string; title: string; core?: string; encoder?: string; gameFps: number; sentFps: number; encodeMs: number
  kbps: number; droppedFrames: number; width?: number; height?: number; paused?: boolean; startedAt: number
}
export type MetricsNow = {
  time: number; server?: ServerNow; cpu?: CpuNow; memory?: MemoryNow; gpu?: GpuNow[]; disks?: DiskNow[]; volumes?: VolumeNow[]; net?: NetNow[]
  process?: ProcessNow; modules?: ModuleNow[]; streams?: StreamNow[]; games?: GameNow[]; transcodes?: { active: number; max: number }
  tasks?: { active: number; queued: number; paused: number; percent: number }
}

export type History = {
  from: number; to: number; stepSec: number; times: number[]; series: Record<string, number[]>; peak?: Record<string, number[]>
}

export type ReportCount = { name: string; items: number; bytes: number }
export type Report = {
  generatedAt: number
  libraries: { id: number; name: string; type: string; items: number; bytes: number; missing: number; lastScanAt?: number }[]
  byType: ReportCount[]
  codecs: ReportCount[]
  resolutions: ReportCount[]
  duplicates?: { groups: number; wastedBytes: number; top: { title: string; year?: number; copies: number; bytes: number; wasted: number }[] }
  savings?: { items: number; bytes: number; estimatedSaved: number }
  scans?: { library: string; state: string; files: number; tookSec: number; finishedAt: number }[]
  database?: { bytes: number; walBytes: number }
  caches?: { name: string; bytes: number; files: number; partial?: boolean }[]
  logs?: { hour: number; warnings: number; errors: number }[]
  mostWatched: { itemId: number; title: string; seconds: number; people: number }[]
  bandwidth?: { userId: number; user: string; bytes: number }[]
  peak?: { streams: number; at?: number }
}
