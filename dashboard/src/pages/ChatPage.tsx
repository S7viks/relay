import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPost, ApiError } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import type { SmartQueryResponse } from '../types/api'
import { useAppStore } from '../store'

const STRATEGIES = [
  'balanced',
  'lowest_cost',
  'highest_quality',
  'free_only',
  'beam',
  'go_reasoning',
] as const

const TASKS = ['qa', 'code', 'summarization', 'reasoning', 'creative', 'tool_use', 'unknown'] as const

export function ChatPage() {
  const toast = useToast()
  const setSessionId = useAppStore((s) => s.setSessionId)
  const addToHistory = useAppStore((s) => s.addToHistory)

  const [prompt, setPrompt] = useState('')
  const [strategy, setStrategy] = useState<string>('balanced')
  const [task, setTask] = useState<string>('qa')
  const [maxTokens, setMaxTokens] = useState(500)
  const [temperature, setTemperature] = useState(0.7)
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState('')
  const [traceId, setTraceId] = useState<string | null>(null)
  const [rawMeta, setRawMeta] = useState<string>('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim()) {
      toast.error('Enter a prompt')
      return
    }
    setLoading(true)
    setAnswer('')
    setTraceId(null)
    setRawMeta('')
    try {
      const data = (await apiPost('/api/query/smart', {
        prompt: prompt.trim(),
        strategy,
        task,
        max_tokens: maxTokens,
        temperature,
      })) as SmartQueryResponse

      const text = data.response ?? data.result?.data ?? ''
      setAnswer(text)

      const tid =
        data.metadata?.trace_id ??
        data.orchestration?.trace_id ??
        data.metadata?.session_id ??
        null
      setTraceId(tid ?? null)
      if (tid) setSessionId(tid)

      addToHistory({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        query: prompt.trim(),
        timestamp: Date.now(),
      })

      setRawMeta(
        JSON.stringify(
          {
            metadata: data.metadata,
            orchestration: data.orchestration,
            cost: data.cost,
            latency_ms: data.latency_ms,
            strategy: data.strategy,
          },
          null,
          2,
        ),
      )
      toast.success('Response received')
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Chat</h1>
        <p className="page-shell__desc">
          Smart query via <code className="mono-block" style={{ display: 'inline', padding: '2px 6px' }}>POST /api/query/smart</code>.
          With TS orchestration enabled, use the trace link to inspect the run.
        </p>
      </div>

      <form className="page-shell__body panel" onSubmit={onSubmit}>
        <div className="form-field">
          <label htmlFor="prompt">Prompt</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
            placeholder="Ask anything…"
          />
        </div>
        <div className="form-field">
          <label htmlFor="strategy">Strategy</label>
          <select
            id="strategy"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            disabled={loading}
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="task">Task</label>
          <select id="task" value={task} onChange={(e) => setTask(e.target.value)} disabled={loading}>
            {TASKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="max_tokens">Max tokens</label>
          <input
            id="max_tokens"
            type="number"
            min={16}
            max={8192}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value) || 300)}
            disabled={loading}
          />
        </div>
        <div className="form-field">
          <label htmlFor="temp">Temperature</label>
          <input
            id="temp"
            type="number"
            step="0.1"
            min={0}
            max={2}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            disabled={loading}
          />
        </div>
        <button type="submit" className="btn" disabled={loading}>
          {loading ? 'Sending…' : 'Send'}
        </button>
      </form>

      {traceId && (
        <div className="page-shell__meta" style={{ marginTop: 16 }}>
          Trace / session id:{' '}
          <Link to={`/trace/${encodeURIComponent(traceId)}`}>{traceId}</Link>
        </div>
      )}

      {answer && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: '1rem', marginBottom: 8 }}>Answer</h2>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{answer}</div>
        </div>
      )}

      {rawMeta && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>Response metadata</summary>
          <pre className="mono-block" style={{ marginTop: 8 }}>
            {rawMeta}
          </pre>
        </details>
      )}
    </div>
  )
}
