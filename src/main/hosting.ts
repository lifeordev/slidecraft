import { app, safeStorage } from 'electron'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import type { HostingStatus, TokenResult, PublishResult, PublishInfo } from '../shared/types'
import { findEntry, collectFiles } from './deck'
import { getProject, setPublishInfo } from './projects'
import { encryptHtml } from './gate'

const API = 'https://api.netlify.com/api/v1'

interface HostingConfig {
  provider: 'netlify'
  /** base64 of the (possibly encrypted) token. */
  token: string
  /** true when `token` is OS-encrypted via safeStorage. */
  encrypted: boolean
  account: string | null
}

function configPath(): string {
  return join(app.getPath('userData'), 'hosting.json')
}

function readConfig(): HostingConfig | null {
  const p = configPath()
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as HostingConfig
  } catch {
    return null
  }
}

function getToken(): string | null {
  const cfg = readConfig()
  if (!cfg) return null
  try {
    if (cfg.encrypted) {
      return safeStorage.decryptString(Buffer.from(cfg.token, 'base64'))
    }
    return Buffer.from(cfg.token, 'base64').toString('utf8')
  } catch {
    return null
  }
}

export function hostingStatus(): HostingStatus {
  const cfg = readConfig()
  const encryptionAvailable = safeStorage.isEncryptionAvailable()
  return {
    provider: 'netlify',
    configured: Boolean(cfg?.token),
    account: cfg?.account ?? null,
    encryptionAvailable
  }
}

async function netlify(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {})
    }
  })
}

export async function saveToken(token: string): Promise<TokenResult> {
  const trimmed = token.trim()
  if (!trimmed) return { ok: false, error: 'Please paste a token.' }

  let res: Response
  try {
    res = await netlify(trimmed, '/user')
  } catch (err) {
    return { ok: false, error: `Network error: ${(err as Error).message}` }
  }
  if (res.status === 401) return { ok: false, error: 'That token was rejected by Netlify.' }
  if (!res.ok) return { ok: false, error: `Netlify error (${res.status}).` }

  const user = (await res.json()) as { email?: string; full_name?: string }
  const account = user.email || user.full_name || 'Netlify account'

  const encryptionAvailable = safeStorage.isEncryptionAvailable()
  const stored = encryptionAvailable
    ? safeStorage.encryptString(trimmed).toString('base64')
    : Buffer.from(trimmed, 'utf8').toString('base64')

  const cfg: HostingConfig = {
    provider: 'netlify',
    token: stored,
    encrypted: encryptionAvailable,
    account
  }
  writeFileSync(configPath(), JSON.stringify(cfg), { mode: 0o600 })
  return { ok: true, account }
}

export function clearToken(): void {
  const p = configPath()
  if (existsSync(p)) rmSync(p)
}

function sha1(buf: Buffer): string {
  return createHash('sha1').update(buf).digest('hex')
}

/** Build the file set to upload, applying password encryption to the entry. */
function buildFiles(
  projectPath: string,
  entryAbs: string,
  password: string | undefined,
  title: string
): Map<string, Buffer> {
  const map = new Map<string, Buffer>()
  for (const f of collectFiles(projectPath)) {
    if (password && f.abs === entryAbs) continue // replaced by encrypted index.html
    map.set(f.rel, readFileSync(f.abs))
  }
  if (password) {
    const html = readFileSync(entryAbs, 'utf8')
    map.set('index.html', Buffer.from(encryptHtml(html, password, title), 'utf8'))
  } else {
    const entryRel = [...map.keys()].find((rel) => join(projectPath, rel) === entryAbs)
    if (entryRel !== 'index.html') map.set('index.html', readFileSync(entryAbs))
  }
  return map
}

async function createSite(token: string): Promise<{ id: string; url: string }> {
  const res = await netlify(token, '/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  if (!res.ok) throw new Error(`Could not create site (${res.status}).`)
  const site = (await res.json()) as { id: string; ssl_url?: string; url?: string }
  return { id: site.id, url: site.ssl_url || site.url || '' }
}

async function deployFiles(
  token: string,
  siteId: string,
  files: Map<string, Buffer>
): Promise<void> {
  const digest: Record<string, string> = {}
  const byRel = new Map<string, { sha: string; buf: Buffer }>()
  for (const [rel, buf] of files) {
    const sha = sha1(buf)
    digest[`/${rel}`] = sha
    byRel.set(rel, { sha, buf })
  }

  const res = await netlify(token, `/sites/${siteId}/deploys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: digest })
  })
  if (!res.ok) throw new Error(`Deploy failed to start (${res.status}).`)
  const deploy = (await res.json()) as { id: string; required?: string[] }
  const required = new Set(deploy.required ?? [])

  // Upload every file whose content hash Netlify still needs.
  for (const [rel, { sha, buf }] of byRel) {
    if (!required.has(sha)) continue
    const encoded = rel.split('/').map(encodeURIComponent).join('/')
    const put = await netlify(token, `/deploys/${deploy.id}/files/${encoded}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buf
    })
    if (!put.ok) throw new Error(`Upload failed for ${rel} (${put.status}).`)
  }

  // Wait for the deploy to finish processing.
  for (let i = 0; i < 40; i++) {
    const poll = await netlify(token, `/deploys/${deploy.id}`)
    if (poll.ok) {
      const state = ((await poll.json()) as { state: string }).state
      if (state === 'ready') return
      if (state === 'error') throw new Error('Netlify reported a deploy error.')
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  // Files uploaded; treat a slow finalize as success rather than failing.
}

export async function publish(
  projectId: string,
  opts: { password?: string }
): Promise<PublishResult> {
  const token = getToken()
  if (!token) return { ok: false, error: 'Netlify is not connected.', needsSetup: true }

  const project = getProject(projectId)
  if (!project) return { ok: false, error: 'Project not found.' }

  const entry = findEntry(project.path)
  if (!entry) {
    return {
      ok: false,
      error: 'No deck to publish yet. Ask Claude to build the slides into a deck.html first.'
    }
  }

  const password = opts.password?.trim() || undefined

  try {
    const files = buildFiles(project.path, entry, password, project.name)

    let siteId = project.publish?.siteId ?? ''
    let url = project.publish?.url ?? ''
    if (!siteId) {
      const site = await createSite(token)
      siteId = site.id
      url = site.url
    }

    await deployFiles(token, siteId, files)

    const info: PublishInfo = {
      provider: 'netlify',
      siteId,
      url,
      hasPassword: Boolean(password),
      publishedAt: new Date().toISOString()
    }
    const updated = setPublishInfo(projectId, info)
    if (!updated) return { ok: false, error: 'Could not save publish info.' }
    return { ok: true, project: updated }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
