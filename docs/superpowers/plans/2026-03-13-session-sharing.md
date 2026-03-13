# Session Sharing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable live terminal session sharing via secret link using Cloudflare Durable Objects as a WebSocket relay.

**Architecture:** A Cloudflare Worker with a Durable Object (SessionRoom) acts as a WebSocket relay between one host and one viewer. The host streams serial data to the DO, which buffers it and forwards to the viewer. The frontend adds a share UI in the sidebar and a read-only viewer page.

**Tech Stack:** Cloudflare Workers + Durable Objects, WebSocket API, React, xterm.js, Zustand, TypeScript, pnpm

**Spec:** `docs/superpowers/specs/2026-03-13-session-sharing-design.md`

---

## Chunk 1: Worker Backend

### Task 1: Scaffold the Worker project

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/src/index.ts` (stub)
- Create: `worker/src/session.ts` (stub)
- Modify: `package.json` (root — add convenience scripts)

- [ ] **Step 1: Create `worker/package.json`**

```json
{
  "name": "webuart-api",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^4.54.0",
    "@cloudflare/workers-types": "^4.20250313.0",
    "typescript": "~5.9.3"
  }
}
```

- [ ] **Step 2: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `worker/wrangler.toml`**

```toml
name = "webuart-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[durable_objects]
bindings = [{ name = "SESSION_ROOM", class_name = "SessionRoom" }]

[[migrations]]
tag = "v1"
new_classes = ["SessionRoom"]
```

- [ ] **Step 4: Create stub `worker/src/index.ts`**

```ts
import { SessionRoom } from './session'

export { SessionRoom }

export interface Env {
  SESSION_ROOM: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response('webuart-api', { status: 200 })
  },
}
```

- [ ] **Step 5: Create stub `worker/src/session.ts`**

```ts
export class SessionRoom implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: unknown
  ) {}

  async fetch(request: Request): Promise<Response> {
    return new Response('SessionRoom', { status: 200 })
  }
}
```

- [ ] **Step 6: Add convenience scripts to root `package.json`**

Add to the `"scripts"` section of `/package.json`:

```json
"worker:dev": "cd worker && pnpm dev",
"worker:deploy": "cd worker && pnpm deploy"
```

- [ ] **Step 7: Install worker dependencies**

```bash
cd worker && pnpm install
```

- [ ] **Step 8: Verify worker starts**

```bash
cd worker && pnpm dev
# Expected: wrangler dev server starts on localhost:8787
# Ctrl+C to stop
```

- [ ] **Step 9: Commit**

```bash
git add worker/ package.json
git commit -m "feat: scaffold Cloudflare Worker project for session sharing"
```

---

### Task 2: Implement Worker HTTP routing with CORS and rate limiting

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1: Implement the Worker fetch handler with CORS, rate limiting, and session creation**

Replace `worker/src/index.ts` with:

```ts
import { SessionRoom } from './session'

export { SessionRoom }

export interface Env {
  SESSION_ROOM: DurableObjectNamespace
}

const ALLOWED_ORIGINS = [
  'https://webuart.app',
  'http://localhost:5173',
]

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function jsonResponse(data: unknown, status: number, request: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  })
}

// Simple in-memory rate limit and concurrent session tracking (best-effort, resets on redeploy)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const concurrentSessions = new Map<string, Set<string>>() // ip -> set of sessionIds

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 })
    return true
  }
  entry.count++
  return entry.count <= 5
}

function checkConcurrentLimit(ip: string): boolean {
  const sessions = concurrentSessions.get(ip)
  return !sessions || sessions.size < 2
}

function trackSession(ip: string, sessionId: string) {
  if (!concurrentSessions.has(ip)) {
    concurrentSessions.set(ip, new Set())
  }
  concurrentSessions.get(ip)!.add(sessionId)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    // POST /api/sessions — create a new session
    if (request.method === 'POST' && path === '/api/sessions') {
      const ip = request.headers.get('cf-connecting-ip') || 'unknown'
      if (!checkRateLimit(ip)) {
        return jsonResponse({ error: 'Rate limit exceeded' }, 429, request)
      }
      if (!checkConcurrentLimit(ip)) {
        return jsonResponse({ error: 'Too many concurrent sessions' }, 429, request)
      }

      const sessionId = crypto.randomUUID()
      const hostToken = crypto.randomUUID()

      // Track concurrent session for this IP
      trackSession(ip, sessionId)

      // Initialize the Durable Object with hostToken
      const doId = env.SESSION_ROOM.idFromName(sessionId)
      const stub = env.SESSION_ROOM.get(doId)
      await stub.fetch(new Request('https://internal/init', {
        method: 'POST',
        body: JSON.stringify({ hostToken, ip }),
      }))

      const appUrl = url.hostname === 'localhost'
        ? `http://localhost:5173/#/s/${sessionId}`
        : `https://webuart.app/#/s/${sessionId}`

      return jsonResponse({ sessionId, hostToken, url: appUrl }, 201, request)
    }

    // GET /api/sessions/:sessionId/ws — WebSocket upgrade
    const wsMatch = path.match(/^\/api\/sessions\/([^/]+)\/ws$/)
    if (request.method === 'GET' && wsMatch) {
      const sessionId = wsMatch[1]
      const role = url.searchParams.get('role')

      if (role !== 'host' && role !== 'viewer') {
        return jsonResponse({ error: 'Invalid role', code: 'INVALID_ROLE' }, 400, request)
      }

      const doId = env.SESSION_ROOM.idFromName(sessionId)
      const stub = env.SESSION_ROOM.get(doId)

      // Forward the request to the DO for WS upgrade
      return stub.fetch(request)
    }

    return jsonResponse({ error: 'Not found' }, 404, request)
  },
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd worker && npx tsc --noEmit
# Expected: no errors (or only type stubs needed)
```

- [ ] **Step 3: Commit**

```bash
cd worker && git add -A && git commit -m "feat: implement Worker HTTP routing, CORS, and rate limiting"
```

---

### Task 3: Implement SessionRoom Durable Object

**Files:**
- Modify: `worker/src/session.ts`

- [ ] **Step 1: Implement the full SessionRoom class**

Replace `worker/src/session.ts` with:

```ts
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
```

- [ ] **Step 2: Verify it compiles**

```bash
cd worker && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 3: Commit**

```bash
cd worker && git add -A && git commit -m "feat: implement SessionRoom Durable Object with WebSocket relay"
```

---

### Task 4: Manual smoke test of the Worker

- [ ] **Step 1: Start wrangler dev**

```bash
cd worker && pnpm dev
```

- [ ] **Step 2: Test session creation**

```bash
curl -X POST http://localhost:8787/api/sessions
# Expected: 201 with JSON { sessionId: "...", hostToken: "...", url: "http://localhost:5173/#/s/..." }
```

- [ ] **Step 3: Test rate limiting (send 6 requests quickly)**

```bash
for i in {1..6}; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8787/api/sessions; done
# Expected: first 5 return 201, 6th returns 429
```

- [ ] **Step 4: Test 404 for unknown routes**

```bash
curl http://localhost:8787/unknown
# Expected: 404
```

- [ ] **Step 5: Commit (no changes, just verification)**

No commit needed — this was a manual verification step.

---

## Chunk 2: Frontend — Routing and Viewer Page

### Task 5: Update router to support viewer route

**Files:**
- Modify: `src/hooks/useRouter.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `useRouter.ts` to handle `#/s/:id` route**

Replace the entire file `src/hooks/useRouter.ts`:

```ts
import { useState, useEffect, useCallback } from 'react'

export type Route =
  | { page: 'terminal' }
  | { page: 'flash' }
  | { page: 'viewer'; sessionId: string }

function parseHash(): Route {
  const hash = window.location.hash

  // Match #/s/{sessionId}
  const viewerMatch = hash.match(/^#\/s\/([a-f0-9-]+)$/)
  if (viewerMatch) {
    return { page: 'viewer', sessionId: viewerMatch[1] }
  }

  if (hash === '#/flash') {
    return { page: 'flash' }
  }

  return { page: 'terminal' }
}

export function useRouter() {
  const [route, setRoute] = useState<Route>(parseHash)

  useEffect(() => {
    const handleHashChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigate = useCallback((path: string) => {
    window.location.hash = path === '/' ? '' : `#${path}`
  }, [])

  return { route, navigate }
}
```

- [ ] **Step 2: Update `src/App.tsx` to render ViewerPage outside SidebarProvider**

Replace `src/App.tsx`:

```tsx
import '@/i18n'
import { Toaster } from '@/components/ui/sonner'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useRouter } from '@/hooks/useRouter'
import { TerminalPage, FlashPage, ViewerPage } from '@/pages'

function App() {
  const { route } = useRouter()

  // Viewer page renders outside SidebarProvider
  if (route.page === 'viewer') {
    return (
      <>
        <ViewerPage sessionId={route.sessionId} />
        <Toaster />
      </>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      {route.page === 'flash' ? <FlashPage /> : <TerminalPage />}
      <Toaster />
    </SidebarProvider>
  )
}

export default App
```

- [ ] **Step 3: Create placeholder `src/pages/ViewerPage.tsx`**

```tsx
interface ViewerPageProps {
  sessionId: string
}

export function ViewerPage({ sessionId }: ViewerPageProps) {
  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground">Viewer session: {sessionId}</p>
    </div>
  )
}
```

- [ ] **Step 4: Add ViewerPage to barrel export `src/pages/index.ts`**

Add to the end of `src/pages/index.ts`:

```ts
export { ViewerPage } from './ViewerPage'
```

And update the import in `src/App.tsx` to use the barrel:

```ts
import { TerminalPage, FlashPage, ViewerPage } from '@/pages'
```

(Remove the direct `import { ViewerPage } from '@/pages/ViewerPage'` line.)

- [ ] **Step 5: Verify the app compiles**

```bash
pnpm build
# Expected: no errors
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useRouter.ts src/App.tsx src/pages/ViewerPage.tsx src/pages/index.ts
git commit -m "feat: add viewer route and update App to render ViewerPage outside sidebar"
```

---

### Task 6: Implement useViewerSession hook

**Files:**
- Create: `src/hooks/useViewerSession.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useViewerSession.ts`:

```ts
import { useState, useEffect, useRef, useCallback } from 'react'

export type ViewerStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface ViewerSessionResult {
  status: ViewerStatus
  error: string | null
  onData: (callback: (data: string) => void) => void
}

function getApiBase(): string {
  if (window.location.hostname === 'localhost') {
    return `ws://${window.location.host}`
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
    const wsUrl = `${getApiBase()}/api/sessions/${sessionId}/ws?role=viewer`
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
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm build
# Expected: no errors
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useViewerSession.ts
git commit -m "feat: add useViewerSession hook for viewer WebSocket connection"
```

---

### Task 7: Implement ViewerPage with readonly xterm.js

**Files:**
- Modify: `src/pages/ViewerPage.tsx`

- [ ] **Step 1: Implement the full ViewerPage**

Replace `src/pages/ViewerPage.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useViewerSession, ViewerStatus } from '@/hooks/useViewerSession'
import '@xterm/xterm/css/xterm.css'

interface ViewerPageProps {
  sessionId: string
}

function StatusBar({ status, error }: { status: ViewerStatus; error: string | null }) {
  const statusConfig: Record<ViewerStatus, { label: string; color: string }> = {
    connecting: { label: 'Connecting...', color: 'bg-yellow-500' },
    connected: { label: 'Live session from remote device', color: 'bg-green-500' },
    disconnected: { label: error || 'Disconnected', color: 'bg-gray-500' },
    error: { label: error || 'Error', color: 'bg-red-500' },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b bg-background">
      <div className={`w-2 h-2 rounded-full ${config.color} ${status === 'connected' ? 'animate-pulse' : ''}`} />
      <span className="text-sm text-muted-foreground">{config.label}</span>
      <span className="ml-auto text-xs text-muted-foreground">WebUART Remote Viewer</span>
    </div>
  )
}

export function ViewerPage({ sessionId }: ViewerPageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const { status, error, onData } = useViewerSession(sessionId)

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return

    const terminal = new Terminal({
      fontSize: 14,
      fontFamily: 'Consolas, Monaco, monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#f5f5f5',
        cursor: '#f5f5f5',
      },
      cursorBlink: false,
      scrollback: 100000,
      convertEol: true,
      disableStdin: true,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())
    terminal.open(containerRef.current)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    setTimeout(() => {
      try { fitAddon.fit() } catch { /* ignore */ }
    }, 100)

    const resizeHandler = () => {
      try { fitAddonRef.current?.fit() } catch { /* ignore */ }
    }
    window.addEventListener('resize', resizeHandler)

    return () => {
      window.removeEventListener('resize', resizeHandler)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  // Subscribe to incoming data
  useEffect(() => {
    onData((data: string) => {
      terminalRef.current?.write(data)
    })
  }, [onData])

  return (
    <div className="flex flex-col h-screen bg-background">
      <StatusBar status={status} error={error} />
      <div className="flex-1 min-h-0 p-2">
        <div
          ref={containerRef}
          className="h-full w-full rounded-md overflow-hidden bg-[#1a1a1a]"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm build
# Expected: no errors
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/ViewerPage.tsx
git commit -m "feat: implement ViewerPage with readonly xterm.js and status bar"
```

---

## Chunk 3: Frontend — Host Sharing UI

### Task 8: Implement useShareSession hook

**Files:**
- Create: `src/hooks/useShareSession.ts`

- [ ] **Step 1: Create the hook**

Create `src/hooks/useShareSession.ts`:

```ts
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
    return window.location.origin
  }
  return 'https://api.webuart.app'
}

function getWsBase(): string {
  if (window.location.hostname === 'localhost') {
    return `ws://${window.location.host}`
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

      // Connect WebSocket as host
      const wsUrl = `${getWsBase()}/api/sessions/${sessionId}/ws?role=host&token=${hostToken}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('sharing')

        // Start ping interval
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
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
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
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm build
# Expected: no errors
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useShareSession.ts
git commit -m "feat: add useShareSession hook for host-side WebSocket sharing"
```

---

### Task 9: Implement ShareSession component

**Files:**
- Create: `src/components/ShareSession.tsx`
- Modify: `src/components/index.ts`
- Modify: `src/pages/TerminalPage.tsx`
- Modify: `src/i18n/locales/en.json`

- [ ] **Step 1: Add i18n keys to `src/i18n/locales/en.json`**

Add the following section after `"logRecords"` and before `"header"`:

```json
"shareSession": {
  "title": "Share Session",
  "startSharing": "Start Sharing",
  "stopSharing": "Stop Sharing",
  "copyLink": "Copy Link",
  "copied": "Link copied!",
  "waitingForViewer": "Waiting for viewer...",
  "viewerConnected": "Viewer connected",
  "viewerDisconnected": "Viewer disconnected",
  "creating": "Creating session...",
  "error": "Sharing failed",
  "limitReached": "Session limit reached"
},
```

- [ ] **Step 2: Create `src/components/ShareSession.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share2, Copy, Check, StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSerialStore } from '@/store/serialStore'
import { useShareSession } from '@/hooks/useShareSession'

export function ShareSession() {
  const { t } = useTranslation()
  const isConnected = useSerialStore((state) => state.isConnected)
  const { status, viewerState, shareUrl, error, startSharing, stopSharing } = useShareSession()
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isConnected) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        {t('shareSession.title')}
      </h3>

      {status === 'idle' && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={startSharing}
        >
          <Share2 className="h-3.5 w-3.5 mr-1.5" />
          {t('shareSession.startSharing')}
        </Button>
      )}

      {status === 'creating' && (
        <p className="text-xs text-muted-foreground">{t('shareSession.creating')}</p>
      )}

      {status === 'sharing' && (
        <div className="space-y-2">
          {/* Share URL */}
          <div className="flex items-center gap-1">
            <code className="flex-1 text-[10px] bg-muted p-1.5 rounded truncate block">
              {shareUrl}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={copyLink}
              title={t('shareSession.copyLink')}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {/* Viewer status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                viewerState === 'connected'
                  ? 'bg-green-500'
                  : 'bg-yellow-500 animate-pulse'
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {viewerState === 'connected'
                ? t('shareSession.viewerConnected')
                : t('shareSession.waitingForViewer')}
            </span>
          </div>

          {/* Stop button */}
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={stopSharing}
          >
            <StopCircle className="h-3.5 w-3.5 mr-1.5" />
            {t('shareSession.stopSharing')}
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-1">
          <p className="text-xs text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={startSharing}
          >
            <Share2 className="h-3.5 w-3.5 mr-1.5" />
            {t('shareSession.startSharing')}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Export from `src/components/index.ts`**

Add to the end of `src/components/index.ts`:

```ts
export { ShareSession } from './ShareSession'
```

- [ ] **Step 4: Add `<ShareSession />` to `TerminalPage.tsx` sidebar**

In `src/pages/TerminalPage.tsx`, add the import:

```ts
import { ShareSession } from '@/components'
```

And add `<ShareSession />` after `<LogRecords />` in the sidebar (line 91):

```tsx
<LogRecords />
<ShareSession />
```

- [ ] **Step 5: Verify it compiles**

```bash
pnpm build
# Expected: no errors
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ShareSession.tsx src/components/index.ts src/pages/TerminalPage.tsx src/i18n/locales/en.json
git commit -m "feat: add ShareSession component with share UI in sidebar"
```

---

## Chunk 4: Vite Proxy and Integration

### Task 10: Add Vite dev proxy for Worker API

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add proxy config to `vite.config.ts`**

Add `server` section to the Vite config:

```ts
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        ws: true,
      },
    },
  },
})
```

- [ ] **Step 2: Verify vite starts with proxy**

```bash
pnpm dev
# Expected: Vite starts without errors, proxy configured
```

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add Vite dev proxy to forward /api requests to Worker"
```

---

### Task 11: End-to-end manual smoke test

- [ ] **Step 1: Start both dev servers**

Terminal 1:
```bash
cd worker && pnpm dev
```

Terminal 2:
```bash
pnpm dev
```

- [ ] **Step 2: Test the full flow**

1. Open `http://localhost:5173` in the browser
2. Connect a serial device (or use a virtual serial port)
3. Click "Start Sharing" in the sidebar — verify a link appears
4. Copy the link, open in a new browser tab — verify ViewerPage loads with status bar
5. Send data through the serial port — verify it appears on both tabs
6. Click "Stop Sharing" — verify viewer shows "Session ended by host"

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete session sharing feature (v1)"
```
