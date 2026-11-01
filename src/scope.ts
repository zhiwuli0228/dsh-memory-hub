import { MemoryError } from './errors.js'
import type { Scope, Visibility } from './types.js'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function isScopeId(value: string): boolean {
  return ID_PATTERN.test(value)
}

export function parseScope(value: string): Scope {
  if (value === 'global') return { level: 'global' }
  const [level, id] = value.split(':', 2)
  if ((level === 'domain' || level === 'project') && id !== undefined && isScopeId(id)) {
    return level === 'domain' ? { level: 'domain', id } : { level: 'project', workspaceId: id }
  }
  throw new MemoryError('INVALID_INPUT', `invalid scope "${value}" (expected global, domain:<id>, or project:<workspace-id>)`)
}

export function formatScope(scope: Scope): string {
  switch (scope.level) {
    case 'global':
      return 'global'
    case 'domain':
      return `domain:${scope.id}`
    case 'project':
      return `project:${scope.workspaceId}`
  }
}

export function visibilityFor(
  workspaceId: string | null,
  domains: readonly string[],
  coreWorkspaceIds: readonly string[] = [],
): Visibility {
  const projects = new Set<string>(coreWorkspaceIds)
  if (workspaceId !== null) projects.add(workspaceId)
  return { global: true, domains: new Set(domains), projects }
}

export function isScopeVisible(scope: Scope, visibility: Visibility): boolean {
  switch (scope.level) {
    case 'global':
      return visibility.global
    case 'domain':
      return visibility.domains.has(scope.id)
    case 'project':
      return visibility.projects.has(scope.workspaceId)
  }
}

export function scopeDescription(scope: Scope): string {
  switch (scope.level) {
    case 'global':
      return 'global'
    case 'domain':
      return `domain:${scope.id}`
    case 'project':
      return `project:${scope.workspaceId}`
  }
}
