interface SessionMessage {
  type: string
  payload?: string
  code?: string
  message?: string
}

interface SessionState {
  hostToken: string
  buffer: string[]
  bufferBytes: number
  totalBytes: number
  lastHostMessage: number
  createdAt: number
}

const MAX_BUFFER_BYTES = 256 * 1024 // 256KB buffer
const MAX_SESSION_BYTES = 100 * 1024 // 100KB total data cap
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000 // 30 minutes
const INACTIVITY_TIMEOUT_MS = 60 * 1000 // 60 seconds
const ALARM_INTERVAL_MS = 30 * 1000 // 30 seconds

export class SessionRoom implements DurableObject {
  private sessionState: SessionState | null = null

  constructor(
    private state: DurableObjectState,
    private env: unknown
  ) {}

  // Retrieve persisted state from storage (survives hibernation)
  private async getSessionState(): Promise<SessionState | null> {
    if (this.sessionState) return this.sessionState
    this.sessionState = await this.state.storage.get<SessionState>('session') ?? null
    return this.sessionState
  }

  private async saveSessionState(): Promise<void> {
    if (this.sessionState) {
      await this.state.storage.put('session', this.sessionState)
    }
  }

  // Use Hibernation API to get WebSockets by tag (survives hibernation)
  private getHostWs(): WebSocket | null {
    const sockets = this.state.getWebSockets('host')
    return sockets.length > 0 ? sockets[0] : null
  }

  private getViewerWs(): WebSocket | null {
    const sockets = this.state.getWebSockets('viewer')
    return sockets.length > 0 ? sockets[0] : null
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Internal init endpoint
    if (url.pathname === '/init' && request.method === 'POST') {
      const body = await request.json() as { hostToken: string }
      this.sessionState = {
        hostToken: body.hostToken,
        buffer: [],
        bufferBytes: 0,
        totalBytes: 0,
        lastHostMessage: Date.now(),
        createdAt: Date.now(),
      }
      await this.saveSessionState()
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

  private async handleHostUpgrade(token: string | null): Promise<Response> {
    const s = await this.getSessionState()
    if (!s) {
      return this.wsError('SESSION_NOT_FOUND', 'Session not initialized')
    }
    if (token !== s.hostToken) {
      return this.wsError('INVALID_TOKEN', 'Invalid host token')
    }
    if (this.getHostWs()) {
      return this.wsError('HOST_EXISTS', 'Host already connected')
    }

    const pair = new WebSocketPair()
    this.state.acceptWebSocket(pair[1], ['host'])
    s.lastHostMessage = Date.now()
    await this.saveSessionState()

    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  private async handleViewerUpgrade(): Promise<Response> {
    const s = await this.getSessionState()
    if (!s) {
      return this.wsError('SESSION_NOT_FOUND', 'Session not found')
    }

    // Close old viewer if exists, allow reconnect
    const oldViewer = this.getViewerWs()
    if (oldViewer) {
      try {
        this.sendTo(oldViewer, { type: 'session_closed' })
        oldViewer.close(1000, 'Replaced by new viewer')
      } catch {
        // ignore
      }
    }

    const pair = new WebSocketPair()
    this.state.acceptWebSocket(pair[1], ['viewer'])

    // Send history buffer
    const history = s.buffer.join('')
    this.sendTo(pair[1], { type: 'history', payload: history })

    // Notify host
    const hostWs = this.getHostWs()
    if (hostWs) {
      this.sendTo(hostWs, { type: 'viewer_connected' })
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

    if (isHost) {
      const s = await this.getSessionState()
      if (!s) return

      s.lastHostMessage = Date.now()

      if (parsed.type === 'ping') {
        this.sendTo(ws, { type: 'pong' })
        await this.saveSessionState()
        return
      }

      if (parsed.type === 'data' && parsed.payload) {
        const payloadBytes = parsed.payload.length
        s.totalBytes += payloadBytes

        // Check session data cap
        if (s.totalBytes > MAX_SESSION_BYTES) {
          this.sendTo(ws, {
            type: 'error',
            code: 'LIMIT_REACHED',
            message: 'Session data cap exceeded (100KB)',
          })
          await this.closeSession()
          return
        }

        // Add to ring buffer
        s.buffer.push(parsed.payload)
        s.bufferBytes += payloadBytes
        while (s.bufferBytes > MAX_BUFFER_BYTES && s.buffer.length > 0) {
          const removed = s.buffer.shift()!
          s.bufferBytes -= removed.length
        }

        await this.saveSessionState()

        // Relay to viewer
        const viewerWs = this.getViewerWs()
        if (viewerWs) {
          this.sendTo(viewerWs, { type: 'data', payload: parsed.payload })
        }
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    const tags = this.state.getTags(ws)

    if (tags.includes('host')) {
      const viewerWs = this.getViewerWs()
      if (viewerWs) {
        this.sendTo(viewerWs, { type: 'session_closed' })
        try { viewerWs.close(1000, 'Host disconnected') } catch { /* ignore */ }
      }
      await this.state.storage.deleteAll()
    }

    if (tags.includes('viewer')) {
      const hostWs = this.getHostWs()
      if (hostWs) {
        this.sendTo(hostWs, { type: 'viewer_disconnected' })
      }
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    await this.webSocketClose(ws, 1006, 'WebSocket error', false)
  }

  async alarm() {
    const s = await this.getSessionState()
    if (!s) return

    const now = Date.now()

    // Check inactivity
    if (now - s.lastHostMessage > INACTIVITY_TIMEOUT_MS) {
      await this.closeSession()
      return
    }

    // Check max duration
    if (s.createdAt > 0 && now - s.createdAt > MAX_SESSION_DURATION_MS) {
      const hostWs = this.getHostWs()
      const viewerWs = this.getViewerWs()
      const msg: SessionMessage = {
        type: 'error',
        code: 'LIMIT_REACHED',
        message: 'Maximum session duration exceeded (30 min)',
      }
      if (hostWs) this.sendTo(hostWs, msg)
      if (viewerWs) this.sendTo(viewerWs, msg)
      await this.closeSession()
      return
    }

    // Schedule next alarm if host is still connected
    if (this.getHostWs()) {
      this.state.storage.setAlarm(now + ALARM_INTERVAL_MS)
    }
  }

  private async closeSession() {
    const hostWs = this.getHostWs()
    const viewerWs = this.getViewerWs()

    if (hostWs) {
      this.sendTo(hostWs, { type: 'session_closed' })
      try { hostWs.close(1000, 'Session closed') } catch { /* ignore */ }
    }
    if (viewerWs) {
      this.sendTo(viewerWs, { type: 'session_closed' })
      try { viewerWs.close(1000, 'Session closed') } catch { /* ignore */ }
    }

    await this.state.storage.deleteAll()
    this.sessionState = null
  }

  private sendTo(ws: WebSocket, msg: SessionMessage) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // ignore send errors on closed sockets
    }
  }

  private wsError(code: string, message: string): Response {
    return new Response(JSON.stringify({ error: message, code }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
