import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet, ApiError } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import type { TrustListResponse, TrustRecord } from '../types/api'

function trustMean(d: TrustRecord['distribution']): number {
  const s = d.alpha + d.beta
  if (s <= 0) return 0.5
  return d.alpha / s
}

export function TrustPage() {
  const toast = useToast()
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TrustListResponse | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = domain.trim() ? `?domain=${encodeURIComponent(domain.trim())}` : ''
      const res = (await apiGet(`/api/orchestration/trust${q}`)) as TrustListResponse
      setData(res)
    } catch (e) {
      setData(null)
      const msg = e instanceof ApiError ? e.message : String(e)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [domain, toast])

  useEffect(() => {
    void load()
    // Initial fetch only; use Refresh after changing domain filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Trust (ABTC)</h1>
        <p className="page-shell__desc">
          Read-only snapshot from the TS orchestrator via <code>/api/orchestration/trust</code>. Requires TS URL on
          Go.
        </p>
      </div>

      <div className="panel page-shell__body">
        <div className="form-field">
          <label htmlFor="domain">Filter by domain (optional)</label>
          <input
            id="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. general"
          />
        </div>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {data && (
        <div className="table-wrap panel" style={{ marginTop: 16 }}>
          <p className="badge">{data.count} records</p>
          {data.domain && <span className="badge">domain={data.domain}</span>}
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Domain</th>
                <th>Mean trust</th>
                <th>α / β</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.records?.length ? (
                data.records.map((r) => (
                  <tr key={`${r.modelId}-${r.domain}`}>
                    <td>
                      <Link to={`/models?q=${encodeURIComponent(r.modelId)}`}>{r.modelId}</Link>
                    </td>
                    <td>{r.domain}</td>
                    <td>{trustMean(r.distribution).toFixed(3)}</td>
                    <td>
                      {r.distribution.alpha.toFixed(2)} / {r.distribution.beta.toFixed(2)}
                    </td>
                    <td>{r.updatedAt}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ color: 'var(--text-secondary)' }}>
                    No trust rows yet. Run a smart query with TS orchestration (ABTC) to populate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
