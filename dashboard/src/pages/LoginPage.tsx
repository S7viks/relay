import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiUrl } from '../lib/apiBase'
import { applySignInTokens, getAccessToken, signupHref } from '../lib/auth'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/ui/Toast'

export function LoginPage() {
  const navigate = useNavigate()
  const { refreshAuth, authDisabled } = useAuth()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (authDisabled) {
      toast.info('Server has sign-in disabled — you can go to Chat without logging in.')
    }
  }, [authDisabled, toast])

  useEffect(() => {
    if (getAccessToken()?.trim()) {
      void refreshAuth().then(() => navigate('/chat', { replace: true }))
    }
  }, [navigate, refreshAuth])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (authDisabled) {
      navigate('/chat', { replace: true })
      return
    }
    setBusy(true)
    try {
      const res = await fetch(apiUrl('/api/auth/signin'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const text = await res.text()
      let body: Record<string, unknown> = {}
      if (text) {
        try {
          body = JSON.parse(text) as Record<string, unknown>
        } catch {
          body = { error: text }
        }
      }
      if (!res.ok) {
        const err =
          (typeof body.error === 'string' && body.error) ||
          (typeof body.message === 'string' && body.message) ||
          text ||
          `Sign in failed (${res.status})`
        throw new Error(err)
      }
      applySignInTokens(body)
      if (!getAccessToken()?.trim()) {
        throw new Error('No access token in response — confirm your email if signup requires it.')
      }
      await refreshAuth()
      toast.success('Signed in')
      navigate('/chat', { replace: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-page__card page">
        <h1 className="auth-page__title">Sign in</h1>
        <p className="page-shell__desc" style={{ marginBottom: 20 }}>
          Sign in with your GAIOL account (Supabase). Your session is stored in this browser only.
        </p>
        <form onSubmit={(e) => void onSubmit(e)}>
          <div className="form-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
            />
          </div>
          <div className="btn-row">
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <Link to="/chat" className="btn btn--secondary" style={{ textAlign: 'center', lineHeight: 'inherit' }}>
              Back to app
            </Link>
          </div>
        </form>
        <p style={{ marginTop: 20, fontSize: '0.85rem' }}>
          No account?{' '}
          <a className="topbar__auth-link" href={signupHref()}>
            Create account
          </a>
        </p>
      </div>
    </div>
  )
}
