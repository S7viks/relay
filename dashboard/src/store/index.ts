import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface HistoryEntry {
  id: string
  query: string
  timestamp: number
}

interface AppState {
  sessionId: string | null
  queryHistory: HistoryEntry[]
  activeModel: string
  theme: 'light' | 'dark'
  isConnected: boolean
  setSessionId: (id: string) => void
  addToHistory: (entry: HistoryEntry) => void
  setTheme: (theme: 'light' | 'dark') => void
  setConnected: (v: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sessionId: null,
      queryHistory: [],
      activeModel: 'auto',
      theme: 'light',
      isConnected: false,
      setSessionId: (id) => set({ sessionId: id }),
      addToHistory: (entry) =>
        set((s) => ({ queryHistory: [entry, ...s.queryHistory].slice(0, 100) })),
      setTheme: (theme) => set({ theme }),
      setConnected: (v) => set({ isConnected: v }),
    }),
    { name: 'gaiol-store', partialize: (s) => ({ theme: s.theme, activeModel: s.activeModel }) }
  )
)
