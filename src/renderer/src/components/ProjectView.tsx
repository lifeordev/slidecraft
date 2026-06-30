import { useState } from 'react'
import type { Project } from '../../../shared/types'
import { ChatView } from './ChatView'
import { AssetsPanel } from './AssetsPanel'
import { TerminalPanel } from './TerminalPanel'

interface Props {
  project: Project
}

type Tab = 'chat' | 'terminal'

export function ProjectView({ project }: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('chat')
  const [assetKey, setAssetKey] = useState(0)

  return (
    <div className="project">
      <header className="project-header">
        <div className="project-title">
          <h2>{project.name}</h2>
          <button className="link-btn" onClick={() => window.api.projects.reveal(project.id)}>
            {project.path}
          </button>
        </div>
        <div className="tabs">
          <button
            className={`tab ${tab === 'chat' ? 'active' : ''}`}
            onClick={() => setTab('chat')}
          >
            Chat
          </button>
          <button
            className={`tab ${tab === 'terminal' ? 'active' : ''}`}
            onClick={() => setTab('terminal')}
          >
            Terminal
          </button>
        </div>
      </header>

      <div className="project-body">
        <div className="project-main">
          {/* Keep both mounted so the terminal/session survive tab switches. */}
          <div style={{ display: tab === 'chat' ? 'flex' : 'none', flex: 1, minHeight: 0 }}>
            <ChatView project={project} onAssetsChanged={() => setAssetKey((k) => k + 1)} />
          </div>
          <div style={{ display: tab === 'terminal' ? 'block' : 'none', flex: 1, minHeight: 0 }}>
            {tab === 'terminal' && (
              <div className="terminal-wrap">
                <TerminalPanel projectId={project.id} />
              </div>
            )}
          </div>
        </div>
        <AssetsPanel project={project} refreshKey={assetKey} />
      </div>
    </div>
  )
}
