import { useState } from 'react'
import type { Project } from '../../../shared/types'

interface Props {
  projects: Project[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => Promise<void>
}

export function Sidebar({ projects, activeId, onSelect, onCreate }: Props): JSX.Element {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    await onCreate(trimmed)
    setBusy(false)
    setName('')
    setCreating(false)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">SlideCraft</div>
        <button className="icon-btn" title="New presentation" onClick={() => setCreating(true)}>
          +
        </button>
      </div>

      {creating && (
        <div className="new-project">
          <input
            autoFocus
            className="text-input"
            placeholder="Presentation name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') setCreating(false)
            }}
          />
          <div className="new-project-actions">
            <button className="btn sm" onClick={submit} disabled={busy}>
              Create
            </button>
            <button className="btn sm ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <nav className="project-list">
        {projects.length === 0 && !creating && (
          <div className="sidebar-empty">No presentations yet.</div>
        )}
        {projects.map((p) => (
          <button
            key={p.id}
            className={`project-item ${p.id === activeId ? 'selected' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            <span className="project-name">{p.name}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
