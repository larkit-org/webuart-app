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
