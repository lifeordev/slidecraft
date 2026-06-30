import { useState } from 'react'
import type { Project } from '../../../shared/types'
import { UpdaterButton } from './UpdaterButton'

interface Props {
  projects: Project[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function Sidebar({ projects, activeId, onSelect, onCreate, onDelete }: Props): JSX.Element {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)

  const submit = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    await onCreate(trimmed)
    setBusy(false)
    setName('')
    setCreating(false)
  }

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return
    setDeleting(true)
    await onDelete(pendingDelete.id)
    setDeleting(false)
    setPendingDelete(null)
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
          <div key={p.id} className={`project-row ${p.id === activeId ? 'selected' : ''}`}>
            <button className="project-item" onClick={() => onSelect(p.id)}>
              <span className="project-name">{p.name}</span>
            </button>
            <button
              className="project-del"
              title="Delete presentation"
              onClick={(e) => {
                e.stopPropagation()
                setPendingDelete(p)
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </nav>

      <footer className="sidebar-footer">
        <UpdaterButton />
      </footer>

      {pendingDelete && (
        <div className="modal-backdrop" onClick={() => !deleting && setPendingDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Delete “{pendingDelete.name}”?</h2>
            </div>
            <div className="modal-body">
              <p>
                This permanently deletes the project folder and all of its files (slides and
                assets) from your computer. This can’t be undone.
              </p>
              {pendingDelete.publish && (
                <div className="hint warn">
                  Its published page at <strong>{pendingDelete.publish.url}</strong> will stay
                  live — remove it from your Netlify dashboard if you want it taken down.
                </div>
              )}
              <div className="modal-actions">
                <button
                  className="btn ghost"
                  onClick={() => setPendingDelete(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button className="btn danger" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Delete project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
