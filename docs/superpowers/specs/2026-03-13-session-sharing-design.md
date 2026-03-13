# Session Sharing via Secret Link

## Overview

Allow a WebUART host to share their live terminal session with a colleague by generating a secret URL. The viewer opens the link and sees the terminal output in real time via WebSocket, relayed through a Cloudflare Durable Object.

## Constraints

- 1:1 sharing only (one host, one viewer per session)
- Share terminal logs only (not config, commands, or connection settings)
- No authentication — knowledge of the link grants viewer access; host uses a `hostToken` returned at session creation
- No persistence — session lives only while the host is connected
- Cloudflare Workers Paid plan required (Durable Objects)

## Limits & Throttling

Free anonymous sessions are subject to hard limits. When a limit is hit, the session is terminated with `{ type: "error", code: "LIMIT_REACHED", message: "..." }`.

| Limit                  | Value   | Notes                                         |
|------------------------|---------|-----------------------------------------------|
| Session data cap       | 100 KB  | Total bytes relayed from host. DO tracks cumulative size. |
| Max session duration   | 30 min  | Alarm-based auto-close.                       |
| Rate limit (create)    | 5/min per IP | Worker checks `cf-connecting-ip`.         |
| Max concurrent sessions per IP | 2 | Worker-level counter (best-effort).       |

> **Future:** When a limit is hit, the UI will suggest registration and a paid plan to unlock higher limits. For now, the session simply closes.

## Architecture

```
Host (browser)                    Cloudflare                      Viewer (browser)
+------------+     WebSocket     +----------------+   WebSocket   +------------+
| WebSerial  | ---- data -----> | Durable Object | ---- data --> | xterm.js   |
| Terminal   |                  |  (SessionRoom) |              | readonly   |
|            | <-- viewer       |                |              |            |
|            |    connected --- |  buffer[256KB] | <-- connect  |            |
+------------+                  +----------------+              +------------+
                                       |
                                Worker (HTTP)
                                POST /api/sessions -> create DO, return sessionId + hostToken
                                GET  /api/sessions/:id/ws?role=host&token=xxx -> upgrade to WS
                                GET  /api/sessions/:id/ws?role=viewer -> upgrade to WS
```

### Lifecycle

1. Host clicks "Start Sharing" -> `POST /api/sessions` -> Worker checks rate limit, creates Durable Object, generates `sessionId` (`crypto.randomUUID()`) and `hostToken` (separate UUID) -> returns `{ sessionId, hostToken, url: "https://webuart.app/#/s/{sessionId}" }`
2. Host connects via WebSocket to DO with `role=host&token={hostToken}`, starts streaming terminal data
3. Viewer opens link -> frontend detects `#/s/{sessionId}` route -> connects via WebSocket to DO with `role=viewer`
4. DO sends viewer the buffer (last data up to 256KB), then relays new data in real time
5. Host clicks "Stop Sharing" or closes tab -> DO closes both connections, session destroyed
6. If host goes silent for 60s (no data, no ping) -> DO auto-closes session

## API

### HTTP Endpoints (Worker)

```
POST /api/sessions
  Rate limit: 5/min per IP, max 2 concurrent per IP
  Response: { sessionId: "...", hostToken: "...", url: "https://webuart.app/#/s/..." }

GET /api/sessions/:sessionId/ws?role=host&token={hostToken}
  Upgrade to WebSocket (host only, token required)

GET /api/sessions/:sessionId/ws?role=viewer
  Upgrade to WebSocket (viewer, no token needed)

OPTIONS /api/*
  Preflight response with CORS headers
```

### WebSocket Messages (JSON)

```
// Host -> DO
{ type: "data", payload: "raw chunk from serial" }
{ type: "ping" }

// DO -> Host
{ type: "pong" }
{ type: "viewer_connected" }
{ type: "viewer_disconnected" }
{ type: "session_closed" }
{ type: "error", code: "LIMIT_REACHED", message: "Session data cap exceeded (100KB)" }

// DO -> Viewer
{ type: "history", payload: "<concatenated buffer>" }    // on connect, single string
{ type: "data", payload: "raw chunk from serial" }       // realtime relay
{ type: "session_closed" }
{ type: "error", code: "...", message: "..." }
```

### Error Codes

| Code                | Meaning                                   |
|---------------------|-------------------------------------------|
| `LIMIT_REACHED`     | Session data cap or duration exceeded     |
| `SESSION_NOT_FOUND` | Invalid sessionId                         |
| `HOST_EXISTS`       | A host is already connected               |
| `VIEWER_EXISTS`     | A viewer is already connected             |
| `INVALID_TOKEN`     | Wrong hostToken                           |
| `INVALID_ROLE`      | Role must be "host" or "viewer"           |

### DO Rules

- Accepts exactly 1 host and 1 viewer
- Host must provide valid `hostToken` on WS upgrade
- Host disconnects -> sends `session_closed` to viewer, DO dies
- Viewer disconnects -> sends `viewer_disconnected` to host, DO stays alive
- Viewer reconnecting is allowed (receives fresh buffer)
- Heartbeat: host sends `ping` every 30s, DO responds `pong`. If no message from host for 60s, DO auto-closes.
- DO tracks `totalBytes` relayed. When exceeding 100KB, sends `error` and closes.
- DO sets an alarm for max session duration (30 min).

## Backend Structure

```
worker/
  src/
    index.ts          # Worker entry: HTTP routing, rate limiting, CORS, WS upgrade
    session.ts        # Durable Object class SessionRoom
  wrangler.toml
  package.json
  tsconfig.json
```

### SessionRoom (Durable Object)

State:
- `hostWs: WebSocket | null`
- `viewerWs: WebSocket | null`
- `hostToken: string` — set on creation, verified on host WS upgrade
- `buffer: string[]` — ring buffer of recent data chunks (total size capped at 256KB)
- `totalBytes: number` — cumulative bytes relayed (for 100KB session cap)
- `lastHostMessage: number` — timestamp, for inactivity timeout

Behavior:
- On `webSocketMessage` from host: add `payload.length` to `totalBytes`, check cap, push to buffer (evict oldest if buffer > 256KB), forward to viewer
- On `webSocketClose` from host: notify viewer with `session_closed`, DO ready for GC
- On `webSocketClose` from viewer: notify host with `viewer_disconnected`
- Alarm (every 30s): check `lastHostMessage` for 60s inactivity timeout; check max duration

### wrangler.toml

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

### CORS

Worker handles CORS for all `/api/*` routes:
- `Access-Control-Allow-Origin: https://webuart.app`
- `Access-Control-Allow-Methods: POST, GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
- `OPTIONS` requests return 204 with headers above

In dev mode (`wrangler dev`), allow `http://localhost:5173` as origin.

### Domain

API served from `api.webuart.app` (custom domain for Worker).

## Frontend Changes

### New Files

- `src/pages/ViewerPage.tsx` — viewer page (readonly xterm.js terminal + status bar)
- `src/components/ShareSession.tsx` — share controls in host sidebar
- `src/hooks/useShareSession.ts` — host-side WebSocket logic (create session, stream data, handle viewer status, ping every 30s)
- `src/hooks/useViewerSession.ts` — viewer-side WebSocket logic (connect, receive history + live data)

### Modified Files

- `src/hooks/useRouter.ts` — add hash route `#/s/:id`
- `src/pages/TerminalPage.tsx` — add `<ShareSession />` to sidebar
- `src/App.tsx` — render `ViewerPage` outside `SidebarProvider` when on `#/s/:id` route

### No changes to serialStore.ts

The `useShareSession` hook subscribes to terminal data via the existing `addEventListener('data', handler)` on the serial store. No modifications to the store itself are needed.

### Host UI (TerminalPage sidebar)

- "Share Session" section appears when serial port is connected
- "Start Sharing" button -> generates link, shows it with copy button
- Status indicator: "Waiting for viewer..." / "Viewer connected"
- "Stop Sharing" button -> ends session
- On limit reached: shows message explaining session was capped

### Viewer UI (`#/s/{sessionId}`)

- Rendered outside SidebarProvider (no sidebar wrapper)
- Minimal page: xterm.js terminal (readonly) + status bar at top
- Status bar: "Live session from remote device" + connection indicator
- No sidebar, no connection buttons — view only
- On `session_closed`: message "Session ended by host"
- On `error`: show error message with code

## Dev Workflow

Frontend (Vite) runs on `localhost:5173`, Worker (wrangler dev) on `localhost:8787`.

Add Vite proxy for dev in `vite.config.ts`:
```ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8787',
      ws: true
    }
  }
}
```

This way the frontend uses relative `/api/...` paths in dev, and in production `api.webuart.app` is used (configurable via env var).

## Deploy

### worker/package.json scripts

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  }
}
```

### Root package.json convenience scripts

```json
{
  "scripts": {
    "worker:dev": "cd worker && wrangler dev",
    "worker:deploy": "cd worker && wrangler deploy"
  }
}
```

Frontend deploys via Cloudflare Pages (unchanged). Worker deploys separately via `pnpm worker:deploy`.

## Future Considerations

- **Monetization:** When session hits limits (100KB data cap, 30 min duration), prompt user to register and subscribe for higher limits. Registration + payment integration is out of scope for v1.
- **Multiple viewers:** Upgrade to 1:N broadcast if needed (DO already has the relay pattern).
- **Protocol versioning:** Add a `version` field to WS messages if frontend/worker deploy coordination becomes an issue.
