import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

interface Props {
  /** Open a terminal rooted at this project (cwd = project folder). */
  projectId?: string
  /** Optional explicit working directory. */
  cwd?: string
  /** A command typed into the shell once it boots (e.g. an installer). */
  bootCommand?: string
  /** Called once the underlying PTY process exits. */
  onExit?: (exitCode: number) => void
}

export function TerminalPanel({ projectId, cwd, bootCommand, onExit }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#0b0d12',
        foreground: '#d7dce5',
        cursor: '#7aa2f7'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    let ptyId: string | null = null
    let disposed = false
    const disposers: Array<() => void> = []

    const writeDisposable = term.onData((data) => {
      if (ptyId) window.api.terminal.write(ptyId, data)
    })
    disposers.push(() => writeDisposable.dispose())

    disposers.push(
      window.api.terminal.onData(({ id, data }) => {
        if (id === ptyId) term.write(data)
      })
    )
    disposers.push(
      window.api.terminal.onExit(({ id, exitCode }) => {
        if (id === ptyId) {
          term.write(`\r\n\x1b[90m[process exited with code ${exitCode}]\x1b[0m\r\n`)
          onExit?.(exitCode)
        }
      })
    )

    const resize = (): void => {
      try {
        fit.fit()
        if (ptyId) window.api.terminal.resize(ptyId, term.cols, term.rows)
      } catch {
        /* ignore */
      }
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    window.api.terminal
      .create({ projectId, cwd, bootCommand })
      .then(({ id }) => {
        if (disposed) {
          window.api.terminal.kill(id)
          return
        }
        ptyId = id
        resize()
        term.focus()
      })

    return () => {
      disposed = true
      ro.disconnect()
      disposers.forEach((d) => d())
      if (ptyId) window.api.terminal.kill(ptyId)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, cwd, bootCommand])

  return <div className="terminal-host" ref={hostRef} />
}
