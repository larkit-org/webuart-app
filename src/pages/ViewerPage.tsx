import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useViewerSession, type ViewerStatus } from '@/hooks/useViewerSession'
import { Card, CardContent } from '@/components/ui/card'
import { TerminalToolbar } from '@/components/TerminalToolbar'
import { Footer } from '@/components/Footer'
import { ThemeToggle } from '@/components/ThemeToggle'
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
    <header className="flex items-center gap-2 h-12 px-4 border-b bg-background shrink-0">
      <a href="/" className="flex items-center gap-2 hover:opacity-80" onClick={(e) => { e.preventDefault(); window.location.hash = '' }}>
        <img src="/logo.png" alt="WebUART" className="w-5 h-5 dark:invert" />
        <span className="text-sm font-semibold hidden sm:inline">WebUART</span>
      </a>
      <div className="w-px h-4 bg-border mx-1" />
      <div className={`w-2 h-2 rounded-full ${config.color} ${status === 'connected' ? 'animate-pulse' : ''}`} />
      <span className="text-sm text-muted-foreground">{config.label}</span>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden sm:inline">Remote Viewer</span>
        <ThemeToggle />
      </div>
    </header>
  )
}

export function ViewerPage({ sessionId }: ViewerPageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const { status, error, onData } = useViewerSession(sessionId)
  const [followLogs, setFollowLogs] = useState(true)
  const followLogsRef = useRef(followLogs)

  useEffect(() => { followLogsRef.current = followLogs }, [followLogs])

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
      if (followLogsRef.current) {
        terminalRef.current?.scrollToBottom()
      }
    })
  }, [onData])

  return (
    <div className="flex flex-col h-screen bg-background">
      <StatusBar status={status} error={error} />
      <div className="flex flex-1 flex-col gap-3 p-3 overflow-hidden min-h-0">
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <TerminalToolbar
            terminalRef={terminalRef}
            followLogs={followLogs}
            onFollowLogsChange={setFollowLogs}
            exportFilename="remote-session"
          />
          <CardContent className="flex-1 p-2 pt-0 min-h-0 relative">
            <div
              ref={containerRef}
              className="absolute inset-0 m-2 mt-0 rounded-md overflow-hidden bg-[#1a1a1a]"
            />
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  )
}
