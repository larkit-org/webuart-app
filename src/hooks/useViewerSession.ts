import { useState, useEffect, useRef, useCallback } from 'react'

export type ViewerStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface ViewerSessionResult {
  status: ViewerStatus
  error: string | null
  onData: (callback: (data: string) => void) => void
}

function getWsBase(): string {
  if (window.location.hostname === 'localhost') {
    return 'ws://localhost:8787'
  }
  return 'wss://api.webuart.app'
}

export function useViewerSession(sessionId: string): ViewerSessionResult {
  const [status, setStatus] = useState<ViewerStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const dataCallbackRef = useRef<((data: string) => void) | null>(null)
  const statusRef = useRef<ViewerStatus>('connecting')

  // Keep ref in sync
  useEffect(() => { statusRef.current = status }, [status])

  const onData = useCallback((callback: (data: string) => void) => {
    dataCallbackRef.current = callback
  }, [])

  useEffect(() => {
    const wsUrl = `${getWsBase()}/api/sessions/${sessionId}/ws?role=viewer`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'history' && msg.payload) {
          dataCallbackRef.current?.(msg.payload)
        }

        if (msg.type === 'data' && msg.payload) {
          dataCallbackRef.current?.(msg.payload)
        }

        if (msg.type === 'session_closed') {
          setStatus('disconnected')
          setError('Session ended by host')
        }

        if (msg.type === 'error') {
          setStatus('error')
          setError(msg.message || 'Unknown error')
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      if (statusRef.current !== 'error') {
        setStatus('disconnected')
      }
    }

    ws.onerror = () => {
      setStatus('error')
      setError('Connection failed')
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [sessionId])

  return { status, error, onData }
}
