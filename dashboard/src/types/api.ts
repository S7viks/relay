export interface ModelRow {
  id: string
  provider?: string
  model_name?: string
  display_name?: string
  cost_per_token?: number
  capabilities?: Record<string, boolean>
  quality_score?: number
  context_window?: number
  max_tokens?: number
  tags?: string[]
}

export interface ModelsListResponse {
  models?: ModelRow[]
  count?: number
}

export interface SmartQueryResponse {
  response?: string
  result?: { data?: string }
  metadata?: {
    session_id?: string
    trace_id?: string
    engine?: string
    steps_executed?: number
    cost_info?: { total_cost?: number }
  }
  orchestration?: {
    trace_id?: string
    schema_version?: string
    trust_updates_count?: number
    consensus_mode?: string
    beam_width?: number
  }
  cost?: number
  latency_ms?: number
  strategy?: string
}

export interface TrustRecord {
  modelId: string
  domain: string
  distribution: { alpha: number; beta: number }
  updatedAt: string
}

export interface TrustListResponse {
  records: TrustRecord[]
  count: number
  domain: string | null
}

export interface TraceIdsResponse {
  trace_ids: string[]
  count: number
}

export interface TraceBundle {
  trace?: unknown
  timeline_rebuilt?: unknown
  metrics_summary?: Record<string, unknown>
}

export interface ActivityEntry {
  id?: string
  action?: string
  created_at?: string
  metadata?: Record<string, unknown>
}

export interface ActivityResponse {
  activity?: ActivityEntry[]
}

export interface PreferencesResponse {
  budget_limit?: number | null
  default_model_id?: string
  strategy?: string
}

/** Matches keys.ProviderKeyRow from GET /api/settings/provider-keys */
export interface ProviderKeyRow {
  id?: string
  provider?: string
  key_hint?: string
  is_active?: boolean
  created_at?: string
  updated_at?: string
}
