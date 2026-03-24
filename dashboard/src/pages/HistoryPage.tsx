import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, ApiError } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import { useAppStore } from '../store'

export function HistoryPage() {
  const toast = useToast()
  const localHistory = useAppStore((s) => s.queryHistory)
  const [activity, setActivity] = useState<unknown[]>([])
  const [billing, setBilling] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [act, bill] = await Promise.all([
          apiGet('/api/activity?limit=50').catch(() => ({ activity: [] })),
          apiGet('/api/billing/history').catch(() => ({ history: [] })),
        ])
        if (!cancelled) {
          setActivity((act as { activity?: unknown[] }).activity ?? [])
          setBilling((bill as { history?: unknown[] }).history ?? [])
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof ApiError ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>History</h1>
        <p className="page-shell__desc">
          Local chat prompts (this browser), tenant activity, and billing history when APIs are available.
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>This session (Chat)</h2>
        {localHistory.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No entries yet. Send a message on Chat.</p>
        ) : (
          <ul style={{ listStyle: 'none' }}>
            {localHistory.map((h) => (
              <li key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {new Date(h.timestamp).toLocaleString()}
                </span>
                <div>{h.query}</div>
              </li>
            ))}
          </ul>
        )}
        <p style={{ marginTop: 8 }}>
          <Link to="/chat">Open Chat</Link>
        </p>
      </div>

      {loading && <div className="skeleton skeleton--line" />}

      {!loading && (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Activity (tenant)</h2>
            <pre className="mono-block" style={{ maxHeight: 240 }}>
              {JSON.stringify(activity, null, 2)}
            </pre>
          </div>
          <div className="panel">
            <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Billing history</h2>
            <pre className="mono-block" style={{ maxHeight: 240 }}>
              {JSON.stringify(billing, null, 2)}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
