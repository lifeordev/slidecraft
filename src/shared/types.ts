// Types shared between the main process, preload, and renderer.

export interface ClaudeStatus {
  installed: boolean
  /** Absolute path to the resolved `claude` binary, if found. */
  path: string | null
  /** Version string reported by `claude --version`, if installed. */
  version: string | null
  /** Whether we found stored subscription/OAuth credentials. */
  authed: boolean
}

export interface Project {
  id: string
  name: string
  /** Absolute path to the project folder. */
  path: string
  createdAt: string
  /** Last Claude Code session id used for this project (for --resume). */
  sessionId: string | null
  /** Design guide this project was created from, if any (snapshot copied in). */
  guideId: string | null
  guideName: string | null
}

export interface DesignGuide {
  id: string
  name: string
  /** Absolute path to the guide folder. */
  path: string
  createdAt: string
  /** Number of files (markdown/images/etc.) in the guide. */
  fileCount: number
}

export interface AssetFile {
  name: string
  path: string
  size: number
}

/** A normalized chat event forwarded from the streaming `claude` process. */
export type SessionEvent =
  | { kind: 'started'; projectId: string; sessionId: string; model: string }
  | { kind: 'text'; projectId: string; text: string }
  | { kind: 'tool'; projectId: string; name: string; summary: string }
  | { kind: 'tool-result'; projectId: string; summary: string; isError: boolean }
  | { kind: 'turn-complete'; projectId: string; costUsd: number; durationMs: number }
  | { kind: 'error'; projectId: string; message: string }
  | { kind: 'exit'; projectId: string; code: number | null }

export interface TerminalData {
  id: string
  data: string
}

export interface TerminalExit {
  id: string
  exitCode: number
}

export type UpdateState =
  | 'idle'
  | 'dev'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  state: UpdateState
  /** Currently running app version. */
  version: string
  /** Newer version available, when applicable. */
  newVersion?: string
  /** Download progress 0–100 while state is 'downloading'. */
  percent?: number
  /** Human-readable detail for the 'error' state. */
  message?: string
  /** True when the new version must be installed manually (e.g. unsigned macOS). */
  manual?: boolean
}

export type PreviewResult = { ok: true; url: string } | { ok: false; error: string }

/** The API surface exposed to the renderer via the preload contextBridge. */
export interface Api {
  setup: {
    detect: () => Promise<ClaudeStatus>
    installCommand: () => Promise<string>
  }
  projects: {
    list: () => Promise<Project[]>
    create: (name: string, guideId?: string | null) => Promise<Project>
    delete: (id: string) => Promise<boolean>
    reveal: (id: string) => Promise<void>
    listAssets: (id: string) => Promise<AssetFile[]>
    addAssets: (id: string, paths: string[]) => Promise<AssetFile[]>
  }
  session: {
    start: (projectId: string) => Promise<{ sessionId: string }>
    send: (projectId: string, text: string) => Promise<void>
    stop: (projectId: string) => Promise<void>
    isRunning: (projectId: string) => Promise<boolean>
    onEvent: (cb: (event: SessionEvent) => void) => () => void
  }
  terminal: {
    create: (opts: { projectId?: string; cwd?: string; bootCommand?: string }) => Promise<{ id: string }>
    write: (id: string, data: string) => void
    resize: (id: string, cols: number, rows: number) => void
    kill: (id: string) => void
    onData: (cb: (data: TerminalData) => void) => () => void
    onExit: (cb: (exit: TerminalExit) => void) => () => void
  }
  guides: {
    list: () => Promise<DesignGuide[]>
    create: (name: string) => Promise<DesignGuide>
    delete: (id: string) => Promise<boolean>
    addFiles: (id: string, paths: string[]) => Promise<DesignGuide>
    reveal: (id: string) => Promise<void>
  }
  preview: {
    /** Start (or reuse) a local preview of the project's deck. */
    open: (projectId: string, present?: boolean) => Promise<PreviewResult>
  }
  updater: {
    status: () => Promise<UpdateStatus>
    check: () => Promise<UpdateStatus>
    /** Install a downloaded update (Windows) or open the releases page (macOS). */
    install: () => Promise<void>
    openReleases: () => Promise<void>
    onStatus: (cb: (status: UpdateStatus) => void) => () => void
  }
  /** Resolve the absolute filesystem path for a dropped File (Electron webUtils). */
  pathForFile: (file: File) => string
}
