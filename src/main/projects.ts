import { app } from 'electron'
import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  statSync
} from 'fs'
import { join, basename } from 'path'
import type { Project, AssetFile } from '../shared/types'

const META_FILE = '.slidecraft.json'

export function projectsRoot(): string {
  const root = join(app.getPath('documents'), 'SlideCraft')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'presentation'
}

function uniqueDir(root: string, slug: string): string {
  let candidate = join(root, slug)
  let n = 2
  while (existsSync(candidate)) {
    candidate = join(root, `${slug}-${n++}`)
  }
  return candidate
}

const CLAUDE_MD = (name: string) => `# ${name}

You are SlideCraft's presentation assistant. The user is building a
**presentation / slide deck** in this project folder. Everything in this
conversation is in service of that goal.

## Working agreement
- User-provided assets (images, logos, documents, data, brand guidelines) are
  placed in **./assets**. Always check that folder for material to use.
- Build the deck inside this folder. Keep the project tidy and self-contained.
- When the topic, audience, length, or tone is unclear, ask one or two short
  clarifying questions before producing a lot of content.

## Output
- Author slides as **Marp-flavored Markdown** in \`slides.md\` (one \`---\` per
  slide) so they are easy to read and version.
- When asked to preview or finalize, render a self-contained \`deck.html\`
  (e.g. with Marp or reveal.js) that opens in a browser.
- Reference images from ./assets with relative paths.

Keep iterations fast and visual. Default to a clean, modern, legible design.
`

function readMeta(dir: string): Project | null {
  const metaPath = join(dir, META_FILE)
  if (!existsSync(metaPath)) return null
  try {
    const raw = JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<Project>
    if (!raw.id || !raw.name) return null
    return {
      id: raw.id,
      name: raw.name,
      path: dir,
      createdAt: raw.createdAt ?? new Date(0).toISOString(),
      sessionId: raw.sessionId ?? null
    }
  } catch {
    return null
  }
}

function writeMeta(project: Project): void {
  const { path, ...rest } = project
  writeFileSync(join(path, META_FILE), JSON.stringify(rest, null, 2), 'utf8')
}

export function listProjects(): Project[] {
  const root = projectsRoot()
  const entries = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())
  const projects: Project[] = []
  for (const entry of entries) {
    const meta = readMeta(join(root, entry.name))
    if (meta) projects.push(meta)
  }
  return projects.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function createProject(name: string, isoNow: string): Project {
  const root = projectsRoot()
  const dir = uniqueDir(root, slugify(name))
  mkdirSync(join(dir, 'assets'), { recursive: true })

  const project: Project = {
    id: randomUUID(),
    name: name.trim() || basename(dir),
    path: dir,
    createdAt: isoNow,
    sessionId: null
  }
  writeMeta(project)
  writeFileSync(join(dir, 'CLAUDE.md'), CLAUDE_MD(project.name), 'utf8')
  return project
}

export function getProject(id: string): Project | null {
  return listProjects().find((p) => p.id === id) ?? null
}

export function setSessionId(id: string, sessionId: string): void {
  const project = getProject(id)
  if (!project) return
  writeMeta({ ...project, sessionId })
}

export function assetsDir(project: Project): string {
  const dir = join(project.path, 'assets')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function listAssets(id: string): AssetFile[] {
  const project = getProject(id)
  if (!project) return []
  const dir = assetsDir(project)
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => {
      const full = join(dir, e.name)
      return { name: e.name, path: full, size: statSync(full).size }
    })
}

export function addAssets(id: string, sourcePaths: string[]): AssetFile[] {
  const project = getProject(id)
  if (!project) throw new Error('Project not found')
  const dir = assetsDir(project)

  for (const src of sourcePaths) {
    if (!src || !existsSync(src)) continue
    let target = join(dir, basename(src))
    if (existsSync(target)) {
      const dot = basename(src).lastIndexOf('.')
      const stem = dot > 0 ? basename(src).slice(0, dot) : basename(src)
      const ext = dot > 0 ? basename(src).slice(dot) : ''
      let n = 2
      while (existsSync(target)) target = join(dir, `${stem}-${n++}${ext}`)
    }
    copyFileSync(src, target)
  }
  return listAssets(id)
}
