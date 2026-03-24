/**
 * API origin for same-host or split frontend (VITE_API_BASE).
 * Shared by api.ts and auth.ts to avoid circular imports.
 */
const apiOrigin = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return path
  return apiOrigin ? `${apiOrigin}${path}` : path
}
