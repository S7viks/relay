import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl, apiWebSocketUrl } from '../lib/apiBase'
import { getAccessToken } from '../lib/auth'

export type ReasoningEvent = {
  type: string
  payload?: unknown
}

export function useReasoningSession() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const listenersRef = useRef<Set<(e: ReasoningEvent) => void>>(new Set())

  const subscribe = useCallback((fn: (e: ReasoningEvent) => void) => {
    listenersRef.current.add(fn)
    return () => {
      listenersRef.current.delete(fn)
    }
  }, [])

  const emit = useCallback((e: ReasoningEvent) => {
    listenersRef.current.forEach((fn) => fn(e))
  }, [])

  const disconnect = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
      socketRef.current.close()
    }
    socketRef.current = null
    setConnected(false)
  }, [])

  const connectWs = useCallback(
    (sid: string) => {
      disconnect()
      const wsUrl = apiWebSocketUrl(`/api/reasoning/ws?session_id=${encodeURIComponent(sid)}`)
      const ws = new WebSocket(wsUrl)
      socketRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        emit({ type: 'ws_connected', payload: 'WebSocket connected' })
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as ReasoningEvent
          emit(data)
        } catch {
          emit({ type: 'error', payload: 'Invalid message from server' })
        }
      }

      ws.onclose = (event) => {
        setConnected(false)
        if (event.code !== 1000) {
          emit({
            type: 'ws_disconnected',
            payload: `WebSocket closed: ${event.reason || 'Connection lost'}`,
          })
        }
      }

      ws.onerror = () => {
        emit({ type: 'error', payload: 'WebSocket connection error' })
      }
    },
    [disconnect, emit],
  )

  const start = useCallback(
    async (prompt: string, models: string[] = [], config: Record<string, unknown> = {}) => {
      const token = getAccessToken()?.trim()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch(apiUrl('/api/reasoning/start'), {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ prompt, models, ...config }),
      })

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error('Authentication required. Please sign in to use the reasoning engine.')
        }
        const text = await res.text()
        let message = 'Failed to start reasoning session'
        try {
          const j = JSON.parse(text) as { error?: string; message?: string }
          message = j.error || j.message || message
        } catch {
          message = text || message
        }
        throw new Error(message)
      }

      const data = (await res.json()) as { session_id?: string; final_output?: string }
      const sid = data.session_id
      if (!sid) throw new Error('No session_id in response')

      setSessionId(sid)
      connectWs(sid)

      if (data.final_output != null && data.final_output !== '') {
        emit({ type: 'reasoning_end', payload: { final_output: data.final_output } })
      }

      return data
    },
    [connectWs, emit],
  )

  useEffect(() => () => disconnect(), [disconnect])

  return { sessionId, connected, start, subscribe, disconnect }
}
