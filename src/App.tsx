import '@/i18n'
import { Toaster } from '@/components/ui/sonner'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useRouter } from '@/hooks/useRouter'
import { TerminalPage, FlashPage } from '@/pages'

function App() {
  const { route } = useRouter()

  return (
    <SidebarProvider defaultOpen={true}>
      {route === '/flash' ? <FlashPage /> : <TerminalPage />}
      <Toaster />
    </SidebarProvider>
  )
}

export default App
