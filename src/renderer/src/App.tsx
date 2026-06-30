import { useEffect, useState, useCallback } from 'react'
import type { ClaudeStatus, Project, DesignGuide } from '../../shared/types'
import { SetupWizard } from './components/SetupWizard'
import { Sidebar } from './components/Sidebar'
import { ProjectView } from './components/ProjectView'

export function App(): JSX.Element {
  const [status, setStatus] = useState<ClaudeStatus | null>(null)
  const [ready, setReady] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [guides, setGuides] = useState<DesignGuide[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const detect = useCallback(async () => {
    const s = await window.api.setup.detect()
    setStatus(s)
    return s
  }, [])

  const refreshProjects = useCallback(async () => {
    const list = await window.api.projects.list()
    setProjects(list)
    return list
  }, [])

  const refreshGuides = useCallback(async () => {
    const list = await window.api.guides.list()
    setGuides(list)
    return list
  }, [])

  useEffect(() => {
    detect()
  }, [detect])

  useEffect(() => {
    if (ready) {
      refreshProjects()
      refreshGuides()
    }
  }, [ready, refreshProjects, refreshGuides])

  // Gate on setup until Claude is installed AND authenticated.
  const needsSetup = !ready && (!status || !status.installed || !status.authed)

  if (status === null) {
    return <div className="boot">Starting SlideCraft…</div>
  }

  if (needsSetup) {
    return (
      <SetupWizard
        status={status}
        onRecheck={detect}
        onDone={() => setReady(true)}
      />
    )
  }

  const active = projects.find((p) => p.id === activeId) ?? null

  return (
    <div className="app">
      <Sidebar
        projects={projects}
        guides={guides}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={async (name, guideId) => {
          const project = await window.api.projects.create(name, guideId)
          await refreshProjects()
          setActiveId(project.id)
        }}
        onDelete={async (id) => {
          await window.api.projects.delete(id)
          await refreshProjects()
          setActiveId((cur) => (cur === id ? null : cur))
        }}
        onGuidesChanged={refreshGuides}
      />
      <main className="main">
        {active ? (
          <ProjectView key={active.id} project={active} onRefresh={refreshProjects} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  )
}

function EmptyState(): JSX.Element {
  return (
    <div className="empty">
      <div className="empty-card">
        <h1>SlideCraft</h1>
        <p>Create a presentation project to start building a deck with Claude.</p>
        <p className="muted">
          Each project is its own folder. Drop in assets, then describe the deck
          you want — Claude builds it for you.
        </p>
      </div>
    </div>
  )
}
