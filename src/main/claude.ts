import { execFile } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { homedir, platform } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import type { ClaudeStatus } from '../shared/types'
import { resolveClaudeBinary, spawnEnv } from './env'

const execFileAsync = promisify(execFile)

let cachedBinary: string | null | undefined

export function claudeBinary(): string | null {
  if (cachedBinary === undefined) cachedBinary = resolveClaudeBinary()
  return cachedBinary
}

/** Force a re-resolve, e.g. after an install completes. */
export function refreshClaudeBinary(): string | null {
  cachedBinary = resolveClaudeBinary()
  return cachedBinary
}

async function getVersion(bin: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(bin, ['--version'], {
      env: spawnEnv(),
      timeout: 10_000
    })
    return stdout.trim() || null
  } catch {
    return null
  }
}

/**
 * Best-effort check for stored subscription/OAuth credentials.
 * - Linux/Windows: Claude Code writes ~/.claude/.credentials.json
 * - macOS: credentials live in the login Keychain ("Claude Code-credentials")
 */
async function isAuthed(): Promise<boolean> {
  const credFile = join(homedir(), '.claude', '.credentials.json')
  if (existsSync(credFile)) {
    try {
      const raw = readFileSync(credFile, 'utf8')
      return raw.trim().length > 2
    } catch {
      /* fall through */
    }
  }

  if (platform() === 'darwin') {
    try {
      await execFileAsync(
        'security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        { timeout: 5_000 }
      )
      return true
    } catch {
      return false
    }
  }

  // Token can also be supplied via env (headless setups).
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY)
}

export async function detectClaude(): Promise<ClaudeStatus> {
  const bin = refreshClaudeBinary()
  if (!bin) {
    return { installed: false, path: null, version: null, authed: false }
  }
  const [version, authed] = await Promise.all([getVersion(bin), isAuthed()])
  return { installed: true, path: bin, version, authed }
}

/** The shell command that installs Claude Code on the current platform. */
export function installCommand(): string {
  if (platform() === 'win32') {
    return 'irm https://claude.ai/install.ps1 | iex'
  }
  return 'curl -fsSL https://claude.ai/install.sh | bash'
}
