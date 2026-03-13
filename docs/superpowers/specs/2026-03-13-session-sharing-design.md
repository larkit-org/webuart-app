# Session Sharing via Secret Link

## Overview

Allow a WebUART host to share their live terminal session with a colleague by generating a secret URL. The viewer opens the link and sees the terminal output in real time via WebSocket, relayed through a Cloudflare Durable Object.

## Constraints

- 1:1 sharing only (one host, one viewer per session)
- Share terminal logs only (not config, commands, or connection settings)
- No authentication — knowledge of the link grants access
- No persistence — session lives only while the host is connected
- Cloudflare Workers Paid plan required (Durable Objects)

## Architecture

```
Host (browser)                    Cloudflare                      Viewer (browser)
+------------+     WebSocket     +----------------+   WebSocket   +------------+
| WebSerial  | ---- data -----> | Durable Object | ---- data --> | xterm.js   |
| Terminal   |                  |  (SessionRoom) |              | readonly   |
|            | <-- viewer       |                |              |            |
|            |    connected --- |  buffer[500]   | <-- connect  |            |
+------------+                  +----------------+              +------------+
                                       |
                                Worker (HTTP)
                                POST /api/sessions -> create DO, return sessionId
                                GET  /api/sessions/:id/ws -> validate, upgrade to WS
```

### Lifecycle

1. Host clicks "Start Sharing" -> `POST /api/sessions` -> Worker creates Durable Object, generates `sessionId` (nanoid, 21 chars) -> returns secret link `https://webuart.app/s/{sessionId}`
2. Host connects via WebSocket to DO as `role=host`, starts streaming terminal data
3. Viewer opens link -> frontend detects `/s/{sessionId}` route -> connects via WebSocket to DO as `role=viewer`
4. DO sends viewer the buffer (last 500 lines), then relays new data in real time
5. Host clicks "Stop Sharing" or closes tab -> DO closes both connections, session destroyed

## API

### HTTP Endpoints (Worker)

```
POST /api/sessions
  Response: { sessionId: "abc123...", url: "https://webuart.app/s/abc123..." }

GET /api/sessions/:sessionId/ws?role=host|viewer
  Upgrade to WebSocket
```

### WebSocket Messages (JSON)

```
// Host -> DO
{ type: "data", payload: "log line\n" }

// DO -> Viewer
{ type: "history", payload: ["line1", "line2", ...] }   // on connect
{ type: "data", payload: "log line\n" }                  // realtime relay

// DO -> Host
{ type: "viewer_connected" }
{ type: "viewer_disconnected" }

// DO -> both
{ type: "session_closed" }
```

### DO Rules

- Accepts exactly 1 host and 1 viewer
- Host disconnects -> sends `session_closed` to viewer, DO dies
- Viewer disconnects -> sends `viewer_disconnected` to host, DO stays alive (host can re-share the link)
- Viewer reconnecting is allowed (receives fresh buffer)

## Backend Structure

```
worker/
  src/
    index.ts          # Worker entry: HTTP routing + WS upgrade
    session.ts        # Durable Object class SessionRoom
  wrangler.toml
  package.json
  tsconfig.json
```

### SessionRoom (Durable Object)

State:
- `hostWs: WebSocket | null`
- `viewerWs: WebSocket | null`
- `buffer: string[]` (max 500, ring buffer)

Behavior:
- On `webSocketMessage` from host: push to buffer, forward to viewer
- On `webSocketClose` from host: notify viewer with `session_closed`, DO ready for GC
- On `webSocketClose` from viewer: notify host with `viewer_disconnected`

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

`Access-Control-Allow-Origin: https://webuart.app`

### Domain

API served from `api.webuart.app` (custom domain for Worker).

## Frontend Changes

### New Files

- `src/pages/ViewerPage.tsx` — viewer page (readonly xterm.js terminal + status bar)
- `src/components/ShareSession.tsx` — share controls in host sidebar
- `src/hooks/useShareSession.ts` — host-side WebSocket logic (create session, stream data, handle viewer status)
- `src/hooks/useViewerSession.ts` — viewer-side WebSocket logic (connect, receive history + live data)

### Modified Files

- `src/hooks/useRouter.ts` — add route `/s/:id`
- `src/pages/TerminalPage.tsx` — add `<ShareSession />` to sidebar
- `src/store/serialStore.ts` — add callback to intercept terminal data for streaming to WS

### Host UI (TerminalPage sidebar)

- "Share Session" section appears when serial port is connected
- "Start Sharing" button -> generates link, shows it with copy button
- Status indicator: "Waiting for viewer..." / "Viewer connected"
- "Stop Sharing" button -> ends session

### Viewer UI (`/s/{sessionId}`)

- Minimal page: xterm.js terminal (readonly) + status bar at top
- Status bar: "Live session from remote device" + connection indicator
- No sidebar, no connection buttons — view only
- On `session_closed`: message "Session ended by host"

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
