import { readdirSync, statSync, existsSync } from 'fs'
import { join, relative, sep } from 'path'

// Files/dirs never published or served.
const EXCLUDE_NAMES = new Set(['.slidecraft.json', 'CLAUDE.md', '.DS_Store'])
// `design-guide` is reference-only material and must never be published.
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'design-guide'])

// Preferred deck entry filenames, in priority order.
const ENTRY_CANDIDATES = ['deck.html', 'index.html', 'presentation.html', 'slides.html']

/** Absolute path to the deck's HTML entry file, or null if none exists. */
export function findEntry(dir: string): string | null {
  for (const name of ENTRY_CANDIDATES) {
    const full = join(dir, name)
    if (existsSync(full) && statSync(full).isFile()) return full
  }
  // Fall back to any top-level .html file.
  const html = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.html'))
    .map((e) => e.name)
    .sort()
  return html.length ? join(dir, html[0]) : null
}

export interface DeckFile {
  /** POSIX-style path relative to the project root (no leading slash). */
  rel: string
  abs: string
}

/** Recursively list publishable files under `dir`, excluding meta/junk. */
export function collectFiles(dir: string): DeckFile[] {
  const out: DeckFile[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.well-known') continue
      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue
        walk(join(current, entry.name))
      } else if (entry.isFile()) {
        if (EXCLUDE_NAMES.has(entry.name)) continue
        const abs = join(current, entry.name)
        out.push({ rel: relative(dir, abs).split(sep).join('/'), abs })
      }
    }
  }
  walk(dir)
  return out
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
}

export function contentTypeFor(name: string): string {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : ''
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}
