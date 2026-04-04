import { Link } from 'react-router-dom'

export function LandingPage() {
  return (
    <div className="terminal-page">
      <div className="terminal">
        <div className="terminal-window">
          <div className="term-bar" aria-hidden="true">
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-title">gaiol — one API key for all your AI models</span>
          </div>

          <div className="line comment">Using multiple AI APIs? Stop wasting spend.</div>
          <div className="line comment">One API key. We route across your models so you don&apos;t overpay or underuse.</div>
          <div className="line out">&nbsp;</div>
          <div className="line out">
            <em>Add your provider keys once.</em> OpenRouter, Gemini, HuggingFace today — more providers over time.
          </div>
          <div className="line out">
            <em>Get one GAIOL key.</em> Use it everywhere in your apps.
          </div>
          <div className="line out">We optimize cost and quality across your models.</div>
          <div className="line out">&nbsp;</div>

          <div className="line prompt cta-line">
            get-gaiol-key<span className="blink">_</span>
          </div>
          <Link className="cta-cmd" to="/signup">
            get-gaiol-key
          </Link>
          <div className="line out" style={{ marginTop: '0.75rem' }}>
            <Link to="/login" className="landing-inline-link">
              Already have an account? Log in
            </Link>
          </div>
        </div>

        <section id="features" className="features">
          <h2># Get the best out of all your models</h2>
          <div className="feature-grid">
            <div className="feature">
              <strong>Smart routing</strong>
              <p>We pick the right model for each task — cost, quality, and latency balanced for you.</p>
            </div>
            <div className="feature">
              <strong>One key, all providers</strong>
              <p>Add OpenRouter, Gemini, HuggingFace once. Use a single GAIOL key everywhere.</p>
            </div>
            <div className="feature">
              <strong>Usage & billing</strong>
              <p>Track requests, tokens, and cost per provider. Export CSV. No surprises.</p>
            </div>
            <div className="feature">
              <strong>Reasoning engine</strong>
              <p>Multi-step reasoning with beam search. Decompose hard questions, get better answers.</p>
            </div>
          </div>
        </section>

        <section id="how" className="features features--tight">
          <h2># How it works</h2>
          <div className="line out"> 1. Connect your providers in the dashboard.</div>
          <div className="line out"> 2. Create one GAIOL API key.</div>
          <div className="line out">
            {' '}
            3. Call <code className="term-code">POST /v1/chat</code> from your app; we route and log usage.
          </div>
        </section>

        <footer className="landing-footer">
          <Link to="/login">Login</Link>
          <span aria-hidden> · </span>
          <Link to="/chat">Dashboard</Link>
          <span aria-hidden> · </span>
          <Link to="/signup">Get your key</Link>
        </footer>
      </div>
    </div>
  )
}
