import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../shared/types'

export function UpdaterButton(): JSX.Element {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    window.api.updater.status().then(setStatus)
    return window.api.updater.onStatus(setStatus)
  }, [])

  const state = status?.state ?? 'idle'
  const version = status?.version ?? ''

  const check = (): void => {
    window.api.updater.check()
  }

  let action: JSX.Element
  let note: string | null = null

  switch (state) {
    case 'checking':
      action = (
        <button className="btn sm ghost" disabled>
          Checking…
        </button>
      )
      break
    case 'downloading':
      action = (
        <button className="btn sm ghost" disabled>
          Downloading {status?.percent ?? 0}%
        </button>
      )
      break
    case 'downloaded':
      action = (
        <button className="btn sm primary" onClick={() => window.api.updater.install()}>
          Restart &amp; install
        </button>
      )
      note = `v${status?.newVersion} ready`
      break
    case 'available':
      // Manual path (e.g. unsigned macOS): send the user to the download page.
      action = (
        <button className="btn sm primary" onClick={() => window.api.updater.openReleases()}>
          Download v{status?.newVersion}
        </button>
      )
      break
    case 'not-available':
      action = (
        <button className="btn sm ghost" onClick={check}>
          Check for updates
        </button>
      )
      note = 'Up to date'
      break
    case 'error':
      action = (
        <button className="btn sm ghost" onClick={check}>
          Retry update check
        </button>
      )
      note = 'Update check failed'
      break
    case 'dev':
      action = (
        <button className="btn sm ghost" disabled>
          Check for updates
        </button>
      )
      note = 'Dev build'
      break
    default:
      action = (
        <button className="btn sm ghost" onClick={check}>
          Check for updates
        </button>
      )
  }

  return (
    <div className="updater" title={status?.message ?? undefined}>
      <div className="updater-row">
        <span className="updater-version">SlideCraft {version && `v${version}`}</span>
        {note && <span className="updater-note">{note}</span>}
      </div>
      {action}
    </div>
  )
}
