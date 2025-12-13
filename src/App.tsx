import '@/i18n'
import { useState, useEffect, useCallback } from 'react'
import {
  AppHeader,
  SerialConnect,
  SerialMonitor,
  SerialSender,
  QuickCommands,
  TimedCommands,
  LogRecords,
  Footer,
} from '@/components'
import { Toaster } from '@/components/ui/sonner'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { PanelRightOpen } from 'lucide-react'

function MainContent() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const { open, setOpen } = useSidebar()
  const [triggerResize, setTriggerResize] = useState(0)

  const handleToggleFullscreen = useCallback(() => {
    const newFullscreen = !isFullscreen
    setIsFullscreen(newFullscreen)
    setOpen(!newFullscreen)
  }, [isFullscreen, setOpen])

  // Trigger resize when sidebar state changes
  useEffect(() => {
    const timer = setTimeout(() => {
      setTriggerResize(prev => prev + 1)
    }, 300) // Wait for sidebar animation
    return () => clearTimeout(timer)
  }, [open])

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false)
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isFullscreen, setOpen])

  return (
    <SidebarInset>
      {!isFullscreen && (
        <header className="flex h-12 shrink-0 items-center border-b px-4">
          <AppHeader>
            <SidebarTrigger className="md:hidden">
              <PanelRightOpen className="h-5 w-5" />
            </SidebarTrigger>
          </AppHeader>
        </header>
      )}
      <div className="flex flex-1 flex-col gap-3 p-3 overflow-hidden min-h-0">
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <SerialMonitor
            isFullscreen={isFullscreen}
            onToggleFullscreen={handleToggleFullscreen}
            resizeTrigger={triggerResize}
          />
        </div>
        {!isFullscreen && (
          <div className="flex-shrink-0">
            <SerialSender />
          </div>
        )}
      </div>
      {!isFullscreen && <Footer />}
    </SidebarInset>
  )
}

function App() {
  return (
    <SidebarProvider defaultOpen={true}>
      <MainContent />
      <Sidebar side="right" className="border-l">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent className="p-3 space-y-3">
              <SerialConnect />
              <QuickCommands />
              <TimedCommands />
              <LogRecords />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <Toaster />
    </SidebarProvider>
  )
}

export default App
