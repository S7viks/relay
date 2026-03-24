import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchHealthBody } from '../lib/api'
import { fetchAuthSession, signOut as authSignOut } from '../lib/auth'

type AuthContextValue = {
  authLoading: boolean
  authDisabled: boolean
  authServiceDown: boolean
  sessionEmail: string | null
  refreshAuth: () => Promise<void>
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authLoading, setAuthLoading] = useState(true)
  const [authDisabled, setAuthDisabled] = useState(false)
  const [authServiceDown, setAuthServiceDown] = useState(false)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)

  const refreshAuth = useCallback(async () => {
    setAuthLoading(true)
    setAuthServiceDown(false)
    try {
      const h = await fetchHealthBody()
      if (!h.ok) {
        setAuthDisabled(false)
        setSessionEmail(null)
        setAuthServiceDown(true)
        return
      }
      setAuthDisabled(!!h.authDisabled)
      if (h.authDisabled) {
        setSessionEmail(null)
        return
      }
      const s = await fetchAuthSession()
      setSessionEmail(s.authenticated ? (s.email ?? 'Signed in') : null)
    } catch {
      setSessionEmail(null)
      setAuthServiceDown(true)
    } finally {
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    const onFocus = () => {
      void refreshAuth()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshAuth()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshAuth])

  const signOutUser = useCallback(async () => {
    await authSignOut()
    await refreshAuth()
  }, [refreshAuth])

  const value = useMemo(
    () => ({
      authLoading,
      authDisabled,
      authServiceDown,
      sessionEmail,
      refreshAuth,
      signOutUser,
    }),
    [authLoading, authDisabled, authServiceDown, sessionEmail, refreshAuth, signOutUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
