import { useEffect, useState, useCallback } from 'react'
import type { Project, AssetFile } from '../../../shared/types'

interface Props {
  project: Project
  refreshKey: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AssetsPanel({ project, refreshKey }: Props): JSX.Element {
  const [assets, setAssets] = useState<AssetFile[]>([])
  const [dragOver, setDragOver] = useState(false)

  const refresh = useCallback(async () => {
    setAssets(await window.api.projects.listAssets(project.id))
  }, [project.id])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  const addDroppedFiles = useCallback(
    async (files: FileList) => {
      const paths = Array.from(files)
        .map((f) => window.api.pathForFile(f))
        .filter(Boolean)
      if (paths.length === 0) return
      await window.api.projects.addAssets(project.id, paths)
      await refresh()
    },
    [project.id, refresh]
  )

  return (
    <div
      className={`assets-panel ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragOver(true)
      }}
      onDragLeave={(e) => {
        // Ignore leave events bubbling up from children.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files?.length) addDroppedFiles(e.dataTransfer.files)
      }}
    >
      <div className="assets-head">
        <span>Assets</span>
        <button className="link-btn" onClick={() => window.api.projects.reveal(project.id)}>
          Open folder
        </button>
      </div>
      {assets.length === 0 ? (
        <div className="assets-empty">
          Drag files here (or onto the chat) to add them to <code>./assets</code>.
        </div>
      ) : (
        <ul className="assets-list">
          {assets.map((a) => (
            <li key={a.path} className="asset-item" title={a.path}>
              <span className="asset-name">{a.name}</span>
              <span className="asset-size">{formatSize(a.size)}</span>
            </li>
          ))}
        </ul>
      )}
      {dragOver && <div className="assets-drop">Drop to add to ./assets</div>}
    </div>
  )
}
