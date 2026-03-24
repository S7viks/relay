import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, ApiError } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import type { TraceBundle, TraceIdsResponse } from '../types/api'

export function MetricsPage() {
  const toast = useToast()
  const [traceId, setTraceId] = useState('')
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null)
  const [ids, setIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const loadIds = useCallback(async () => {
    try {
      const data = (await apiGet('/api/orchestration/trace-ids?limit=30')) as TraceIdsResponse
      setIds(data.trace_ids ?? [])
    } catch {
      setIds([])
    }
  }, [])

  useEffect(() => {
    void loadIds()
  }, [loadIds])

  async function loadSummary() {
    const id = traceId.trim()
    if (!id) {
      toast.error('Enter trace id')
      return
    }
    setLoading(true)
    setSummary(null)
    try {
      const bundle = (await apiGet(`/api/orchestration/traces/${encodeURIComponent(id)}`)) as TraceBundle
      setSummary((bundle.metrics_summary as Record<string, unknown>) ?? {})
      toast.success('Loaded metrics_summary')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const numericRows = summary
    ? Object.entries(summary).filter(
        ([, v]) => typeof v === 'number' || (typeof v === 'object' && v !== null && !Array.isArray(v)),
      )
    : []

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Metrics</h1>
        <p className="page-shell__desc">
          Inspect <code>metrics_summary</code> for a trace. Recent trace ids load from{' '}
          <code>/api/orchestration/trace-ids</code> when TS is configured.
        </p>
      </div>

      <div className="panel page-shell__body">
        <div className="form-field">
          <label htmlFor="tid">Trace id</label>
          <input id="tid" value={traceId} onChange={(e) => setTraceId(e.target.value)} placeholder="uuid" />
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => void loadSummary()} disabled={loading}>
            {loading ? 'Loading…' : 'Load metrics'}
          </button>
          <button type="button" className="btn btn--secondary" onClick={() => void loadIds()}>
            Refresh id list
          </button>
        </div>
        {ids.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Recent: </span>
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                className="badge"
                style={{ cursor: 'pointer', marginRight: 6, marginTop: 4, border: 'none' }}
                onClick={() => setTraceId(id)}
              >
                {id.slice(0, 8)}…
              </button>
            ))}
          </div>
        )}
      </div>

      {summary && Object.keys(summary).length > 0 && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Summary</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {numericRows.map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="mono-block" style={{ maxHeight: 'none' }}>
                      {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer' }}>Raw JSON</summary>
            <pre className="mono-block" style={{ marginTop: 8 }}>
              {JSON.stringify(summary, null, 2)}
            </pre>
          </details>
          <p style={{ marginTop: 12 }}>
            <Link to={`/trace/${encodeURIComponent(traceId.trim())}`}>Open full trace</Link>
          </p>
        </div>
      )}
    </div>
  )
}
