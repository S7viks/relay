import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { PublicLayout } from './components/layout/PublicLayout'
import { ChatPage } from './pages/ChatPage'
import { HomePage } from './pages/HomePage'
import { EvalPage } from './pages/EvalPage'
import { HistoryPage } from './pages/HistoryPage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { MetricsPage } from './pages/MetricsPage'
import { ModelsPage } from './pages/ModelsPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { ReasoningPage } from './pages/ReasoningPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { SettingsPage } from './pages/SettingsPage'
import { SignupPage } from './pages/SignupPage'
import { TermsPage } from './pages/TermsPage'
import { TracePage } from './pages/TracePage'
import { TrustPage } from './pages/TrustPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="terms" element={<TermsPage />} />
        </Route>

        <Route element={<Layout />}>
          <Route path="home" element={<HomePage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="trace" element={<TracePage />} />
          <Route path="trace/:id" element={<TracePage />} />
          <Route path="trust" element={<TrustPage />} />
          <Route path="models" element={<ModelsPage />} />
          <Route path="metrics" element={<MetricsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="onboarding" element={<OnboardingPage />} />
          <Route path="eval" element={<EvalPage />} />
          <Route path="reasoning" element={<ReasoningPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
