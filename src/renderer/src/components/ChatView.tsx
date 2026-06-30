import { useEffect, useRef, useState, useCallback } from 'react'
import type { Project, SessionEvent } from '../../../shared/types'
import type { ChatItem } from '../types'

interface Props {
  project: Project
  onAssetsChanged: () => void
}

let idCounter = 0
const nextId = (): string => `m${++idCounter}`

export function ChatView({ project, onAssetsChanged }: Props): JSX.Element {
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const append = useCallback((item: ChatItem) => {
    setItems((prev) => [...prev, item])
  }, [])

  // Subscribe to the global session event stream, filtered to this project.
  useEffect(() => {
    const off = window.api.session.onEvent((event: SessionEvent) => {
      if (event.projectId !== project.id) return
      switch (event.kind) {
        case 'started':
          append({ id: nextId(), role: 'notice', text: `Session ready · ${event.model}` })
          break
        case 'text':
          append({ id: nextId(), role: 'assistant', text: event.text })
          break
        case 'tool':
          append({ id: nextId(), role: 'tool', name: event.name, summary: event.summary })
          break
        case 'tool-result':
          // Attach to the most recent tool item that has no result yet.
          setItems((prev) => {
            const copy = [...prev]
            for (let i = copy.length - 1; i >= 0; i--) {
              const it = copy[i]
              if (it.role === 'tool' && it.result === undefined) {
                copy[i] = { ...it, result: event.summary, isError: event.isError }
                break
              }
            }
            return copy
          })
          break
        case 'turn-complete':
          setRunning(false)
          break
        case 'error':
          append({ id: nextId(), role: 'notice', text: `Error: ${event.message}` })
          setRunning(false)
          break
        case 'exit':
          setRunning(false)
          break
      }
    })
    return off
  }, [project.id, append])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [items])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || running) return
    append({ id: nextId(), role: 'user', text })
    setInput('')
    setRunning(true)
    try {
      await window.api.session.send(project.id, text)
    } catch (err) {
      append({ id: nextId(), role: 'notice', text: `Failed to send: ${String(err)}` })
      setRunning(false)
    }
  }, [input, running, project.id, append])

  const stop = useCallback(async () => {
    await window.api.session.stop(project.id)
    setRunning(false)
    append({ id: nextId(), role: 'notice', text: 'Stopped.' })
  }, [project.id, append])

  const addDroppedFiles = useCallback(
    async (files: FileList) => {
      const paths = Array.from(files)
        .map((f) => window.api.pathForFile(f))
        .filter(Boolean)
      if (paths.length === 0) return
      await window.api.projects.addAssets(project.id, paths)
      onAssetsChanged()
      append({
        id: nextId(),
        role: 'notice',
        text: `Added ${paths.length} asset${paths.length > 1 ? 's' : ''} to ./assets`
      })
    },
    [project.id, onAssetsChanged, append]
  )

  return (
    <div
      className={`chat ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files?.length) addDroppedFiles(e.dataTransfer.files)
      }}
    >
      <div className="messages" ref={scrollRef}>
        {items.length === 0 && (
          <div className="chat-intro">
            <h2>Let’s build “{project.name}”.</h2>
            <p className="muted">
              Describe the deck you want — topic, audience, and roughly how many
              slides. Drop images or documents anywhere to add them to the project.
            </p>
          </div>
        )}
        {items.map((item) => (
          <MessageItem key={item.id} item={item} />
        ))}
        {running && <div className="thinking">Claude is working…</div>}
      </div>

      {dragOver && <div className="drop-overlay">Drop files to add to ./assets</div>}

      <div className="composer">
        <textarea
          className="composer-input"
          placeholder="Message Claude about your presentation…"
          value={input}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        {running ? (
          <button className="btn stop" onClick={stop}>
            Stop
          </button>
        ) : (
          <button className="btn primary send" onClick={send} disabled={!input.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  )
}

function MessageItem({ item }: { item: ChatItem }): JSX.Element {
  if (item.role === 'notice') {
    return <div className="msg notice">{item.text}</div>
  }
  if (item.role === 'tool') {
    return (
      <div className={`msg tool ${item.isError ? 'tool-error' : ''}`}>
        <div className="tool-head">
          <span className="tool-badge">{item.name}</span>
          <span className="tool-summary">{item.summary}</span>
        </div>
        {item.result && <div className="tool-result">{item.result}</div>}
      </div>
    )
  }
  return (
    <div className={`msg ${item.role}`}>
      <div className="msg-role">{item.role === 'user' ? 'You' : 'Claude'}</div>
      <div className="msg-text">{item.text}</div>
    </div>
  )
}
