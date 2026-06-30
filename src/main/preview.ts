import { createServer, Server } from 'http'
import { createReadStream, existsSync, statSync } from 'fs'
import { join, normalize, basename, sep } from 'path'
import { AddressInfo } from 'net'
import { BrowserWindow } from 'electron'
import type { PreviewResult } from '../shared/types'
import { findEntry, contentTypeFor } from './deck'
import { getProject } from './projects'

// projectId -> served directory
const mounts = new Map<string, string>()
const windows = new Map<string, BrowserWindow>()
let server: Server | null = null
let port = 0

function ensureServer(): Promise<number> {
  if (server && port) return Promise.resolve(port)
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
        const projectId = segments.shift()
        const root = projectId ? mounts.get(projectId) : undefined
        if (!root) {
          res.writeHead(404).end('Unknown preview')
          return
        }
        // Resolve the requested path, guarding against traversal.
        const rel = segments.join('/') || 'index.html'
        const abs = normalize(join(root, rel))
        const base = normalize(root + sep)
        if (abs !== normalize(root) && !abs.startsWith(base)) {
          res.writeHead(403).end('Forbidden')
          return
        }
        if (!existsSync(abs) || !statSync(abs).isFile()) {
          res.writeHead(404).end('Not found')
          return
        }
        res.writeHead(200, {
          'Content-Type': contentTypeFor(basename(abs)),
          'Cache-Control': 'no-store'
        })
        createReadStream(abs).pipe(res)
      } catch {
        res.writeHead(500).end('Preview error')
      }
    })
    srv.on('error', reject)
    // Bind to loopback only.
    srv.listen(0, '127.0.0.1', () => {
      server = srv
      port = (srv.address() as AddressInfo).port
      resolve(port)
    })
  })
}

export async function openPreview(projectId: string): Promise<PreviewResult> {
  const project = getProject(projectId)
  if (!project) return { ok: false, error: 'Project not found.' }

  const entry = findEntry(project.path)
  if (!entry) {
    return {
      ok: false,
      error:
        'No deck to preview yet. Ask Claude to build the slides into a deck.html (or index.html) first.'
    }
  }

  mounts.set(projectId, project.path)
  const p = await ensureServer()
  const url = `http://127.0.0.1:${p}/${encodeURIComponent(projectId)}/${encodeURIComponent(
    basename(entry)
  )}`

  const existing = windows.get(projectId)
  if (existing && !existing.isDestroyed()) {
    existing.loadURL(url)
    existing.focus()
    return { ok: true, url }
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: `Preview — ${project.name}`,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  win.on('closed', () => windows.delete(projectId))
  windows.set(projectId, win)
  await win.loadURL(url)
  return { ok: true, url }
}

export function disposePreview(): void {
  for (const win of windows.values()) if (!win.isDestroyed()) win.destroy()
  windows.clear()
  mounts.clear()
  server?.close()
  server = null
  port = 0
}
