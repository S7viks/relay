import { Link } from 'react-router-dom'

export function TermsPage() {
  return (
    <div className="auth-page auth-terminal">
      <div className="auth-container">
        <div className="auth-card">
          <div className="term-bar" aria-hidden="true">
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-title">gaiol://legal/terms</span>
          </div>

          <div className="auth-header">
            <h1>Terms of Service</h1>
            <p>
              Effective date: <span className="highlight">2026-03-03</span>
            </p>
          </div>

          <div className="term-screen" aria-hidden="true">
            <div className="line comment">read-only</div>
            <div className="line">
              <span className="prompt" />
              <span className="out">gaiol legal terms --show</span>
              <span className="blink">█</span>
            </div>
          </div>

          <div className="term-doc">
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your access to and use of GAIOL (the &quot;Service&quot;). By
              using the Service, you agree to these Terms.
            </p>

            <h2>1. Accounts</h2>
            <ul>
              <li>You must provide accurate information and keep your account secure.</li>
              <li>You are responsible for activity that occurs under your account.</li>
            </ul>

            <h2>2. Acceptable use</h2>
            <ul>
              <li>Do not use the Service for unlawful, harmful, or abusive activity.</li>
              <li>Do not attempt to disrupt, probe, or reverse engineer the Service.</li>
              <li>Do not upload or transmit content you do not have the right to use.</li>
            </ul>

            <h2>3. API keys and credentials</h2>
            <ul>
              <li>Keep your tokens and API keys confidential. You are responsible for their use.</li>
              <li>We may revoke keys or restrict access to protect the Service or comply with law.</li>
            </ul>

            <h2>4. Provider content and outputs</h2>
            <ul>
              <li>The Service may route requests to third-party AI providers you connect.</li>
              <li>Model outputs may be inaccurate. You are responsible for evaluating outputs before relying on them.</li>
            </ul>

            <h2>5. Availability and changes</h2>
            <ul>
              <li>We may modify, suspend, or discontinue parts of the Service at any time.</li>
              <li>We may update these Terms by posting a new version with an updated effective date.</li>
            </ul>

            <h2>6. Disclaimers</h2>
            <ul>
              <li>The Service is provided &quot;as is&quot; without warranties of any kind.</li>
              <li>We do not guarantee uninterrupted or error-free operation.</li>
            </ul>

            <h2>7. Limitation of liability</h2>
            <ul>
              <li>To the maximum extent permitted by law, we are not liable for indirect or consequential damages.</li>
            </ul>

            <h2>8. Contact</h2>
            <p>
              Questions about these Terms: <a href="mailto:support@gaiol.app">support@gaiol.app</a>
            </p>

            <p className="term-message">
              <Link className="link-text" to="/signup">
                Back to signup
              </Link>
              {' · '}
              <Link className="link-text" to="/login">
                Back to sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
