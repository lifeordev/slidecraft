import { readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'

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
