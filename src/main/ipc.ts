import { ipcMain, shell, BrowserWindow } from 'electron'
import type { SessionEvent } from '../shared/types'
import { detectClaude, installCommand } from './claude'
import {
  listProjects,
  createProject,
  deleteProject,
  getProject,
  listAssets,
  addAssets
} from './projects'
import { sessionManager } from './session'
import { terminalManager } from './terminal'
import { initUpdater, checkForUpdates, installUpdate, openReleases, getStatus } from './updater'
import {
  listGuides,
  createGuide,
  deleteGuide,
  addGuideFiles,
  getGuide,
  copyGuideInto
} from './guides'
import { openPreview, disposePreview, closePreview } from './preview'

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerIpc(): void {
  // --- setup ---
  ipcMain.handle('setup:detect', () => detectClaude())
  ipcMain.handle('setup:installCommand', () => installCommand())

  // --- projects ---
  ipcMain.handle('projects:list', () => listProjects())
  ipcMain.handle('projects:create', (_e, name: string, guideId?: string | null) => {
    const guide = guideId ? getGuide(guideId) : null
    const project = createProject(
      name,
      new Date().toISOString(),
      guide ? { id: guide.id, name: guide.name } : null
    )
    if (guide) copyGuideInto(project.path, guide.id)
    return project
  })
  ipcMain.handle('projects:delete', async (_e, id: string) => {
    // Release anything holding the folder open before removing it.
    await sessionManager.stop(id)
    closePreview(id)
    return deleteProject(id)
  })
  ipcMain.handle('projects:reveal', (_e, id: string) => {
    const project = getProject(id)
    if (project) shell.openPath(project.path)
  })
  ipcMain.handle('projects:listAssets', (_e, id: string) => listAssets(id))
  ipcMain.handle('projects:addAssets', (_e, id: string, paths: string[]) =>
    addAssets(id, paths)
  )

  // --- session ---
  ipcMain.handle('session:start', (_e, projectId: string) => sessionManager.start(projectId))
  ipcMain.handle('session:send', (_e, projectId: string, text: string) =>
    sessionManager.send(projectId, text)
  )
  ipcMain.handle('session:stop', (_e, projectId: string) => sessionManager.stop(projectId))
  ipcMain.handle('session:isRunning', (_e, projectId: string) =>
    sessionManager.isRunning(projectId)
  )
  sessionManager.on('event', (event: SessionEvent) => broadcast('session:event', event))

  // --- terminal ---
  ipcMain.handle('terminal:create', (_e, opts: { projectId?: string; cwd?: string; bootCommand?: string }) => {
    let cwd = opts.cwd
    if (!cwd && opts.projectId) cwd = getProject(opts.projectId)?.path
    return terminalManager.create({ cwd, bootCommand: opts.bootCommand })
  })
  ipcMain.on('terminal:write', (_e, id: string, data: string) => terminalManager.write(id, data))
  ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) =>
    terminalManager.resize(id, cols, rows)
  )
  ipcMain.on('terminal:kill', (_e, id: string) => terminalManager.kill(id))
  terminalManager.on('data', (payload) => broadcast('terminal:data', payload))
  terminalManager.on('exit', (payload) => broadcast('terminal:exit', payload))

  // --- design guides ---
  ipcMain.handle('guides:list', () => listGuides())
  ipcMain.handle('guides:create', (_e, name: string) =>
    createGuide(name, new Date().toISOString())
  )
  ipcMain.handle('guides:delete', (_e, id: string) => deleteGuide(id))
  ipcMain.handle('guides:addFiles', (_e, id: string, paths: string[]) => addGuideFiles(id, paths))
  ipcMain.handle('guides:reveal', (_e, id: string) => {
    const guide = getGuide(id)
    if (guide) shell.openPath(guide.path)
  })

  // --- preview ---
  ipcMain.handle('preview:open', (_e, projectId: string, present?: boolean) =>
    openPreview(projectId, present)
  )

  // --- updater ---
  initUpdater()
  ipcMain.handle('updater:status', () => getStatus())
  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:install', () => installUpdate())
  ipcMain.handle('updater:openReleases', () => openReleases())
}

export function disposeBackends(): void {
  sessionManager.stopAll()
  terminalManager.killAll()
  disposePreview()
}
