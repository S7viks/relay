import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchAuthSession } from '../lib/auth'
import { requestPasswordRecovery, signIn } from '../lib/authApi'
import { apiGet } from '../lib/api'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [authDisabled, setAuthDisabled] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMsg, setForgotMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const h = await apiGet('/health')
        const ad = !!(h && typeof h === 'object' && (h as { auth_disabled?: boolean }).auth_disabled)
        if (!cancelled) setAuthDisabled(ad)
        if (ad) {
          navigate('/chat', { replace: true })
          return
        }
        const s = await fetchAuthSession()
        if (!cancelled && s.authenticated) navigate('/chat', { replace: true })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/chat', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  async function onForgotSubmit() {
    setForgotMsg('')
    const em = forgotEmail.trim()
    if (!em) {
      setForgotMsg('Enter your email address')
      return
    }
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      await requestPasswordRecovery(em, redirectTo)
      setForgotMsg('If an account exists, a recovery email was sent. Check your inbox.')
    } catch (err) {
      setForgotMsg(err instanceof Error ? err.message : 'Request failed')
    }
  }

  return (
    <div className="auth-page auth-terminal">
      <div className="auth-container">
        <div className="auth-card">
          <div className="term-bar" aria-hidden="true">
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-title">gaiol://auth/signin</span>
          </div>
          <div className="auth-header">
            <h1>GAIOL Access Terminal</h1>
            <p>Authenticate to access AI model orchestration.</p>
          </div>
          <div className="term-screen" aria-hidden="true">
            <div className="line comment">session: unauthenticated</div>
            <div className="line">
              <span className="prompt" />
              <span className="out">gaiol auth signin --email &lt;email&gt;</span>
              <span className="blink">█</span>
            </div>
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="loginEmail">Email</label>
              <input
                id="loginEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label htmlFor="loginPassword">Password</label>
              <input
                id="loginPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>
            <div className="form-options">
              <button type="button" className="link-text link-button" onClick={() => setShowForgot((v) => !v)}>
                Forgot password?
              </button>
            </div>
            {showForgot && (
              <div className="form-group term-inline-box">
                <label htmlFor="forgotEmail">Enter your email to receive a reset link</label>
                <input
                  id="forgotEmail"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="your@email.com"
                />
                <div className="term-actions">
                  <button type="button" className="btn-primary" onClick={() => void onForgotSubmit()}>
                    Send reset link
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setShowForgot(false)}>
                    Cancel
                  </button>
                </div>
                {forgotMsg && <p className="term-message">{forgotMsg}</p>}
              </div>
            )}
            <button type="submit" className="btn-primary btn-full" disabled={loading || authDisabled}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <Link to="/signup" className="btn-secondary btn-full" style={{ textAlign: 'center', display: 'block' }}>
              Create new account (signup)
            </Link>
          </form>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    </div>
  )
}
