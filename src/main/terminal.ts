import { randomUUID } from 'crypto'
import { EventEmitter } from 'events'
import { platform } from 'os'
import * as pty from '@lydell/node-pty'
import type { IPty } from '@lydell/node-pty'
import { spawnEnv, SHELL } from './env'

interface Term {
  id: string
  proc: IPty
}

/**
 * Manages embedded PTY terminals. Used by the setup wizard (to run the Claude
 * installer and `claude setup-token` login) and the per-project Terminal tab.
 */
class TerminalManager extends EventEmitter {
  private terms = new Map<string, Term>()

  create(opts: { cwd?: string; bootCommand?: string }): { id: string } {
    const id = randomUUID()
    const isWin = platform() === 'win32'
    const shell = SHELL
    const args = isWin ? [] : ['-l']

    const proc = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: opts.cwd || process.env.HOME || process.cwd(),
      env: spawnEnv() as { [key: string]: string }
    })

    const term: Term = { id, proc }
    this.terms.set(id, term)

    proc.onData((data) => this.emit('data', { id, data }))
    proc.onExit(({ exitCode }) => {
      this.emit('exit', { id, exitCode })
      this.terms.delete(id)
    })

    if (opts.bootCommand) {
      const newline = isWin ? '\r\n' : '\n'
      // Small delay so the shell prompt is ready before we type.
      setTimeout(() => proc.write(opts.bootCommand + newline), 300)
    }

    return { id }
  }

  write(id: string, data: string): void {
    this.terms.get(id)?.proc.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      this.terms.get(id)?.proc.resize(Math.max(cols, 2), Math.max(rows, 2))
    } catch {
      /* terminal may have exited */
    }
  }

  kill(id: string): void {
    const term = this.terms.get(id)
    if (!term) return
    try {
      term.proc.kill()
    } catch {
      /* ignore */
    }
    this.terms.delete(id)
  }

  killAll(): void {
    for (const id of [...this.terms.keys()]) this.kill(id)
  }
}

export const terminalManager = new TerminalManager()
