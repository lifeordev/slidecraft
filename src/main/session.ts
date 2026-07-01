import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { screen } from 'electron'
import type { SessionEvent, Project } from '../shared/types'
import { claudeBinary } from './claude'
import { spawnEnv } from './env'
import { getProject, setSessionId } from './projects'

const BASE_PROMPT = [
  'You are SlideCraft, a focused assistant for building presentations / slide decks.',
  'The current working directory is a single presentation project.',
  'User-provided assets live in ./assets — use them when relevant.',
  'If a ./design-guide folder exists, treat it as the reusable design system for',
  'this deck (read it; copy any logos/images you actually use into ./assets).',
  'Author slides as Marp-flavored Markdown in slides.md and, when asked to preview',
  'or finalize, render a self-contained deck.html. Keep the design clean and modern,',
  'and ask brief clarifying questions when the brief is ambiguous.'
].join(' ')

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Build the system prompt, injecting the user's screen dimensions so Claude
 * authors a full-bleed deck that fills THIS display edge-to-edge (rather than a
 * fixed-aspect slide that gets letterboxed with black bars in Preview/Present).
 */
function buildSystemPrompt(): string {
  let sizing =
    'Build deck.html full-bleed: each slide must fill the entire viewport' +
    ' (100vw × 100vh) with no black margins.'
  try {
    const { width, height } = screen.getPrimaryDisplay().size
    const g = gcd(width, height) || 1
    sizing =
      `The user's screen is ${width}×${height} (aspect ${width / g}:${height / g}).` +
      ' Build deck.html full-bleed so each slide fills the entire viewport' +
      ' (100vw × 100vh) with no black margins, and design the slide aspect ratio' +
      ` to match this screen (${width / g}:${height / g}) so it fills edge-to-edge` +
      ' in Preview/Present. If you use reveal.js, set its width/height to the' +
      ' screen size (or width/height: "100%") rather than the default 960×700.'
  } catch {
    /* screen unavailable (e.g. headless) — keep the generic full-bleed guidance */
  }
  return `${BASE_PROMPT} ${sizing}`
}

interface Session {
  projectId: string
  child: ChildProcessWithoutNullStreams
  stdoutBuffer: string
  sessionId: string | null
}

/**
 * Manages one streaming `claude` process per project. Emits normalized
 * SessionEvent objects on the 'event' channel.
 */
class SessionManager extends EventEmitter {
  private sessions = new Map<string, Session>()

  isRunning(projectId: string): boolean {
    return this.sessions.has(projectId)
  }

  async start(projectId: string): Promise<{ sessionId: string }> {
    const existing = this.sessions.get(projectId)
    if (existing) return { sessionId: existing.sessionId ?? '' }

    const bin = claudeBinary()
    if (!bin) throw new Error('Claude Code is not installed.')

    const project = getProject(projectId)
    if (!project) throw new Error('Project not found.')

    const resume = project.sessionId
    const newSessionId = resume ?? randomUUID()

    const args = [
      '--print',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--permission-mode', 'bypassPermissions',
      '--append-system-prompt', buildSystemPrompt()
    ]
    if (resume) {
      args.push('--resume', resume)
    } else {
      args.push('--session-id', newSessionId)
    }

    const child = spawn(bin, args, {
      cwd: project.path,
      env: spawnEnv(),
      stdio: ['pipe', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams

    const session: Session = {
      projectId,
      child,
      stdoutBuffer: '',
      sessionId: newSessionId
    }
    this.sessions.set(projectId, session)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.onStdout(session, chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      // Surface only genuinely useful stderr; the CLI is mostly quiet here.
      const text = chunk.trim()
      if (text) console.error(`[claude:${projectId}] ${text}`)
    })

    child.on('error', (err) => {
      this.emitEvent({ kind: 'error', projectId, message: err.message })
      this.sessions.delete(projectId)
    })
    child.on('exit', (code) => {
      this.emitEvent({ kind: 'exit', projectId, code })
      this.sessions.delete(projectId)
    })

    return { sessionId: newSessionId }
  }

  async send(projectId: string, text: string): Promise<void> {
    let session = this.sessions.get(projectId)
    if (!session) {
      await this.start(projectId)
      session = this.sessions.get(projectId)
    }
    if (!session) throw new Error('Could not start session.')

    const message = {
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text }] }
    }
    session.child.stdin.write(JSON.stringify(message) + '\n')
  }

  async stop(projectId: string): Promise<void> {
    const session = this.sessions.get(projectId)
    if (!session) return
    // Closing stdin lets the CLI finish gracefully; kill as a fallback.
    try {
      session.child.stdin.end()
    } catch {
      /* ignore */
    }
    session.child.kill('SIGTERM')
    this.sessions.delete(projectId)
  }

  stopAll(): void {
    for (const id of [...this.sessions.keys()]) void this.stop(id)
  }

  private onStdout(session: Session, chunk: string): void {
    session.stdoutBuffer += chunk
    let nl: number
    while ((nl = session.stdoutBuffer.indexOf('\n')) !== -1) {
      const line = session.stdoutBuffer.slice(0, nl).trim()
      session.stdoutBuffer = session.stdoutBuffer.slice(nl + 1)
      if (line) this.handleLine(session, line)
    }
  }

  private handleLine(session: Session, line: string): void {
    let msg: any
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    const projectId = session.projectId

    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init' && msg.session_id) {
          session.sessionId = msg.session_id
          this.persistSessionId(session)
          this.emitEvent({
            kind: 'started',
            projectId,
            sessionId: msg.session_id,
            model: msg.model ?? 'claude'
          })
        }
        break

      case 'assistant':
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            this.emitEvent({ kind: 'text', projectId, text: block.text })
          } else if (block.type === 'tool_use') {
            this.emitEvent({
              kind: 'tool',
              projectId,
              name: block.name,
              summary: summarizeToolInput(block.name, block.input)
            })
          }
        }
        break

      case 'user':
        // Tool results are echoed back as user messages.
        for (const block of msg.message?.content ?? []) {
          if (block.type === 'tool_result') {
            this.emitEvent({
              kind: 'tool-result',
              projectId,
              summary: summarizeToolResult(block.content),
              isError: Boolean(block.is_error)
            })
          }
        }
        break

      case 'result':
        this.emitEvent({
          kind: 'turn-complete',
          projectId,
          costUsd: typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : 0,
          durationMs: typeof msg.duration_ms === 'number' ? msg.duration_ms : 0
        })
        break

      default:
        // rate_limit_event, stream_event, etc. — ignored for v1.
        break
    }
  }

  private persistSessionId(session: Session): void {
    if (session.sessionId) {
      try {
        setSessionId(session.projectId, session.sessionId)
      } catch {
        /* non-fatal */
      }
    }
  }

  private emitEvent(event: SessionEvent): void {
    this.emit('event', event)
  }
}

function summarizeToolInput(name: string, input: any): string {
  if (!input || typeof input !== 'object') return name
  switch (name) {
    case 'Write':
    case 'Edit':
    case 'Read':
      return input.file_path ? `${name} ${shortPath(input.file_path)}` : name
    case 'Bash':
      return input.command ? `$ ${truncate(input.command, 80)}` : name
    case 'WebFetch':
      return input.url ? `Fetch ${truncate(input.url, 60)}` : name
    case 'WebSearch':
      return input.query ? `Search "${truncate(input.query, 50)}"` : name
    case 'Glob':
    case 'Grep':
      return input.pattern ? `${name} ${truncate(input.pattern, 50)}` : name
    default:
      return name
  }
}

function summarizeToolResult(content: any): string {
  let text = ''
  if (typeof content === 'string') text = content
  else if (Array.isArray(content)) {
    text = content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join(' ')
  }
  text = text.trim()
  if (!text) return 'done'
  return truncate(text.replace(/\s+/g, ' '), 120)
}

function shortPath(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts.slice(-2).join('/')
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export const sessionManager = new SessionManager()
