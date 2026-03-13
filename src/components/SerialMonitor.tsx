import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { TerminalToolbar } from '@/components/TerminalToolbar'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useSerialStore } from '@/store/serialStore'
import type { SerialEvent } from '@/types'
import '@xterm/xterm/css/xterm.css'

interface SerialMonitorProps {
  isFullscreen: boolean
  onToggleFullscreen: () => void
  resizeTrigger?: number
}

export function SerialMonitor({ isFullscreen, onToggleFullscreen, resizeTrigger }: SerialMonitorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [followLogs, setFollowLogs] = useState(true)
  const followLogsRef = useRef(followLogs)

  useEffect(() => { followLogsRef.current = followLogs }, [followLogs])

  const sendData = useSerialStore((state) => state.sendData)
  const addEventListener = useSerialStore((state) => state.addEventListener)
  const removeEventListener = useSerialStore((state) => state.removeEventListener)
  const showSendPanel = useSerialStore((state) => state.showSendPanel)
  const setShowSendPanel = useSerialStore((state) => state.setShowSendPanel)

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
      cursorBlink: true,
      scrollback: 100000,
      convertEol: true,
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

    terminal.onKey((e) => {
      if (useSerialStore.getState().isConnected) {
        sendData(e.key, 'RAW')
      }
    })

    terminal.onData((data) => {
      if (useSerialStore.getState().isConnected && data.length > 1) {
        sendData(data, 'ASCII')
      }
    })

    const handleData = (event: SerialEvent) => {
      if (event.data && terminalRef.current) {
        terminalRef.current.write(event.data as string)
        if (followLogsRef.current) {
          terminalRef.current.scrollToBottom()
        }
      }
    }

    addEventListener('data', handleData)

    const resizeHandler = () => {
      try { fitAddonRef.current?.fit() } catch { /* ignore */ }
    }
    window.addEventListener('resize', resizeHandler)

    return () => {
      window.removeEventListener('resize', resizeHandler)
      removeEventListener('data', handleData)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [sendData, addEventListener, removeEventListener])

  // Refit on fullscreen/resize
  useEffect(() => {
    const timer = setTimeout(() => {
      try { fitAddonRef.current?.fit() } catch { /* ignore */ }
    }, 50)
    return () => clearTimeout(timer)
  }, [isFullscreen, resizeTrigger])

  const sendToggle = (
    <div className="flex items-center gap-1.5 mr-2">
      <Switch
        id="show-send"
        checked={showSendPanel}
        onCheckedChange={setShowSendPanel}
        className="scale-90"
      />
      <Label htmlFor="show-send" className="text-xs">Send</Label>
    </div>
  )

  return (
    <Card className="h-full w-full flex flex-col overflow-hidden">
      <TerminalToolbar
        terminalRef={terminalRef}
        followLogs={followLogs}
        onFollowLogsChange={setFollowLogs}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        leading={sendToggle}
      />
      <CardContent className="flex-1 p-2 pt-0 min-h-0 relative">
        <div
          ref={containerRef}
          className="absolute inset-0 m-2 mt-0 rounded-md overflow-hidden bg-[#1a1a1a]"
        />
      </CardContent>
    </Card>
  )
}
