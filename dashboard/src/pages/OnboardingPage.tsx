import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ProviderKeyRow, SmartQueryResponse, TrustListResponse } from '../types/api'
import { apiGet, apiPost, apiUrl, ApiError, fetchHealthBody } from '../lib/api'
import { fetchAuthSession, loginHref } from '../lib/auth'
import { useToast } from '../components/ui/Toast'

const PROVIDER_OPTIONS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'huggingface', label: 'Hugging Face' },
] as const

type GaiolKeyRow = {
  id?: string
  name?: string
  created_at?: string
  last_used_at?: string | null
}

function trustMean(d: { alpha: number; beta: number }): number {
  const s = d.alpha + d.beta
  if (s <= 0) return 0.5
  return d.alpha / s
}

export function OnboardingPage() {
  const toast = useToast()
  const [authDisabled, setAuthDisabled] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  const [providerKeys, setProviderKeys] = useState<ProviderKeyRow[]>([])
  const [gaiolKeys, setGaiolKeys] = useState<GaiolKeyRow[]>([])

  const [providerLoading, setProviderLoading] = useState(false)
  const [providerSaveError, setProviderSaveError] = useState<string | null>(null)
  const [newProvider, setNewProvider] = useState<string>('openrouter')
  const [newApiKey, setNewApiKey] = useState<string>('')

  const [ensureLoading, setEnsureLoading] = useState(false)
  const [gaiolKeyCreated, setGaiolKeyCreated] = useState<boolean | null>(null)
  const [gaiolKeySecret, setGaiolKeySecret] = useState<string | null>(null)
  const [gaiolKeyManual, setGaiolKeyManual] = useState<string>('')

  const effectiveGaiolKey = useMemo(() => {
    const manual = gaiolKeyManual.trim()
    return gaiolKeySecret?.trim() ? gaiolKeySecret.trim() : manual ? manual : null
  }, [gaiolKeyManual, gaiolKeySecret])

  const [bestPathRunning, setBestPathRunning] = useState(false)
  const [bestPathAnswer, setBestPathAnswer] = useState<string | null>(null)
  const [bestPathCost, setBestPathCost] = useState<number | null>(null)

  const [abtcRunning, setAbtcRunning] = useState(false)
  const [abtcError, setAbtcError] = useState<string | null>(null)
  const [abtcTraceId, setAbtcTraceId] = useState<string | null>(null)
  const [trustRows, setTrustRows] = useState<TrustListResponse['records']>([])

  const [domainFilter, setDomainFilter] = useState<string>('')

  const [step, setStep] = useState<number>(0)

  const loadProviderKeys = useCallback(async () => {
    const raw = await apiGet('/api/settings/provider-keys')
    const list = Array.isArray(raw) ? (raw as ProviderKeyRow[]) : []
    setProviderKeys(list)
    return list
  }, [])

  const loadGaiolKeys = useCallback(async () => {
    const raw = await apiGet('/api/gaiol-keys')
    const list = Array.isArray(raw) ? (raw as GaiolKeyRow[]) : []
    setGaiolKeys(list)
    return list
  }, [])

  const refreshAll = useCallback(async () => {
    await loadProviderKeys()
    await loadGaiolKeys()
  }, [loadGaiolKeys, loadProviderKeys])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setAuthLoading(true)
      setAuthDisabled(false)
      setAuthenticated(false)
      try {
        const h = await fetchHealthBody()
        if (cancelled) return
        setAuthDisabled(!!h.authDisabled)

        if (h.authDisabled) {
          setAuthenticated(false)
          setProviderKeys([])
          setGaiolKeys([])
          setStep(0)
          return
        }

        const s = await fetchAuthSession()
        if (cancelled) return
        setAuthenticated(!!s.authenticated)

        if (!s.authenticated) return
        await refreshAll()
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof ApiError ? e.message : String(e))
        }
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchHealthBody, refreshAll, toast])

  useEffect(() => {
    if (authDisabled || !authenticated) return
    // After provider keys exist, try to auto-provision a GAIOL key and reveal it only on first creation.
    if (providerKeys.length === 0) return
    if (gaiolKeyCreated !== null) return

    let cancelled = false
    ;(async () => {
      setEnsureLoading(true)
      setProviderSaveError(null)
      try {
        const data = (await apiPost('/api/settings/gaiol-key/ensure', {})) as {
          gaiol_api_key_created?: boolean
          gaiol_api_key?: string
          gaiol_api_key_message?: string
          gaiol_api_key_hint?: string
        }
        if (cancelled) return
        const created = !!data.gaiol_api_key_created
        setGaiolKeyCreated(created)
        if (typeof data.gaiol_api_key === 'string' && data.gaiol_api_key) {
          setGaiolKeySecret(data.gaiol_api_key)
        } else {
          setGaiolKeySecret(null)
        }

        if (!created) {
          toast.info(
            'A GAIOL key already exists for your tenant. The secret cannot be shown again; paste it manually if you have it.',
          )
        }
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof ApiError ? e.message : String(e)
          setProviderSaveError(msg)
          toast.error(msg)
        }
      } finally {
        if (!cancelled) setEnsureLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authenticated, authDisabled, gaiolKeyCreated, providerKeys.length, toast])

  useEffect(() => {
    // Step auto-advance based on readiness.
    if (authDisabled) return
    if (!authenticated) {
      setStep(0)
      return
    }
    if (providerKeys.length === 0) {
      setStep(0)
      return
    }
    if (gaiolKeyCreated === null || ensureLoading) return
    if (!effectiveGaiolKey) {
      setStep(1)
      return
    }
    if (bestPathAnswer === null) {
      setStep(2)
      return
    }
    setStep(3)
  }, [authDisabled, authenticated, bestPathAnswer, effectiveGaiolKey, ensureLoading, providerKeys.length, gaiolKeyCreated])

  async function addProviderKey() {
    setProviderSaveError(null)
    const trimmed = newApiKey.trim()
    if (!trimmed) {
      toast.error('Paste an API key first')
      return
    }
    setProviderLoading(true)
    try {
      const data = (await apiPost('/api/settings/provider-keys', {
        provider: newProvider,
        api_key: trimmed,
      })) as Record<string, unknown>

      setNewApiKey('')
      await refreshAll()

      if (typeof data.gaiol_api_key_created === 'boolean' && data.gaiol_api_key_created) {
        if (typeof data.gaiol_api_key === 'string' && data.gaiol_api_key) {
          setGaiolKeyCreated(true)
          setGaiolKeySecret(data.gaiol_api_key)
        }
      }

      toast.success('Provider key saved')
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e)
      setProviderSaveError(msg)
      toast.error(msg)
    } finally {
      setProviderLoading(false)
    }
  }

  async function runBestPathDemo() {
    if (!effectiveGaiolKey) {
      toast.error('Add your GAIOL key (auto-provisioned or pasted manually) first')
      return
    }
    setBestPathRunning(true)
    setBestPathAnswer(null)
    setBestPathCost(null)
    try {
      const res = await fetch(apiUrl('/v1/chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveGaiolKey}`,
        },
        body: JSON.stringify({
          prompt: 'Calibrate: explain ABTC + how it adapts model trust over repeated tasks. Keep it concise.',
          strategy: 'balanced',
          max_tokens: 700,
          temperature: 0.5,
        }),
      })

      const text = await res.text()
      let data: any = null
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = text
        }
      }

      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || text || res.statusText
        throw new Error(msg)
      }

      const answer = typeof data.result === 'string' ? data.result : ''
      setBestPathAnswer(answer)
      setBestPathCost(typeof data.cost === 'number' ? data.cost : null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(msg)
    } finally {
      setBestPathRunning(false)
    }
  }

  async function runAbtcCalibration() {
    setAbtcRunning(true)
    setAbtcError(null)
    setAbtcTraceId(null)
    setTrustRows([])

    try {
      // 1) Run a smart query that delegates to TS ABTC (unless strategy is overridden to go_reasoning).
      const calibrationPrompt = 'Calibrate ABTC: propose a short plan for improving model reliability using trust-weighted consensus.'
      const data = (await apiPost('/api/query/smart', {
        prompt: calibrationPrompt,
        strategy: 'balanced',
        task: 'reasoning',
        max_tokens: 450,
        temperature: 0.4,
      })) as SmartQueryResponse & {
        orchestration?: { trace_id?: string; trust_updates_count?: number }
        metadata?: { trace_id?: string; session_id?: string }
      }

      const tid = data.metadata?.trace_id ?? data.orchestration?.trace_id ?? null
      setAbtcTraceId(tid)

      // 2) Refresh trust snapshot
      const trust = (await apiGet(`/api/orchestration/trust${domainFilter.trim() ? `?domain=${encodeURIComponent(domainFilter.trim())}` : ''}`)) as TrustListResponse & {
        // Some orchestrator snapshots call the list key `records` by contract.
        records?: TrustListResponse['records']
      }
      setTrustRows(Array.isArray(trust.records) ? trust.records : [])
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
      setAbtcError(msg)
      toast.error(msg)
    } finally {
      setAbtcRunning(false)
    }
  }

  if (authLoading) return <div className="page"><div className="skeleton skeleton--block" /></div>

  if (authDisabled) {
    return (
      <div className="page">
        <div className="page-shell__header">
          <h1>Onboarding</h1>
          <p className="page-shell__desc">
            Server is running in <code>auth_disabled</code> mode. This build does not allow interactive provider key entry via the UI.
            Configure provider keys via environment variables and restart the service.
          </p>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="page">
        <div className="page-shell__header">
          <h1>Onboarding</h1>
          <p className="page-shell__desc">
            Sign in first. After authentication, you can enter your model provider keys and receive a GAIOL API key.
          </p>
        </div>
        <div className="panel page-shell__body" style={{ marginTop: 16 }}>
          <a className="btn" href={loginHref()}>
            Sign in
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Onboarding: Auth, Keys, Best Path, ABTC</h1>
        <p className="page-shell__desc">
          This flow provisions encrypted provider keys, generates a one-time tenant <code>gaiol_api_key</code>, then runs the orchestration in the backend
          to produce best-path output across multiple models. If TS ABTC is enabled, it also populates the ABTC trust snapshot.
        </p>
      </div>

      <div className="alert alert--warn" style={{ marginBottom: 16 }}>
        ABTC runs via the TS orchestrator. If your trust snapshot is empty after calibration, check TS orchestrator config and/or ensure TS model provider keys
        are configured on the server. Your provider keys entered here always power the Go inference path used by <code>/v1/chat</code>.
      </div>

      <div className="panel page-shell__body">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className="badge">Step 1: Provider keys</span>
          <span className="badge">Step 2: GAIOL key</span>
          <span className="badge">Step 3: Best-path demo</span>
          <span className="badge">Step 4: ABTC calibration</span>
        </div>

        {providerSaveError && (
          <div className="alert alert--err" style={{ marginBottom: 16 }}>
            {providerSaveError}
          </div>
        )}

        {step === 0 && (
          <section>
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>1) Add model provider keys</h2>
            <p className="page-shell__desc" style={{ marginBottom: 12 }}>
              These keys are encrypted server-side per tenant and used to build the model registry for inference.
            </p>

            <div className="form-field">
              <label htmlFor="pk-provider">Provider</label>
              <select
                id="pk-provider"
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value)}
                style={{ width: '100%', maxWidth: 320 }}
                disabled={providerLoading}
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
                placeholder="Paste key"
                disabled={providerLoading}
              />
            </div>

            <button type="button" className="btn" disabled={providerLoading} onClick={() => void addProviderKey()}>
              {providerLoading ? 'Saving…' : 'Save provider key'}
            </button>

            <div style={{ marginTop: 20 }}>
              <h3 style={{ fontSize: '0.9rem', marginBottom: 8 }}>Saved keys</h3>
              {providerKeys.length === 0 ? (
                <p className="page-shell__desc" style={{ color: 'var(--text-secondary)' }}>
                  No provider keys saved yet.
                </p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerKeys.map((row) => (
                      <tr key={row.id ?? row.provider}>
                        <td>{row.provider}</td>
                        <td>{row.key_hint ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>2) Get your one-time GAIOL API key</h2>
            <p className="page-shell__desc" style={{ marginBottom: 12 }}>
              The server generates a tenant <code>gaiol_api_key</code> and can reveal it only when creating it for the first time.
              If a key already exists, paste it manually to continue.
            </p>

            <div className="panel" style={{ background: 'transparent', padding: 0, marginBottom: 16 }}>
              {ensureLoading ? (
                <div className="skeleton skeleton--block" />
              ) : gaiolKeySecret ? (
                <div className="alert alert--warn" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: '1 1 260px' }}>
                    <strong>GAIOL API key</strong> (copy now): <code>{gaiolKeySecret}</code>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(gaiolKeySecret)
                        toast.success('Copied')
                      } catch {
                        toast.error('Could not copy')
                      }
                    }}
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <div className="alert alert--warn">
                  A GAIOL key already exists for your tenant, so the secret can’t be shown again. Paste your key below.
                </div>
              )}
            </div>

            {!gaiolKeySecret && (
              <>
                <div className="form-field">
                  <label htmlFor="manual-gaiol">GAIOL key</label>
                  <input
                    id="manual-gaiol"
                    type="password"
                    autoComplete="off"
                    value={gaiolKeyManual}
                    onChange={(e) => setGaiolKeyManual(e.target.value)}
                    placeholder="Paste your existing GAIOL API key"
                  />
                </div>
              </>
            )}

            {gaiolKeys.length > 0 && (
              <p className="page-shell__desc" style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
                Tenant has {gaiolKeys.length} GAIOL key(s) saved.
              </p>
            )}
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>3) Run best-path demo using /v1/chat</h2>
            <p className="page-shell__desc" style={{ marginBottom: 12 }}>
              The backend runs routing + scoring across your available models and returns the chosen best output.
            </p>

            <button type="button" className="btn" disabled={bestPathRunning} onClick={() => void runBestPathDemo()}>
              {bestPathRunning ? 'Running…' : 'Run demo'}
            </button>

            {bestPathAnswer && (
              <div className="panel" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>Best-path answer</h3>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{bestPathAnswer}</div>
                {bestPathCost !== null && (
                  <p className="page-shell__desc" style={{ marginTop: 12, color: 'var(--text-secondary)' }}>
                    Cost: {bestPathCost}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>4) Run ABTC calibration (TS orchestrator)</h2>
            <p className="page-shell__desc" style={{ marginBottom: 12 }}>
              If TS ABTC is enabled, this run updates the trust posterior and populates the Trust Heatmap.
            </p>

            <button type="button" className="btn" disabled={abtcRunning} onClick={() => void runAbtcCalibration()}>
              {abtcRunning ? 'Calibrating…' : 'Run ABTC calibration'}
            </button>

            {abtcError && (
              <div className="alert alert--err" style={{ marginTop: 16 }}>
                {abtcError}
              </div>
            )}

            {abtcTraceId && (
              <p className="page-shell__desc" style={{ marginTop: 12 }}>
                Trace id: <code>{abtcTraceId}</code> (open Trace Viewer).
              </p>
            )}

            {trustRows.length > 0 && (
              <div className="panel" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>Trust snapshot (ABTC)</h3>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Mean trust</th>
                      <th>α / β</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trustRows.slice(0, 12).map((r) => (
                      <tr key={`${r.modelId}-${r.domain}-${r.updatedAt}`}>
                        <td>{r.modelId}</td>
                        <td>{trustMean(r.distribution).toFixed(3)}</td>
                        <td>
                          {r.distribution.alpha.toFixed(2)} / {r.distribution.beta.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ marginTop: 12 }}>
                  <Link to="/trust">Open full Trust Heatmap</Link>
                </p>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <label htmlFor="domain-filter" className="page-shell__desc">
                Optional domain filter for trust view
              </label>
              <div className="form-field">
                <input
                  id="domain-filter"
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                  placeholder="e.g. general"
                />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

