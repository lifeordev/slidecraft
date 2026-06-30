import { randomUUID } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  cpSync,
  rmSync
} from 'fs'
import { join, basename, normalize, sep } from 'path'
import type { DesignGuide } from '../shared/types'
import { projectsRoot } from './projects'

const GUIDE_META = '.slidecraft-guide.json'

export function guidesRoot(): string {
  const root = join(projectsRoot(), 'Design Guides')
  if (!existsSync(root)) mkdirSync(root, { recursive: true })
  return root
}

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'guide'
}

function uniqueDir(root: string, slug: string): string {
  let candidate = join(root, slug)
  let n = 2
  while (existsSync(candidate)) candidate = join(root, `${slug}-${n++}`)
  return candidate
}

function countFiles(dir: string): number {
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === GUIDE_META || entry.name.startsWith('.')) continue
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name))
    else if (entry.isFile()) n += 1
  }
  return n
}

function readGuide(dir: string): DesignGuide | null {
  const metaPath = join(dir, GUIDE_META)
  if (!existsSync(metaPath)) return null
  try {
    const raw = JSON.parse(readFileSync(metaPath, 'utf8')) as Partial<DesignGuide>
    if (!raw.id || !raw.name) return null
    return {
      id: raw.id,
      name: raw.name,
      path: dir,
      createdAt: raw.createdAt ?? new Date(0).toISOString(),
      fileCount: countFiles(dir)
    }
  } catch {
    return null
  }
}

export function listGuides(): DesignGuide[] {
  const root = guidesRoot()
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readGuide(join(root, e.name)))
    .filter((g): g is DesignGuide => g !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function getGuide(id: string): DesignGuide | null {
  return listGuides().find((g) => g.id === id) ?? null
}

export function createGuide(name: string, isoNow: string): DesignGuide {
  const dir = uniqueDir(guidesRoot(), slugify(name))
  mkdirSync(dir, { recursive: true })
  const meta = { id: randomUUID(), name: name.trim() || basename(dir), createdAt: isoNow }
  writeFileSync(join(dir, GUIDE_META), JSON.stringify(meta, null, 2), 'utf8')
  return { ...meta, path: dir, fileCount: 0 }
}

export function deleteGuide(id: string): boolean {
  const guide = getGuide(id)
  if (!guide) return false
  const root = normalize(guidesRoot() + sep)
  const target = normalize(guide.path)
  if (!target.startsWith(root)) return false
  if (!existsSync(join(target, GUIDE_META))) return false
  rmSync(target, { recursive: true, force: true })
  return true
}

export function addGuideFiles(id: string, sourcePaths: string[]): DesignGuide | null {
  const guide = getGuide(id)
  if (!guide) return null
  for (const src of sourcePaths) {
    if (!src || !existsSync(src)) continue
    let target = join(guide.path, basename(src))
    if (existsSync(target)) {
      const name = basename(src)
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let n = 2
      while (existsSync(target)) target = join(guide.path, `${stem}-${n++}${ext}`)
    }
    copyFileSync(src, target)
  }
  return getGuide(id)
}

/**
 * Copy a guide's contents (everything except its metadata file) into the
 * project's `design-guide/` folder, so the project is self-contained.
 */
export function copyGuideInto(projectPath: string, guideId: string): DesignGuide | null {
  const guide = getGuide(guideId)
  if (!guide) return null
  const dest = join(projectPath, 'design-guide')
  mkdirSync(dest, { recursive: true })
  cpSync(guide.path, dest, {
    recursive: true,
    filter: (src) => basename(src) !== GUIDE_META
  })
  return guide
}
