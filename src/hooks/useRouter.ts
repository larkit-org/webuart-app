import { useState, useEffect, useCallback } from 'react'

export type Route = '/' | '/flash'

export function useRouter() {
  const getRouteFromHash = (): Route => {
    const hash = window.location.hash
    if (hash === '#/flash') return '/flash'
    return '/'
  }

  const [route, setRoute] = useState<Route>(getRouteFromHash)

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(getRouteFromHash())
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigate = useCallback((path: Route) => {
    window.location.hash = path === '/' ? '' : `#${path}`
  }, [])

  return { route, navigate }
}
