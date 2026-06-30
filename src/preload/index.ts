import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Api,
  ClaudeStatus,
  Project,
  AssetFile,
  SessionEvent,
  TerminalData,
  TerminalExit,
  UpdateStatus,
  PreviewResult,
  HostingStatus,
  TokenResult,
  PublishResult,
  DesignGuide
} from '../shared/types'

const api: Api = {
  setup: {
    detect: () => ipcRenderer.invoke('setup:detect') as Promise<ClaudeStatus>,
    installCommand: () => ipcRenderer.invoke('setup:installCommand') as Promise<string>
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list') as Promise<Project[]>,
    create: (name, guideId) =>
      ipcRenderer.invoke('projects:create', name, guideId ?? null) as Promise<Project>,
    delete: (id) => ipcRenderer.invoke('projects:delete', id) as Promise<boolean>,
    reveal: (id) => ipcRenderer.invoke('projects:reveal', id) as Promise<void>,
    listAssets: (id) => ipcRenderer.invoke('projects:listAssets', id) as Promise<AssetFile[]>,
    addAssets: (id, paths) =>
      ipcRenderer.invoke('projects:addAssets', id, paths) as Promise<AssetFile[]>
  },
  session: {
    start: (projectId) =>
      ipcRenderer.invoke('session:start', projectId) as Promise<{ sessionId: string }>,
    send: (projectId, text) => ipcRenderer.invoke('session:send', projectId, text) as Promise<void>,
    stop: (projectId) => ipcRenderer.invoke('session:stop', projectId) as Promise<void>,
    isRunning: (projectId) =>
      ipcRenderer.invoke('session:isRunning', projectId) as Promise<boolean>,
    onEvent: (cb) => {
      const listener = (_e: unknown, event: SessionEvent): void => cb(event)
      ipcRenderer.on('session:event', listener)
      return () => ipcRenderer.removeListener('session:event', listener)
    }
  },
  terminal: {
    create: (opts) => ipcRenderer.invoke('terminal:create', opts) as Promise<{ id: string }>,
    write: (id, data) => ipcRenderer.send('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('terminal:kill', id),
    onData: (cb) => {
      const listener = (_e: unknown, payload: TerminalData): void => cb(payload)
      ipcRenderer.on('terminal:data', listener)
      return () => ipcRenderer.removeListener('terminal:data', listener)
    },
    onExit: (cb) => {
      const listener = (_e: unknown, payload: TerminalExit): void => cb(payload)
      ipcRenderer.on('terminal:exit', listener)
      return () => ipcRenderer.removeListener('terminal:exit', listener)
    }
  },
  guides: {
    list: () => ipcRenderer.invoke('guides:list') as Promise<DesignGuide[]>,
    create: (name) => ipcRenderer.invoke('guides:create', name) as Promise<DesignGuide>,
    delete: (id) => ipcRenderer.invoke('guides:delete', id) as Promise<boolean>,
    addFiles: (id, paths) =>
      ipcRenderer.invoke('guides:addFiles', id, paths) as Promise<DesignGuide>,
    reveal: (id) => ipcRenderer.invoke('guides:reveal', id) as Promise<void>
  },
  preview: {
    open: (projectId) => ipcRenderer.invoke('preview:open', projectId) as Promise<PreviewResult>
  },
  hosting: {
    status: () => ipcRenderer.invoke('hosting:status') as Promise<HostingStatus>,
    saveToken: (token) => ipcRenderer.invoke('hosting:saveToken', token) as Promise<TokenResult>,
    clearToken: () => ipcRenderer.invoke('hosting:clearToken') as Promise<void>,
    publish: (projectId, opts) =>
      ipcRenderer.invoke('hosting:publish', projectId, opts) as Promise<PublishResult>
  },
  updater: {
    status: () => ipcRenderer.invoke('updater:status') as Promise<UpdateStatus>,
    check: () => ipcRenderer.invoke('updater:check') as Promise<UpdateStatus>,
    install: () => ipcRenderer.invoke('updater:install') as Promise<void>,
    openReleases: () => ipcRenderer.invoke('updater:openReleases') as Promise<void>,
    onStatus: (cb) => {
      const listener = (_e: unknown, status: UpdateStatus): void => cb(status)
      ipcRenderer.on('updater:status', listener)
      return () => ipcRenderer.removeListener('updater:status', listener)
    }
  },
  pathForFile: (file: File) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('api', api)
