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
