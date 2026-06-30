import { useState } from 'react'
import type { DesignGuide } from '../../../shared/types'

interface Props {
  guides: DesignGuide[]
  onClose: () => void
  onChanged: () => Promise<unknown>
}

export function GuidesManager({ guides, onClose, onChanged }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DesignGuide | null>(null)

  const create = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    await window.api.guides.create(trimmed)
    await onChanged()
    setBusy(false)
    setName('')
  }

  const drop = async (id: string, files: FileList): Promise<void> => {
    const paths = Array.from(files)
      .map((f) => window.api.pathForFile(f))
      .filter(Boolean)
    if (!paths.length) return
    await window.api.guides.addFiles(id, paths)
    await onChanged()
  }

  const remove = async (): Promise<void> => {
    if (!pendingDelete) return
    await window.api.guides.delete(pendingDelete.id)
    await onChanged()
    setPendingDelete(null)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Design guides</h2>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="muted">
            A design guide is a reusable folder of style notes, colors, fonts, and logos. Pick one
            when creating a project and Claude will follow it.
          </p>

          <div className="guide-create">
            <input
              className="text-input"
              placeholder="New guide name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <button className="btn" onClick={create} disabled={busy || !name.trim()}>
              Create
            </button>
          </div>

          {guides.length === 0 ? (
            <div className="guides-empty">No design guides yet.</div>
          ) : (
            <ul className="guide-list">
              {guides.map((g) => (
                <li
                  key={g.id}
                  className={`guide-item ${dragId === g.id ? 'drag-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                    setDragId(g.id)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragId(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragId(null)
                    if (e.dataTransfer.files?.length) drop(g.id, e.dataTransfer.files)
                  }}
                >
                  <div className="guide-meta">
                    <span className="guide-name">{g.name}</span>
                    <span className="guide-count">
                      {g.fileCount} file{g.fileCount === 1 ? '' : 's'} · drop files to add
                    </span>
                  </div>
                  <div className="guide-actions">
                    <button className="link-btn" onClick={() => window.api.guides.reveal(g.id)}>
                      Open folder
                    </button>
                    <button className="project-del" onClick={() => setPendingDelete(g)}>
                      🗑
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pendingDelete && (
          <div className="modal-backdrop" onClick={() => setPendingDelete(null)}>
            <div className="modal small" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <h2>Delete “{pendingDelete.name}”?</h2>
              </div>
              <div className="modal-body">
                <p>
                  This deletes the design guide folder and its files. Projects already created from
                  it keep their own copy and are unaffected.
                </p>
                <div className="modal-actions">
                  <button className="btn ghost" onClick={() => setPendingDelete(null)}>
                    Cancel
                  </button>
                  <button className="btn danger" onClick={remove}>
                    Delete guide
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
