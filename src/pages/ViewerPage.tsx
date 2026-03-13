import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useViewerSession, type ViewerStatus } from '@/hooks/useViewerSession'
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
