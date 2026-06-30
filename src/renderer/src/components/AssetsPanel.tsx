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

  const refresh = useCallback(async () => {
    setAssets(await window.api.projects.listAssets(project.id))
  }, [project.id])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  return (
    <div className="assets-panel">
      <div className="assets-head">
        <span>Assets</span>
        <button className="link-btn" onClick={() => window.api.projects.reveal(project.id)}>
          Open folder
        </button>
      </div>
      {assets.length === 0 ? (
        <div className="assets-empty">
          Drop images, docs, or data onto the chat to add them to <code>./assets</code>.
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
    </div>
  )
}
