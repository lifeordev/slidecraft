import { app, BrowserWindow, shell } from 'electron'
import pkg from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const { autoUpdater } = pkg

const RELEASES_URL = 'https://github.com/lifeordev/slidecraft/releases'

// Unsigned macOS apps cannot self-install updates (Squirrel.Mac requires a
// Developer ID signature). On macOS we therefore detect the new version and
// send the user to the releases page instead of auto-downloading. Once you
// sign + notarize the mac build, set `manualMac = false` for full auto-update.
const manualMac = true
const isMac = process.platform === 'darwin'

let current: UpdateStatus = { state: 'idle', version: '0.0.0' }
let wired = false

function broadcast(partial: Partial<UpdateStatus>): void {
  current = { ...current, ...partial, version: app.getVersion() }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updater:status', current)
  }
}

function cleanError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.split('\n')[0].slice(0, 200)
}

export function initUpdater(): void {
  if (wired) return
  wired = true
  current = { state: 'idle', version: app.getVersion() }

  autoUpdater.autoDownload = !(isMac && manualMac)
  autoUpdater.autoInstallOnAppQuit = !(isMac && manualMac)

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    if (isMac && manualMac) {
      broadcast({ state: 'available', newVersion: info.version, manual: true })
    } else {
      // autoDownload kicks off automatically; reflect that as progress.
      broadcast({ state: 'downloading', newVersion: info.version, percent: 0 })
    }
  })
  autoUpdater.on('update-not-available', () => broadcast({ state: 'not-available' }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({ state: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ state: 'downloaded', newVersion: info.version })
  )
  autoUpdater.on('error', (err) => broadcast({ state: 'error', message: cleanError(err) }))

  // Silent check shortly after launch (no-op in dev / unpackaged).
  if (app.isPackaged) {
    setTimeout(() => void checkForUpdates(), 5_000)
  }
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    broadcast({ state: 'dev' })
    return current
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    broadcast({ state: 'error', message: cleanError(err) })
  }
  return current
}

export function installUpdate(): void {
  if (isMac && manualMac) {
    openReleases()
    return
  }
  try {
    autoUpdater.quitAndInstall()
  } catch (err) {
    broadcast({ state: 'error', message: cleanError(err) })
  }
}

export function openReleases(): void {
  void shell.openExternal(RELEASES_URL)
}

export function getStatus(): UpdateStatus {
  return current
}
