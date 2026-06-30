import { useEffect, useState } from 'react'
import type { Project, HostingStatus } from '../../../shared/types'

interface Props {
  project: Project
  onClose: () => void
  onPublished: () => Promise<unknown>
}

type Step = 'loading' | 'setup' | 'options' | 'publishing' | 'done' | 'error'

export function PublishDialog({ project, onClose, onPublished }: Props): JSX.Element {
  const [status, setStatus] = useState<HostingStatus | null>(null)
  const [step, setStep] = useState<Step>('loading')
  const [token, setToken] = useState('')
  const [usePassword, setUsePassword] = useState(project.publish?.hasPassword ?? false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [resultLocked, setResultLocked] = useState(false)

  useEffect(() => {
    window.api.hosting.status().then((s) => {
      setStatus(s)
      setStep(s.configured ? 'options' : 'setup')
    })
  }, [])

  const connect = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    const res = await window.api.hosting.saveToken(token)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setStatus((s) => (s ? { ...s, configured: true, account: res.account } : s))
    setToken('')
    setStep('options')
  }

  const publish = async (): Promise<void> => {
    setError(null)
    if (usePassword && !password.trim()) {
      setError('Enter a password or turn off password protection.')
      return
    }
    setStep('publishing')
    const res = await window.api.hosting.publish(project.id, {
      password: usePassword ? password : undefined
    })
    if (!res.ok) {
      if (res.needsSetup) {
        setStep('setup')
        setError(res.error)
        return
      }
      setError(res.error)
      setStep('error')
      return
    }
    setResultUrl(res.project.publish?.url ?? null)
    setResultLocked(Boolean(res.project.publish?.hasPassword))
    await onPublished()
    setStep('done')
  }

  const disconnect = async (): Promise<void> => {
    await window.api.hosting.clearToken()
    const s = await window.api.hosting.status()
    setStatus(s)
    setStep('setup')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Publish “{project.name}”</h2>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {step === 'loading' && <div className="modal-body muted">Checking connection…</div>}

        {step === 'setup' && (
          <div className="modal-body">
            <p className="muted">
              SlideCraft publishes your deck to <strong>Netlify</strong> (free). Connect your
              account once with a personal access token.
            </p>
            <ol className="howto">
              <li>
                Create a free account at{' '}
                <a href="https://app.netlify.com/signup" target="_blank" rel="noreferrer">
                  app.netlify.com/signup
                </a>
                .
              </li>
              <li>
                Open{' '}
                <a
                  href="https://app.netlify.com/user/applications#personal-access-tokens"
                  target="_blank"
                  rel="noreferrer"
                >
                  User settings → Applications → Personal access tokens
                </a>
                .
              </li>
              <li>
                Click <strong>New access token</strong>, name it “SlideCraft”, and create it.
              </li>
              <li>Copy the token and paste it below.</li>
            </ol>
            <input
              className="text-input"
              type="password"
              placeholder="Netlify personal access token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && token.trim() && connect()}
            />
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" onClick={connect} disabled={busy || !token.trim()}>
                {busy ? 'Connecting…' : 'Connect Netlify'}
              </button>
            </div>
          </div>
        )}

        {step === 'options' && (
          <div className="modal-body">
            <div className="account-row">
              Connected as <strong>{status?.account}</strong>
              <button className="link-btn" onClick={disconnect}>
                Disconnect
              </button>
            </div>

            {project.publish && (
              <p className="muted">
                Currently live at{' '}
                <a href={project.publish.url} target="_blank" rel="noreferrer">
                  {project.publish.url}
                </a>
                . Publishing again updates the same URL.
              </p>
            )}

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={usePassword}
                onChange={(e) => setUsePassword(e.target.checked)}
              />
              <span>Password-protect this presentation</span>
            </label>
            {usePassword && (
              <>
                <input
                  className="text-input"
                  type="text"
                  placeholder="Password viewers must enter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <div className="hint">
                  The deck is encrypted in your browser and unlocked with this password. Linked
                  files in <code>assets/</code> stay at unguessable URLs but aren’t themselves
                  encrypted.
                </div>
              </>
            )}
            {!status?.encryptionAvailable && (
              <div className="hint warn">
                Your OS keychain isn’t available, so the Netlify token is stored unencrypted on
                this machine.
              </div>
            )}

            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button className="btn primary" onClick={publish}>
                {project.publish ? 'Republish' : 'Publish'}
              </button>
            </div>
          </div>
        )}

        {step === 'publishing' && (
          <div className="modal-body publishing">
            <div className="spinner" />
            <p>Uploading and deploying your deck…</p>
          </div>
        )}

        {step === 'done' && (
          <div className="modal-body">
            <p className="success">✓ Published{resultLocked ? ' (password protected)' : ''}</p>
            <a className="result-url" href={resultUrl ?? '#'} target="_blank" rel="noreferrer">
              {resultUrl}
            </a>
            <div className="modal-actions">
              <button
                className="btn"
                onClick={() => resultUrl && navigator.clipboard.writeText(resultUrl)}
              >
                Copy link
              </button>
              <button className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {step === 'error' && (
          <div className="modal-body">
            <p className="form-error">{error}</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={onClose}>
                Close
              </button>
              <button className="btn primary" onClick={() => setStep('options')}>
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
