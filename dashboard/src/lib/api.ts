/**
 * Relative paths: Vite dev server proxies /api, /v1, /health to Go (vite.config.ts).
 * Production (e.g. Vercel static): set VITE_API_BASE=https://your-api.example.com at build time.
 */
import { getAccessToken } from './auth'
import { apiUrl } from './apiBase'

export { apiUrl } from './apiBase'

const jsonHeaders = { 'Content-Type': 'application/json' } as const

function authHeaders(base: Record<string, string>): Record<string, string> {
  try {
    const t = getAccessToken()?.trim()
    if (t) return { ...base, Authorization: `Bearer ${t}` }
  } catch {
    /* private mode / SSR */
  }
  return base
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: authHeaders({}),
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const o = data as Record<string, unknown> | null
    const msg =
      (o && typeof o.error === 'string' && o.error) ||
      (o && typeof o.message === 'string' && o.message) ||
      res.statusText
    const code = o && typeof o.code === 'string' ? o.code : undefined
    throw new ApiError(msg, res.status, code)
  }
  return data
}

export async function apiPut(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(apiUrl(path), {
    method: 'PUT',
    credentials: 'include',
    headers: authHeaders({ ...jsonHeaders }),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const o = data as Record<string, unknown> | null
    const msg =
      (o && typeof o.error === 'string' && o.error) ||
      (o && typeof o.message === 'string' && o.message) ||
      res.statusText
    const code = o && typeof o.code === 'string' ? o.code : undefined
    throw new ApiError(msg, res.status, code)
  }
  return data
}

export async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders({ ...jsonHeaders }),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = text
    }
  }
  if (!res.ok) {
    const o = data as Record<string, unknown> | null
    const msg =
      (o && typeof o.error === 'string' && o.error) ||
      (o && typeof o.message === 'string' && o.message) ||
      res.statusText
    const code = o && typeof o.code === 'string' ? o.code : undefined
    throw new ApiError(msg, res.status, code)
  }
  return data
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(apiUrl(path), {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders({}),
  })
  if (res.status === 204 || res.status === 200) return
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = text
    }
  }
  const o = data as Record<string, unknown> | null
  const msg =
    (o && typeof o.error === 'string' && o.error) ||
    (o && typeof o.message === 'string' && o.message) ||
    text ||
    res.statusText
  const code = o && typeof o.code === 'string' ? o.code : undefined
  throw new ApiError(msg, res.status, code)
}

export async function fetchHealth(): Promise<boolean> {
  try {
    const res = await fetch(apiUrl('/health'), { credentials: 'include' })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchHealthBody(): Promise<{ ok: boolean; authDisabled: boolean }> {
  try {
    const res = await fetch(apiUrl('/health'), { credentials: 'include' })
    if (!res.ok) return { ok: false, authDisabled: false }
    const data = (await res.json()) as { auth_disabled?: boolean }
    return { ok: true, authDisabled: !!data.auth_disabled }
  } catch {
    return { ok: false, authDisabled: false }
  }
}
