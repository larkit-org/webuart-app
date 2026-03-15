import { useState, useRef, useCallback, useEffect } from 'react'
import { useSerialStore } from '@/store/serialStore'
import type { SerialEvent } from '@/types'

export type ShareStatus = 'idle' | 'creating' | 'sharing' | 'error'
export type ViewerState = 'waiting' | 'connected' | 'disconnected'

interface ShareSessionResult {
  status: ShareStatus
  viewerState: ViewerState
  shareUrl: string | null
  error: string | null
  startSharing: () => Promise<void>
  stopSharing: () => void
}

function getApiBase(): string {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:8787'
  }
  return 'https://api.webuart.app'
}

function getWsBase(): string {
  if (window.location.hostname === 'localhost') {
    return 'ws://localhost:8787'
  }
  return 'wss://api.webuart.app'
}

const PING_INTERVAL_MS = 30_000

export function useShareSession(): ShareSessionResult {
  const [status, setStatus] = useState<ShareStatus>('idle')
  const [viewerState, setViewerState] = useState<ViewerState>('waiting')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const statusRef = useRef<ShareStatus>('idle')

  // Keep ref in sync
  useEffect(() => { statusRef.current = status }, [status])

  const wsRef = useRef<WebSocket | null>(null)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dataHandlerRef = useRef<((event: SerialEvent) => void) | null>(null)

  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current)
      pingIntervalRef.current = null
    }

    if (dataHandlerRef.current) {
      useSerialStore.getState().removeEventListener('data', dataHandlerRef.current)
      dataHandlerRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    setShareUrl(null)
    setViewerState('waiting')
  }, [])

  const stopSharing = useCallback(() => {
    cleanup()
    setStatus('idle')
    setError(null)
  }, [cleanup])

  const startSharing = useCallback(async () => {
    setStatus('creating')
    setError(null)

    try {
      // Create session
      const res = await fetch(`${getApiBase()}/api/sessions`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to create session')
      }

      const { sessionId, hostToken, url } = await res.json()
      setShareUrl(url)

      // Store token in ref for rotation
      const hostTokenRef = { current: hostToken }

      // Connect WebSocket as host (no token in URL)
      const wsUrl = `${getWsBase()}/api/sessions/${sessionId}/ws?role=host`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        // Send auth as the first message
        ws.send(JSON.stringify({ type: 'auth', token: hostTokenRef.current }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === 'auth_ok') {
            // Save rotated token for potential reconnect
            if (msg.newToken) {
              hostTokenRef.current = msg.newToken
            }

            setStatus('sharing')

            // Start ping interval after successful auth
            pingIntervalRef.current = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }))
              }
            }, PING_INTERVAL_MS)

            // Subscribe to serial data
            const handleData = (event: SerialEvent) => {
              if (event.data && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'data', payload: event.data }))
              }
            }
            dataHandlerRef.current = handleData
            useSerialStore.getState().addEventListener('data', handleData)
            return
          }

          if (msg.type === 'viewer_connected') setViewerState('connected')
          if (msg.type === 'viewer_disconnected') setViewerState('waiting')
          if (msg.type === 'session_closed') {
            cleanup()
            setStatus('idle')
          }
          if (msg.type === 'error') {
            setError(msg.message || 'Session limit reached')
            cleanup()
            setStatus('error')
          }
        } catch {
          // ignore
        }
      }

      ws.onclose = () => {
        cleanup()
        if (statusRef.current !== 'error') {
          setStatus('idle')
        }
      }

      ws.onerror = () => {
        setError('Connection failed')
        cleanup()
        setStatus('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
      setStatus('error')
    }
  }, [cleanup])

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  return { status, viewerState, shareUrl, error, startSharing, stopSharing }
}
