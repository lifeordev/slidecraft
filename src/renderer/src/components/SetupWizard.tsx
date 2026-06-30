import { useState } from 'react'
import type { ClaudeStatus } from '../../../shared/types'
import { TerminalPanel } from './TerminalPanel'

interface Props {
  status: ClaudeStatus
  onRecheck: () => Promise<ClaudeStatus>
  onDone: () => void
}

type Action = 'none' | 'install' | 'auth'

export function SetupWizard({ status, onRecheck, onDone }: Props): JSX.Element {
  const [action, setAction] = useState<Action>('none')
  const [bootCommand, setBootCommand] = useState<string | undefined>()
  const [checking, setChecking] = useState(false)

  const startInstall = async (): Promise<void> => {
    const cmd = await window.api.setup.installCommand()
    setBootCommand(cmd)
    setAction('install')
  }

  const startAuth = (): void => {
    setBootCommand('claude setup-token')
    setAction('auth')
  }

  const recheck = async (): Promise<void> => {
    setChecking(true)
    const next = await onRecheck()
    setChecking(false)
    setAction('none')
    if (next.installed && next.authed) onDone()
  }

  const stepInstalled = status.installed
  const stepAuthed = status.authed

  return (
    <div className="setup">
      <div className="setup-panel">
        <header className="setup-header">
          <h1>Welcome to SlideCraft</h1>
          <p className="muted">Let’s get Claude Code ready. This is a one-time setup.</p>
        </header>

        <ol className="steps">
          <li className={stepInstalled ? 'step done' : 'step active'}>
            <span className="step-dot">{stepInstalled ? '✓' : '1'}</span>
            <div className="step-body">
              <div className="step-title">Install Claude Code</div>
              <div className="step-sub">
                {stepInstalled
                  ? `Installed${status.version ? ` · ${status.version}` : ''}`
                  : 'Not found on this machine.'}
              </div>
            </div>
            {!stepInstalled && (
              <button className="btn" onClick={startInstall}>
                Install
              </button>
            )}
          </li>

          <li className={stepAuthed ? 'step done' : stepInstalled ? 'step active' : 'step'}>
            <span className="step-dot">{stepAuthed ? '✓' : '2'}</span>
            <div className="step-body">
              <div className="step-title">Sign in to your Claude subscription</div>
              <div className="step-sub">
                {stepAuthed
                  ? 'Authenticated.'
                  : 'Authorize Claude Code with your Pro or Max account.'}
              </div>
            </div>
            {stepInstalled && !stepAuthed && (
              <button className="btn" onClick={startAuth}>
                Sign in
              </button>
            )}
          </li>
        </ol>

        {action !== 'none' && (
          <div className="setup-terminal">
            <div className="setup-terminal-hint">
              {action === 'install'
                ? 'Running the installer. When it finishes, click “Re-check”.'
                : 'A browser window will open. Approve access, paste the code back here, then click “Re-check”.'}
            </div>
            <TerminalPanel bootCommand={bootCommand} />
          </div>
        )}

        <footer className="setup-footer">
          <button className="btn ghost" onClick={recheck} disabled={checking}>
            {checking ? 'Checking…' : 'Re-check'}
          </button>
          {stepInstalled && stepAuthed && (
            <button className="btn primary" onClick={onDone}>
              Continue
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
