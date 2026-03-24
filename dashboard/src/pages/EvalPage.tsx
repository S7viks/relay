import { useState } from 'react'
import { apiPost, ApiError } from '../lib/api'
import { useToast } from '../components/ui/Toast'

const DEFAULT_EXAMPLES = `[
  { "objective": "Greet the user", "expectedContains": ["hello", "hi"] }
]`

export function EvalPage() {
  const toast = useToast()
  const [answerText, setAnswerText] = useState('Hello there!')
  const [examplesJson, setExamplesJson] = useState(DEFAULT_EXAMPLES)
  const [resultJson, setResultJson] = useState('')
  const [loading, setLoading] = useState(false)

  async function runEval() {
    let examples: unknown
    try {
      examples = JSON.parse(examplesJson) as unknown
    } catch {
      toast.error('Examples must be valid JSON array')
      return
    }
    if (!Array.isArray(examples)) {
      toast.error('Examples must be a JSON array')
      return
    }
    setLoading(true)
    setResultJson('')
    try {
      const out = await apiPost('/api/orchestration/eval/contains', {
        examples,
        answerText,
      })
      setResultJson(JSON.stringify(out, null, 2))
      toast.success('Eval complete')
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="page-shell__header">
        <h1>Evaluation (contains harness)</h1>
        <p className="page-shell__desc">
          POST <code>/api/orchestration/eval/contains</code> — checks expected substrings against an answer string (no
          live model call). Requires TS orchestrator on Go.
        </p>
      </div>

      <div className="panel page-shell__body">
        <div className="form-field">
          <label htmlFor="ex">Examples JSON</label>
          <textarea id="ex" value={examplesJson} onChange={(e) => setExamplesJson(e.target.value)} spellCheck={false} />
        </div>
        <div className="form-field">
          <label htmlFor="ans">Answer text</label>
          <textarea id="ans" value={answerText} onChange={(e) => setAnswerText(e.target.value)} />
        </div>
        <button type="button" className="btn" onClick={() => void runEval()} disabled={loading}>
          {loading ? 'Running…' : 'Run eval'}
        </button>
      </div>

      {resultJson && (
        <pre className="mono-block panel" style={{ marginTop: 16 }}>
          {resultJson}
        </pre>
      )}
    </div>
  )
}
