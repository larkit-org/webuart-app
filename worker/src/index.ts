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

// Simple in-memory rate limit (best-effort, resets on redeploy)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

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
      const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1'
      if (!checkRateLimit(ip)) {
        return jsonResponse({ error: 'Rate limit exceeded' }, 429, request)
      }

      const sessionId = crypto.randomUUID()
      const hostToken = crypto.randomUUID()

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
