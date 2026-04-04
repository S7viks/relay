import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { updatePasswordWithRecoveryToken } from '../lib/authApi'

function parseHashParams(): Record<string, string> {
  const hash = window.location.hash.replace(/^#/, '')
  const params: Record<string, string> = {}
  for (const part of hash.split('&')) {
    const [k, v] = part.split('=')
    if (k && v != null) params[decodeURIComponent(k)] = decodeURIComponent(v)
  }
  return params
}

export function ResetPasswordPage() {
  const accessToken = useMemo(() => {
    const p = parseHashParams()
    return p.access_token || p['access_token'] || ''
  }, [])

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!accessToken) return
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [accessToken])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMsg('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      await updatePasswordWithRecoveryToken(accessToken, password)
      setMsg('Password updated. You can sign in with your new password.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  if (!accessToken) {
    return (
      <div className="auth-page auth-terminal">
        <div className="auth-container">
          <div className="auth-card">
            <div className="term-bar" aria-hidden="true">
              <span className="term-dot" />
              <span className="term-dot" />
              <span className="term-dot" />
              <span className="term-title">gaiol://auth/reset-password</span>
            </div>
            <div className="term-inline-box">
              <p className="term-message">Open the password reset link from your email to set a new password on this page.</p>
              <Link className="link-text" to="/login">
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page auth-terminal">
      <div className="auth-container">
        <div className="auth-card">
          <div className="term-bar" aria-hidden="true">
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-title">gaiol://auth/reset-password</span>
          </div>
          <div className="auth-header">
            <h1>Set new password</h1>
            <p>Complete the recovery flow to restore access.</p>
          </div>
          <div className="term-screen" aria-hidden="true">
            <div className="line comment">reset token: from email link</div>
            <div className="line">
              <span className="prompt" />
              <span className="out">gaiol auth update-password</span>
              <span className="blink">█</span>
            </div>
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="newPassword">New password</label>
              <input
                id="newPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="btn-primary btn-full" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
          {error && <div className="error-message">{error}</div>}
          {msg && <p className="term-message">{msg}</p>}
          <p style={{ marginTop: '1rem' }}>
            <Link className="link-text" to="/login">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
