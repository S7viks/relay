import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastContainer } from './components/ui/Toast'
import { AuthProvider } from './context/AuthContext'
import { Layout } from './components/layout/Layout'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './pages/ChatPage'
import { EvalPage } from './pages/EvalPage'
import { HistoryPage } from './pages/HistoryPage'
import { MetricsPage } from './pages/MetricsPage'
import { ModelsPage } from './pages/ModelsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TracePage } from './pages/TracePage'
import { TrustPage } from './pages/TrustPage'

export function App() {
  return (
    <BrowserRouter basename="/dashboard">
      <AuthProvider>
        <ToastContainer />
        <Routes>
          <Route path="/sign-in" element={<LoginPage />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/chat" replace />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="trace" element={<Navigate to="/trace/demo" replace />} />
            <Route path="trace" element={<TracePage />} />
            <Route path="trace/:id" element={<TracePage />} />
            <Route path="trust" element={<TrustPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="metrics" element={<MetricsPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="eval" element={<EvalPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
