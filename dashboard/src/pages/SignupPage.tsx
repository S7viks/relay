import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchAuthSession, getAccessToken } from '../lib/auth'
import { signUp } from '../lib/authApi'
import { apiGet } from '../lib/api'

export function SignupPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [authDisabled, setAuthDisabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const h = await apiGet('/health')
        const ad = !!(h && typeof h === 'object' && (h as { auth_disabled?: boolean }).auth_disabled)
        if (!cancelled) setAuthDisabled(ad)
        if (ad) {
          navigate('/home', { replace: true })
          return
        }
        const s = await fetchAuthSession()
        if (!cancelled && s.authenticated) navigate('/home', { replace: true })
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
    setInfo('')
    if (password !== passwordConfirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      await signUp(email, password)
      if (!getAccessToken()) {
        setInfo('Check your email: confirm your account from the link we sent, then sign in.')
        return
      }
      navigate('/home', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setLoading(false)
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
            <span className="term-title">gaiol://auth/signup</span>
          </div>
          <div className="auth-header">
            <h1>Create account</h1>
            <p>Get your GAIOL API key and connect providers in the dashboard.</p>
          </div>
          <div className="term-screen" aria-hidden="true">
            <div className="line comment">new tenant registration</div>
            <div className="line">
              <span className="prompt" />
              <span className="out">gaiol auth signup --email &lt;email&gt;</span>
              <span className="blink">█</span>
            </div>
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="signupEmail">Email</label>
              <input
                id="signupEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label htmlFor="signupPassword">Password</label>
              <input
                id="signupPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label htmlFor="signupPasswordConfirm">Confirm password</label>
              <input
                id="signupPasswordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <p className="term-muted-small">
              By creating an account you agree to the <Link to="/terms">Terms of Service</Link>.
            </p>
            <button type="submit" className="btn-primary btn-full" disabled={loading || authDisabled}>
              {loading ? 'Creating…' : 'Create account'}
            </button>
            <div className="auth-divider">
              <span>or</span>
            </div>
            <Link to="/login" className="btn-secondary btn-full" style={{ textAlign: 'center', display: 'block' }}>
              Sign in instead
            </Link>
          </form>
          {error && <div className="error-message">{error}</div>}
          {info && <div className="term-message">{info}</div>}
        </div>
      </div>
    </div>
  )
}
