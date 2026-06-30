import { homedir, platform } from 'os'
import { join, delimiter } from 'path'
import { existsSync } from 'fs'

/**
 * GUI-launched apps (especially on macOS) inherit a minimal PATH that omits
 * the locations where `claude`, `node`, and `npm` typically live. We rebuild a
 * sensible PATH so spawned processes (the claude session, the install script,
 * the embedded terminal) can find their tools.
 */
export function buildPath(): string {
  const home = homedir()
  const isWin = platform() === 'win32'

  const extras = isWin
    ? [
        join(home, '.local', 'bin'),
        join(home, 'AppData', 'Roaming', 'npm'),
        join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'claude')
      ]
    : [
        join(home, '.local', 'bin'),
        join(home, '.claude', 'local'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        '/bin',
        join(home, '.npm-global', 'bin'),
        join(home, '.nvm', 'current', 'bin')
      ]

  const current = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const merged = [...current]
  for (const dir of extras) {
    if (!merged.includes(dir)) merged.push(dir)
  }
  return merged.join(delimiter)
}

/** An env object with the augmented PATH, suitable for child_process / pty. */
export function spawnEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: buildPath(),
    // Some installs key off this on Windows.
    Path: buildPath(),
    ...extra
  }
}

/**
 * Resolve the absolute path to the `claude` binary by checking well-known
 * install locations. Returns null if not found.
 */
export function resolveClaudeBinary(): string | null {
  const home = homedir()
  const isWin = platform() === 'win32'
  const names = isWin ? ['claude.exe', 'claude.cmd', 'claude'] : ['claude']

  const dirs = isWin
    ? [
        join(home, '.local', 'bin'),
        join(home, 'AppData', 'Roaming', 'npm'),
        join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'claude')
      ]
    : [
        join(home, '.local', 'bin'),
        join(home, '.claude', 'local'),
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin'
      ]

  for (const dir of dirs) {
    for (const name of names) {
      const full = join(dir, name)
      if (existsSync(full)) return full
    }
  }
  return null
}

export const SHELL = platform() === 'win32'
  ? (process.env.COMSPEC || 'powershell.exe')
  : (process.env.SHELL || '/bin/bash')
