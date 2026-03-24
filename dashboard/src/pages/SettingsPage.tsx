import { useEffect, useState } from 'react'
import { apiGet, apiPut, ApiError } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import type { PreferencesResponse } from '../types/api'

export function SettingsPage() {
  const toast = useToast()
  const [prefs, setPrefs] = useState<PreferencesResponse | null>(null)
  const [strategy, setStrategy] = useState('balanced')
  const [defaultModelId, setDefaultModelId] = useState('')
  const [loading, setLoading] = useState(true)
  const [keysJson, setKeysJson] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const p = (await apiGet('/api/settings/preferences')) as PreferencesResponse
        if (!cancelled) {
          setPrefs(p)
          setStrategy(p.strategy ?? 'balanced')
          setDefaultModelId(p.default_model_id ?? '')
        }
        const keys = await apiGet('/api/settings/provider-keys')
        if (!cancelled) setKeysJson(JSON.stringify(keys, null, 2))
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

  async function savePrefs() {
    try {
      await apiPut('/api/settings/preferences', {
        strategy,
        default_model_id: defaultModelId,
        budget_limit: prefs?.budget_limit ?? null,
      })
      toast.success('Preferences saved')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e))
    }
  }

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Settings</h1>
        <p className="page-shell__desc">
          Tenant preferences and provider keys (when auth + DB are enabled). In local no-auth mode, PUT may succeed
          as a stub; keys stay empty—use .env for providers.
        </p>
      </div>

      <div className="alert alert--warn" style={{ marginBottom: 16 }}>
        Orchestration beam width, consensus mode, and TS delegation are controlled by server environment variables (
        <code>GAIOL_TS_*</code>), not this UI. See docs/FEATURE-FLAGS.md.
      </div>

      {loading && <div className="skeleton skeleton--block" />}

      {!loading && (
        <>
          <div className="panel page-shell__body">
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Preferences</h2>
            <div className="form-field">
              <label htmlFor="strategy">Strategy</label>
              <input
                id="strategy"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                placeholder="balanced"
              />
            </div>
            <div className="form-field">
              <label htmlFor="dm">Default model id</label>
              <input
                id="dm"
                value={defaultModelId}
                onChange={(e) => setDefaultModelId(e.target.value)}
                placeholder="openrouter:…"
              />
            </div>
            <button type="button" className="btn" onClick={() => void savePrefs()}>
              Save preferences
            </button>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Provider keys (read-only view)</h2>
            <pre className="mono-block">{keysJson || '[]'}</pre>
          </div>
        </>
      )}
    </div>
  )
}
