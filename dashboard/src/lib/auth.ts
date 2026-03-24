import { apiUrl } from './apiBase'

/** Same keys as web/js/api.js (legacy login pages). */
export const ACCESS_TOKEN_KEY = 'gaiol_access_token'
export const REFRESH_TOKEN_KEY = 'gaiol_refresh_token'

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearAuthStorage(): void {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export type AuthSessionState = {
  authenticated: boolean
  email?: string
}

/**
 * GET /api/auth/session — uses Bearer if present. Clears storage on 401 (stale token).
 */
export async function fetchAuthSession(): Promise<AuthSessionState> {
  const token = getAccessToken()?.trim()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(apiUrl('/api/auth/session'), { credentials: 'include', headers })
  } catch {
    return { authenticated: false }
  }

  if (res.status === 401) {
    clearAuthStorage()
    return { authenticated: false }
  }

  if (!res.ok) {
    return { authenticated: false }
  }

  try {
    const data = (await res.json()) as {
      authenticated?: boolean
      user?: { email?: string } | null
    }
    const authenticated = !!data.authenticated && data.user != null
    const email = typeof data.user?.email === 'string' ? data.user.email : undefined
    return { authenticated, email }
  } catch {
    return { authenticated: false }
  }
}

/** POST /api/auth/signout (invalidates Supabase session) and clears local tokens. */
export async function signOut(): Promise<void> {
  const token = getAccessToken()?.trim()
  if (token) {
    try {
      await fetch(apiUrl('/api/auth/signout'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    } catch {
      /* still clear local */
    }
  }
  clearAuthStorage()
}

export function loginHref(): string {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/login`
}

export function signupHref(): string {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}/signup`
}

/** Persist tokens from POST /api/auth/signin or signup (same rules as web/js/api.js). */
export function applySignInTokens(data: unknown): void {
  if (!data || typeof data !== 'object') return
  const d = data as Record<string, unknown>
  const session = d.session as Record<string, unknown> | undefined
  const access =
    (typeof d.access_token === 'string' && d.access_token) ||
    (session && typeof session.access_token === 'string' && session.access_token) ||
    ''
  const refresh =
    (typeof d.refresh_token === 'string' && d.refresh_token) ||
    (session && typeof session.refresh_token === 'string' && session.refresh_token) ||
    ''
  try {
    if (access) localStorage.setItem(ACCESS_TOKEN_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  } catch {
    /* private mode */
  }
}
