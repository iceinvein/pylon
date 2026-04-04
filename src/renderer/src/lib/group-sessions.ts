// src/renderer/src/lib/group-sessions.ts
import type { StoredSession } from './resume-session'

export type ProjectGroup = {
  projectPath: string
  projectName: string
  sessions: StoredSession[]
  latestUpdate: number
}

export function groupByProject(sessions: StoredSession[]): ProjectGroup[] {
  const map = new Map<string, StoredSession[]>()

  for (const session of sessions) {
    const key = session.original_cwd ?? session.cwd
    const existing = map.get(key)
    if (existing) {
      existing.push(session)
    } else {
      map.set(key, [session])
    }
  }

  const groups: ProjectGroup[] = []
  for (const [projectPath, projectSessions] of map) {
    projectSessions.sort((a, b) => b.updated_at - a.updated_at)
    groups.push({
      projectPath,
      projectName: projectPath.split('/').pop() || projectPath,
      sessions: projectSessions,
      latestUpdate: projectSessions[0].updated_at,
    })
  }

  groups.sort((a, b) => b.latestUpdate - a.latestUpdate)
  return groups
}
