import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiGet, ApiError } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import type { ModelRow, ModelsListResponse } from '../types/api'

export function ModelsPage() {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''

  const [models, setModels] = useState<ModelRow[]>([])
  const [filter, setFilter] = useState(initialQ)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setFilter(initialQ)
  }, [initialQ])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const data = (await apiGet('/api/models')) as ModelsListResponse
        if (!cancelled) setModels(Array.isArray(data.models) ? data.models : [])
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof ApiError ? e.message : String(e))
          setModels([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => {
      const hay = [
        m.id,
        m.display_name,
        m.model_name,
        m.provider,
        ...(m.tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [models, filter])

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Models</h1>
        <p className="page-shell__desc">Registry from GET /api/models. Cross-link from Trust uses query string.</p>
      </div>

      <div className="form-field panel">
        <label htmlFor="filter">Search</label>
        <input
          id="filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="id, provider, tag…"
        />
      </div>

      {loading && <div className="skeleton skeleton--block" />}

      {!loading && (
        <div className="table-wrap panel" style={{ marginTop: 12 }}>
          <p style={{ marginBottom: 8, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Showing {filtered.length} of {models.length}
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Display</th>
                <th>Provider</th>
                <th>Quality</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="mono-block" style={{ maxWidth: 200, fontSize: '0.7rem' }}>
                    {m.id}
                  </td>
                  <td>{m.display_name ?? m.model_name ?? '—'}</td>
                  <td>{m.provider ?? '—'}</td>
                  <td>{m.quality_score != null ? m.quality_score.toFixed(2) : '—'}</td>
                  <td>{(m.tags ?? []).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
