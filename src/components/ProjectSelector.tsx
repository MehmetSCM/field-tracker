import { useEffect, useState } from 'react'
import { setCurrentProject } from '../lib/currentProject'
import { fetchProjects, type ProjectOption } from '../lib/supabase/milling'
import { useCurrentProject } from '../lib/useCurrentProject'
import './ProjectSelector.css'

/**
 * Always-visible current-project indicator, next to the profile pill.
 * Project context is meant to be a deliberate, infrequent choice ("projects
 * act in their own habitat"), not a per-screen dropdown — so unlike
 * ProfileSelector this has no warning banner or "switching" distinction,
 * just a small pill that expands into a picker on an explicit tap and
 * collapses again once a project is confirmed. Every project-scoped screen
 * (Dashboard, Tracker, Milling) reads the result via useCurrentProject
 * rather than each keeping its own picker.
 */
export function ProjectSelector() {
  const currentProject = useCurrentProject()
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Failed to load projects.'))
  }, [])

  function handleConfirm() {
    const chosen = projects.find((p) => p.id === selectedId)
    if (!chosen) return
    setCurrentProject(chosen)
    setSelectedId('')
    setExpanded(false)
  }

  if (!expanded) {
    return (
      <button type="button" className="project-selector-summary" onClick={() => setExpanded(true)}>
        <span>{currentProject ? currentProject.contractNumber : 'No project'}</span>
        <span className="project-selector-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
    )
  }

  return (
    <div className="project-selector">
      <label>
        <span>Project</span>
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">Select project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.contractNumber} — {p.name}
            </option>
          ))}
        </select>
      </label>
      {loadError && <p className="project-selector-error">{loadError}</p>}
      <div className="project-selector-actions">
        <button type="button" onClick={() => setExpanded(false)}>
          Cancel
        </button>
        <button type="button" onClick={handleConfirm} disabled={!selectedId}>
          Confirm
        </button>
      </div>
    </div>
  )
}
