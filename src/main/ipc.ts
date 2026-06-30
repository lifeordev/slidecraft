import { ipcMain, shell, BrowserWindow } from 'electron'
import type { SessionEvent } from '../shared/types'
import { detectClaude, installCommand } from './claude'
import {
  listProjects,
  createProject,
  getProject,
  listAssets,
  addAssets
} from './projects'
import { sessionManager } from './session'
import { terminalManager } from './terminal'

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
  ipcMain.handle('projects:create', (_e, name: string) =>
    createProject(name, new Date().toISOString())
  )
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
}

export function disposeBackends(): void {
  sessionManager.stopAll()
  terminalManager.killAll()
}
