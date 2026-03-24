import { useCallback, useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import type { PreferencesResponse, ProviderKeyRow } from '../types/api'

const PROVIDER_OPTIONS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'huggingface', label: 'Hugging Face' },
] as const

export function SettingsPage() {
  const toast = useToast()
  const [prefs, setPrefs] = useState<PreferencesResponse | null>(null)
  const [strategy, setStrategy] = useState('balanced')
  const [defaultModelId, setDefaultModelId] = useState('')
  const [loading, setLoading] = useState(true)
  const [providerKeys, setProviderKeys] = useState<ProviderKeyRow[]>([])
  const [newProvider, setNewProvider] = useState<string>('openrouter')
  const [newApiKey, setNewApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [oneTimeGaiolKey, setOneTimeGaiolKey] = useState<string | null>(null)

  const loadProviderKeys = useCallback(async () => {
    const raw = await apiGet('/api/settings/provider-keys')
    setProviderKeys(Array.isArray(raw) ? (raw as ProviderKeyRow[]) : [])
  }, [])

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
        await loadProviderKeys()
      } catch (e) {
        if (!cancelled) toast.error(e instanceof ApiError ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toast, loadProviderKeys])

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

  async function addProviderKey() {
    const trimmed = newApiKey.trim()
    if (!trimmed) {
      toast.error('Paste an API key first')
      return
    }
    setSavingKey(true)
    setOneTimeGaiolKey(null)
    try {
      const data = (await apiPost('/api/settings/provider-keys', {
        provider: newProvider,
        api_key: trimmed,
      })) as Record<string, unknown>
      setNewApiKey('')
      toast.success('Provider key saved')
      if (typeof data.gaiol_api_key === 'string' && data.gaiol_api_key) {
        setOneTimeGaiolKey(data.gaiol_api_key)
        toast.info('A GAIOL API key was created — copy it from the yellow box below (shown once).')
      }
      await loadProviderKeys()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e))
    } finally {
      setSavingKey(false)
    }
  }

  async function removeProviderKey(provider: string) {
    try {
      await apiDelete(`/api/settings/provider-keys?provider=${encodeURIComponent(provider)}`)
      toast.success(`Removed ${provider}`)
      await loadProviderKeys()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e))
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy — select and copy manually')
    }
  }

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Settings</h1>
        <p className="page-shell__desc">
          Preferences and encrypted provider keys (auth + database). Keys are stored per tenant; only hints are shown
          after save. In local no-auth mode, use <code>.env</code> for providers instead.
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
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Model provider API keys</h2>
            <p className="page-shell__desc" style={{ marginBottom: 12 }}>
              Add keys your models use (OpenRouter, Gemini, Hugging Face). They are encrypted at rest; the server never
              returns the full secret after saving.
            </p>

            {oneTimeGaiolKey && (
              <div
                className="alert alert--warn"
                style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
              >
                <span style={{ flex: '1 1 200px' }}>
                  <strong>GAIOL API key (show once)</strong> — use as <code>Authorization: Bearer</code> for{' '}
                  <code>/v1/chat</code>:
                </span>
                <code className="mono-block" style={{ flex: '1 1 240px', wordBreak: 'break-all', fontSize: '0.8rem' }}>
                  {oneTimeGaiolKey}
                </code>
                <button type="button" className="btn" onClick={() => void copyText(oneTimeGaiolKey)}>
                  Copy
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => setOneTimeGaiolKey(null)}>
                  Dismiss
                </button>
              </div>
            )}

            <div className="form-field">
              <label htmlFor="pk-provider">Provider</label>
              <select
                id="pk-provider"
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value)}
                style={{ width: '100%', maxWidth: 320 }}
              >
                {PROVIDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="pk-key">API key</label>
              <input
                id="pk-key"
                type="password"
                autoComplete="off"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="Paste key (sent over HTTPS only)"
              />
            </div>
            <button
              type="button"
              className="btn"
              disabled={savingKey}
              onClick={() => void addProviderKey()}
            >
              {savingKey ? 'Saving…' : 'Save provider key'}
            </button>

            {providerKeys.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h3 style={{ fontSize: '0.9rem', marginBottom: 8 }}>Saved keys</h3>
                <table className="mono-block" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #333)' }}>
                      <th style={{ padding: '6px 8px' }}>Provider</th>
                      <th style={{ padding: '6px 8px' }}>Hint</th>
                      <th style={{ padding: '6px 8px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {providerKeys.map((row) => (
                      <tr key={row.id ?? row.provider} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                        <td style={{ padding: '6px 8px' }}>{row.provider}</td>
                        <td style={{ padding: '6px 8px' }}>{row.key_hint ?? '—'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn--secondary"
                            style={{ fontSize: '0.8rem' }}
                            onClick={() => row.provider && void removeProviderKey(row.provider)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
