import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, ApiError } from '../lib/api'
import type { PreferencesResponse } from '../types/api'

type QuickItem = {
  to: string
  title: string
  body: string
}

const QUICK: QuickItem[] = [
  {
    to: '/chat',
    title: 'Smart Chat',
    body: 'Single prompt, multi-model routing via the API. When the TS orchestrator is enabled, each run gets a trace id you can open in Trace Viewer.',
  },
  {
    to: '/reasoning',
    title: 'Reasoning (live)',
    body: 'Go reasoning engine with decomposition and WebSocket progress. Uses a Go session id — not the same as a TS orchestrator trace.',
  },
  {
    to: '/trace',
    title: 'Trace Viewer',
    body: 'Inspect TS orchestration traces (metrics, timeline, raw payload) when the proxy is configured.',
  },
  {
    to: '/trust',
    title: 'Trust heatmap',
    body: 'ABTC posteriors from the TS orchestrator after smart-query runs.',
  },
  {
    to: '/models',
    title: 'Models',
    body: 'Registered model catalog from the server.',
  },
  {
    to: '/onboarding',
    title: 'Setup & calibration',
    body: 'Provider keys, GAIOL API key, best-path demo, and optional ABTC calibration.',
  },
]

export function HomePage() {
  const [prefs, setPrefs] = useState<PreferencesResponse | null>(null)
  const [prefsError, setPrefsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const p = (await apiGet('/api/settings/preferences')) as PreferencesResponse
        if (!cancelled) {
          setPrefs(p)
          setPrefsError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setPrefs(null)
          setPrefsError(e instanceof ApiError ? e.message : String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Home</h1>
        <p className="page-shell__desc">
          GAIOL splits two execution paths: <strong>Smart Chat</strong> (HTTP smart query, TS traces when enabled) and{' '}
          <strong>Reasoning</strong> (Go engine + WebSocket). Use this page to orient and jump in.
        </p>
      </div>

      <div className="panel page-shell__body" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Saved defaults</h2>
        <p className="page-shell__desc" style={{ marginBottom: 12 }}>
          Values from <Link to="/settings">Settings</Link>. Chat pre-fills <strong>strategy</strong> from here when you
          open the Chat page. The smart-query API still receives whatever you send on each request.
        </p>
        {prefsError && (
          <p className="page-shell__desc" style={{ color: 'var(--text-secondary)' }}>
            Could not load preferences ({prefsError}). Sign in or check the API if you expected saved defaults.
          </p>
        )}
        {prefs && !prefsError && (
          <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.6 }}>
            <li>
              Strategy: <code className="mono-block" style={{ display: 'inline', padding: '2px 6px' }}>{prefs.strategy ?? 'balanced'}</code>
            </li>
            <li>
              Default model id:{' '}
              {prefs.default_model_id ? (
                <code className="mono-block" style={{ display: 'inline', padding: '2px 6px' }}>{prefs.default_model_id}</code>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>not set</span>
              )}
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: 8 }}>
                (stored for your account; smart query does not yet attach this to the TS orchestrator request)
              </span>
            </li>
          </ul>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {QUICK.map((q) => (
          <Link key={q.to} to={q.to} className="panel home-quick-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>{q.title}</h3>
            <p className="page-shell__desc" style={{ margin: 0 }}>
              {q.body}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
