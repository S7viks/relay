import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReasoningEvent, useReasoningSession } from '../hooks/useReasoningSession'

type StepInfo = { title?: string; objective?: string }

type ModelOutput = {
  model_id: string
  response?: string
  scores?: { overall?: number; relevance?: number; coherence?: number; completeness?: number }
  cost?: number
  tokens_used?: number
}

type StepEndPayload = {
  index: number
  model_outputs?: ModelOutput[]
  selected_output?: ModelOutput
  total_cost?: number
}

export function ReasoningPage() {
  const { start, subscribe } = useReasoningSession()
  const [started, setStarted] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [targetPrompt, setTargetPrompt] = useState('')
  const [statusText, setStatusText] = useState('Idle')
  const [steps, setSteps] = useState<StepInfo[]>([])
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [modelGrid, setModelGrid] = useState<ModelOutput[]>([])
  const [stepTitle, setStepTitle] = useState('')
  const [stepObjective, setStepObjective] = useState('')
  const [finalText, setFinalText] = useState('')
  const [showFinal, setShowFinal] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const stepsRef = useRef<StepInfo[]>([])

  useEffect(() => {
    stepsRef.current = steps
  }, [steps])

  const handleEvent = useCallback((event: ReasoningEvent) => {
    const { type, payload } = event
    switch (type) {
      case 'decompose_start':
        setStatusText('Decomposing prompt…')
        break
      case 'decompose_end': {
        const p = payload as { steps?: StepInfo[] }
        const list = Array.isArray(p?.steps) ? p.steps : []
        stepsRef.current = list
        setSteps(list)
        setStatusText('Decomposed')
        break
      }
      case 'step_start': {
        const p = payload as { step_index?: number; title?: string; objective?: string; task_type?: string }
        const idx = p.step_index ?? 0
        setCurrentStepIndex(idx)
        const st = stepsRef.current[idx]
        const title = st?.title || p.title
        setStepTitle(title ? `Step ${idx + 1}: ${title}` : `Step ${idx + 1}`)
        setStepObjective(st?.objective || p.objective || '')
        setStatusText(`Processing step ${idx + 1}…`)
        setModelGrid([])
        break
      }
      case 'model_response': {
        const p = payload as { output?: ModelOutput } & ModelOutput
        const out = p?.output ?? (p?.model_id ? (p as ModelOutput) : null)
        if (out) setModelGrid((g) => [...g, out])
        break
      }
      case 'step_end': {
        const p = payload as StepEndPayload
        const outs = p.model_outputs || []
        setModelGrid(outs)
        setStatusText(`Step ${(p.index ?? 0) + 1} complete`)
        break
      }
      case 'beam_update': {
        const p = payload as { active_paths?: number; best_score?: number }
        setStatusText(
          `Beam search: ${p.active_paths ?? 0} paths, best: ${((p.best_score ?? 0) * 100).toFixed(0)}%`,
        )
        break
      }
      case 'consensus': {
        const p = payload as { method?: string }
        setStatusText(`Consensus: ${p.method || 'reconciling'}…`)
        break
      }
      case 'reasoning_end': {
        const p = payload as { final_output?: string }
        const text = typeof p?.final_output === 'string' ? p.final_output : ''
        setFinalText(text)
        setShowFinal(true)
        setStatusText('Completed')
        break
      }
      case 'error':
        setStatusText(typeof payload === 'string' ? payload : 'Error')
        setError(typeof payload === 'string' ? payload : 'Unknown error')
        break
      default:
        break
    }
  }, [])

  useEffect(() => {
    return subscribe(handleEvent)
  }, [subscribe, handleEvent])

  async function onStart() {
    const p = prompt.trim()
    if (!p) return
    setError('')
    setLoading(true)
    setStarted(true)
    setTargetPrompt(p)
    setShowFinal(false)
    setFinalText('')
    setSteps([])
    setModelGrid([])
    setStatusText('Initializing…')
    try {
      await start(p, [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start')
      setStarted(false)
      setStatusText('Idle')
    } finally {
      setLoading(false)
    }
  }

  const timeline = useMemo(
    () =>
      steps.map((s, i) => (
        <div
          key={i}
          className={`reasoning-timeline__step ${i === currentStepIndex ? 'active' : ''} ${
            i < currentStepIndex ? 'completed' : ''
          }`}
        >
          <strong>
            Step {i + 1}: {s.title || '—'}
          </strong>
          <p>{s.objective || ''}</p>
        </div>
      )),
    [steps, currentStepIndex],
  )

  return (
    <div className="reasoning-page">
      <header className="reasoning-page__header">
        <div>
          <span className="reasoning-page__logo">gaiol_</span>
          <span className="reasoning-page__tag">Reasoning engine</span>
        </div>
        <div className="reasoning-page__session">
          <span>{statusText}</span>
        </div>
      </header>

      <main className="reasoning-page__main">
        <aside className="reasoning-page__sidebar">
          <h3>Reasoning steps</h3>
          <div className="reasoning-timeline">{timeline}</div>
        </aside>

        <section className="reasoning-page__content">
          {!started ? (
            <div className="reasoning-start terminal-window">
              <div className="term-bar" aria-hidden="true">
                <span className="term-dot" />
                <span className="term-dot" />
                <span className="term-dot" />
                <span className="term-title">gaiol reasoning — new session</span>
              </div>
              <h3 className="reasoning-start__title">Enter your task</h3>
              <p className="reasoning-start__sub">
                The system decomposes the prompt, runs multiple models, and composes the best result.
              </p>
              <textarea
                className="reasoning-start__input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Example: Create a marketing strategy for an AI SaaS product…"
                rows={6}
              />
              <button type="button" className="btn-primary reasoning-start__btn" onClick={() => void onStart()} disabled={loading}>
                {loading ? 'Starting…' : 'Start reasoning'}
              </button>
              {error && <p className="error-message">{error}</p>}
            </div>
          ) : (
            <>
              <div className="reasoning-prompt-card terminal-window">
                <h4>Target objective</h4>
                <p>{targetPrompt}</p>
              </div>

              <div className="reasoning-dashboard terminal-window">
                <div className="reasoning-step-header">
                  <h2>{stepTitle || 'Working…'}</h2>
                  <p>{stepObjective}</p>
                </div>

                <div className="reasoning-model-grid">
                  {modelGrid.map((out, i) => {
                    const short = out.model_id.split('/').pop() || out.model_id
                    const score = out.scores?.overall != null ? `${(out.scores.overall * 100).toFixed(0)}%` : '…'
                    return (
                      <div key={i} className="reasoning-model-card">
                        <div className="reasoning-model-card__head">
                          <strong>{short}</strong>
                          <span className="term-code">{score}</span>
                        </div>
                        {out.scores && (
                          <div className="reasoning-scores">
                            {out.scores.relevance != null && (
                              <span>Rel {(out.scores.relevance * 100).toFixed(0)}%</span>
                            )}
                            {out.scores.coherence != null && (
                              <span>Coh {(out.scores.coherence * 100).toFixed(0)}%</span>
                            )}
                            {out.scores.completeness != null && (
                              <span>Comp {(out.scores.completeness * 100).toFixed(0)}%</span>
                            )}
                          </div>
                        )}
                        <div className="reasoning-model-card__body">{out.response || ''}</div>
                      </div>
                    )
                  })}
                </div>

                {showFinal && (
                  <div className="reasoning-final terminal-window">
                    <h4>Final result</h4>
                    <div className="reasoning-final__text">{finalText}</div>
                  </div>
                )}
                {error && <p className="error-message">{error}</p>}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
