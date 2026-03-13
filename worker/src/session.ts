interface SessionMessage {
  type: string
  payload?: string
  code?: string
  message?: string
}

const MAX_BUFFER_BYTES = 256 * 1024 // 256KB buffer
const MAX_SESSION_BYTES = 100 * 1024 // 100KB total data cap
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000 // 30 minutes
const INACTIVITY_TIMEOUT_MS = 60 * 1000 // 60 seconds
const ALARM_INTERVAL_MS = 30 * 1000 // 30 seconds

export class SessionRoom implements DurableObject {
  private hostWs: WebSocket | null = null
  private viewerWs: WebSocket | null = null
  private hostToken: string | null = null
  private buffer: string[] = []
  private bufferBytes = 0
  private totalBytes = 0
  private lastHostMessage = 0
  private createdAt = 0

  constructor(
    private state: DurableObjectState,
    private env: unknown
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Internal init endpoint
    if (url.pathname === '/init' && request.method === 'POST') {
      const body = await request.json() as { hostToken: string }
      this.hostToken = body.hostToken
      this.createdAt = Date.now()
      this.lastHostMessage = Date.now()
      // Set first alarm
      this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
      return new Response('ok')
    }

    // WebSocket upgrade
    const role = url.searchParams.get('role')
    const token = url.searchParams.get('token')

    if (role === 'host') {
      return this.handleHostUpgrade(token)
    }

    if (role === 'viewer') {
      return this.handleViewerUpgrade()
    }

    return new Response('Bad request', { status: 400 })
  }

  private handleHostUpgrade(token: string | null): Response {
    if (!this.hostToken) {
      return this.wsError('SESSION_NOT_FOUND', 'Session not initialized')
    }
    if (token !== this.hostToken) {
      return this.wsError('INVALID_TOKEN', 'Invalid host token')
    }
    if (this.hostWs) {
      return this.wsError('HOST_EXISTS', 'Host already connected')
    }

    const pair = new WebSocketPair()
    this.hostWs = pair[1]
    this.state.acceptWebSocket(pair[1], ['host'])
    this.lastHostMessage = Date.now()

    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  private handleViewerUpgrade(): Response {
    if (!this.hostToken) {
      return this.wsError('SESSION_NOT_FOUND', 'Session not found')
    }
    if (this.viewerWs) {
      // Close old viewer, allow reconnect
      try {
        this.sendTo(this.viewerWs, { type: 'session_closed' })
        this.viewerWs.close(1000, 'Replaced by new viewer')
      } catch {
        // ignore
      }
      this.viewerWs = null
    }

    const pair = new WebSocketPair()
    this.viewerWs = pair[1]
    this.state.acceptWebSocket(pair[1], ['viewer'])

    // Send history buffer
    const history = this.buffer.join('')
    this.sendTo(pair[1], { type: 'history', payload: history })

    // Notify host
    if (this.hostWs) {
      this.sendTo(this.hostWs, { type: 'viewer_connected' })
    }

    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string') return

    let parsed: SessionMessage
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }

    const tags = this.state.getTags(ws)
    const isHost = tags.includes('host')

    console.log('[DO] msg:', parsed.type, 'isHost:', isHost, 'hasViewer:', !!this.viewerWs, 'payloadLen:', parsed.payload?.length ?? 0)

    if (isHost) {
      this.lastHostMessage = Date.now()

      if (parsed.type === 'ping') {
        this.sendTo(ws, { type: 'pong' })
        return
      }

      if (parsed.type === 'data' && parsed.payload) {
        const payloadBytes = parsed.payload.length
        this.totalBytes += payloadBytes

        // Check session data cap
        if (this.totalBytes > MAX_SESSION_BYTES) {
          this.sendTo(ws, {
            type: 'error',
            code: 'LIMIT_REACHED',
            message: 'Session data cap exceeded (100KB)',
          })
          this.closeSession()
          return
        }

        // Add to ring buffer
        this.buffer.push(parsed.payload)
        this.bufferBytes += payloadBytes
        while (this.bufferBytes > MAX_BUFFER_BYTES && this.buffer.length > 0) {
          const removed = this.buffer.shift()!
          this.bufferBytes -= removed.length
        }

        // Relay to viewer
        if (this.viewerWs) {
          this.sendTo(this.viewerWs, { type: 'data', payload: parsed.payload })
        }
      }
    }
    // Viewer sends nothing in this protocol
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const tags = this.state.getTags(ws)

    if (tags.includes('host')) {
      this.hostWs = null
      if (this.viewerWs) {
        this.sendTo(this.viewerWs, { type: 'session_closed' })
        try { this.viewerWs.close(1000, 'Host disconnected') } catch { /* ignore */ }
        this.viewerWs = null
      }
    }

    if (tags.includes('viewer')) {
      this.viewerWs = null
      if (this.hostWs) {
        this.sendTo(this.hostWs, { type: 'viewer_disconnected' })
      }
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    // Treat as close
    await this.webSocketClose(ws, 1006, 'WebSocket error', false)
  }

  async alarm() {
    const now = Date.now()

    // Check inactivity
    if (now - this.lastHostMessage > INACTIVITY_TIMEOUT_MS) {
      this.closeSession()
      return
    }

    // Check max duration
    if (this.createdAt > 0 && now - this.createdAt > MAX_SESSION_DURATION_MS) {
      this.sendToAll({
        type: 'error',
        code: 'LIMIT_REACHED',
        message: 'Maximum session duration exceeded (30 min)',
      })
      this.closeSession()
      return
    }

    // Schedule next alarm if session is still alive
    if (this.hostWs) {
      this.state.storage.setAlarm(now + ALARM_INTERVAL_MS)
    }
  }

  private closeSession() {
    if (this.hostWs) {
      this.sendTo(this.hostWs, { type: 'session_closed' })
      try { this.hostWs.close(1000, 'Session closed') } catch { /* ignore */ }
      this.hostWs = null
    }
    if (this.viewerWs) {
      this.sendTo(this.viewerWs, { type: 'session_closed' })
      try { this.viewerWs.close(1000, 'Session closed') } catch { /* ignore */ }
      this.viewerWs = null
    }
  }

  private sendTo(ws: WebSocket, msg: SessionMessage) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // ignore send errors on closed sockets
    }
  }

  private sendToAll(msg: SessionMessage) {
    if (this.hostWs) this.sendTo(this.hostWs, msg)
    if (this.viewerWs) this.sendTo(this.viewerWs, msg)
  }

  private wsError(code: string, message: string): Response {
    return new Response(JSON.stringify({ error: message, code }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
