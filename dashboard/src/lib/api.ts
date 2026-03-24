/**
 * Same-origin requests; Vite dev server proxies /api, /v1, /health to Go (see vite.config.ts).
 */
const jsonHeaders = { 'Content-Type': 'application/json' } as const

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
  const res = await fetch(path, { credentials: 'include' })
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
  const res = await fetch(path, {
    method: 'PUT',
    credentials: 'include',
    headers: jsonHeaders,
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
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
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

export async function fetchHealth(): Promise<boolean> {
  try {
    const res = await fetch('/health', { credentials: 'include' })
    return res.ok
  } catch {
    return false
  }
}
