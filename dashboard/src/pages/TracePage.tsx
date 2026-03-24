import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiGet, ApiError } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import type { TraceBundle } from '../types/api'

export function TracePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [manualId, setManualId] = useState('')
  const [loading, setLoading] = useState(false)
  const [bundle, setBundle] = useState<TraceBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<'timeline' | 'trace' | 'metrics' | null>('metrics')

  useEffect(() => {
    if (!id) {
      setBundle(null)
      setError(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setBundle(null)
      try {
        const data = (await apiGet(`/api/orchestration/traces/${encodeURIComponent(id)}`)) as TraceBundle
        if (!cancelled) setBundle(data)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof ApiError ? `${e.message} (${e.status})` : String(e)
        setError(msg)
        if (e instanceof ApiError && e.code === 'ts_orchestrator_disabled') {
          toast.error('TS orchestrator not configured on Go server')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id, toast])

  function goTrace() {
    const t = manualId.trim()
    if (!t) {
      toast.error('Enter a trace id')
      return
    }
    navigate(`/trace/${encodeURIComponent(t)}`)
  }

  if (!id) {
    return (
      <div className="page">
        <div className="page-shell__header">
          <h1>Trace viewer</h1>
          <p className="page-shell__desc">Load a trace by id (from Chat after a TS orchestration run).</p>
        </div>
        <div className="panel page-shell__body">
          <div className="form-field">
            <label htmlFor="tid">Trace id</label>
            <input
              id="tid"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="paste uuid"
            />
          </div>
          <button type="button" className="btn" onClick={goTrace}>
            Open trace
          </button>
          <p style={{ marginTop: 12 }}>
            <Link to="/chat">Back to Chat</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Trace viewer</h1>
        <p className="page-shell__desc mono-block" style={{ maxWidth: '100%' }}>
          {id}
        </p>
        <div className="btn-row">
          <Link to="/trace" className="btn btn--secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            New lookup
          </Link>
          <Link to="/chat" className="btn btn--secondary" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Chat
          </Link>
        </div>
      </div>

      {loading && <div className="skeleton skeleton--block" />}

      {error && (
        <div className="alert alert--err" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {bundle && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <section className="panel">
            <button
              type="button"
              className="btn btn--secondary"
              style={{ marginBottom: 8 }}
              onClick={() => setExpanded(expanded === 'metrics' ? null : 'metrics')}
            >
              metrics_summary {expanded === 'metrics' ? '▼' : '▶'}
            </button>
            {expanded === 'metrics' && (
              <pre className="mono-block">{JSON.stringify(bundle.metrics_summary ?? {}, null, 2)}</pre>
            )}
          </section>
          <section className="panel">
            <button
              type="button"
              className="btn btn--secondary"
              style={{ marginBottom: 8 }}
              onClick={() => setExpanded(expanded === 'timeline' ? null : 'timeline')}
            >
              timeline_rebuilt {expanded === 'timeline' ? '▼' : '▶'}
            </button>
            {expanded === 'timeline' && (
              <pre className="mono-block">{JSON.stringify(bundle.timeline_rebuilt ?? [], null, 2)}</pre>
            )}
          </section>
          <section className="panel">
            <button
              type="button"
              className="btn btn--secondary"
              style={{ marginBottom: 8 }}
              onClick={() => setExpanded(expanded === 'trace' ? null : 'trace')}
            >
              trace (raw) {expanded === 'trace' ? '▼' : '▶'}
            </button>
            {expanded === 'trace' && <pre className="mono-block">{JSON.stringify(bundle.trace ?? {}, null, 2)}</pre>}
          </section>
        </div>
      )}
    </div>
  )
}
