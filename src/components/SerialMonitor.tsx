import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { saveAs } from 'file-saver'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
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
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [followLogs, setFollowLogs] = useState(true)
  const followLogsRef = useRef(followLogs)

  // Keep ref in sync with state
  useEffect(() => {
    followLogsRef.current = followLogs
  }, [followLogs])

  const sendData = useSerialStore((state) => state.sendData)
  const addEventListener = useSerialStore((state) => state.addEventListener)
  const removeEventListener = useSerialStore((state) => state.removeEventListener)

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

    // Fit after a small delay
    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch {
        // Ignore
      }
    }, 100)

    // Handle keyboard input
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

    // Handle incoming data
    const handleData = (event: SerialEvent) => {
      if (event.data && terminalRef.current) {
        terminalRef.current.write(event.data as string)
        if (followLogsRef.current) {
          terminalRef.current.scrollToBottom()
        }
      }
    }

    addEventListener('data', handleData)

    // Handle resize
    const resizeHandler = () => {
      try {
        fitAddonRef.current?.fit()
      } catch {
        // Ignore
      }
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

  // Handle fullscreen/resize state change - refit terminal
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        fitAddonRef.current?.fit()
      } catch {
        // Ignore
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [isFullscreen, resizeTrigger])

  const clearTerminal = () => {
    terminalRef.current?.clear()
  }

  const exportLogs = () => {
    const terminal = terminalRef.current
    if (!terminal) return

    const buffer = terminal.buffer.active
    const lineCount = buffer.length
    const lines: string[] = []

    for (let i = 0; i < lineCount; i++) {
      const line = buffer.getLine(i)
      if (line) {
        lines.push(line.translateToString().trim())
      }
    }

    const content = lines.join('\n').replace(/\[\d+(?:;\d+)*m/g, '')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, `serial-logs-${new Date().toISOString()}.txt`)
  }

  return (
    <Card className="h-full w-full flex flex-col overflow-hidden">
      <div className="py-1.5 px-3 flex justify-end items-center gap-1 flex-shrink-0 border-b">
        <div className="flex items-center gap-1.5 mr-2">
          <Switch
            id="follow-logs"
            checked={followLogs}
            onCheckedChange={setFollowLogs}
            className="scale-90"
          />
          <Label htmlFor="follow-logs" className="text-xs">
            {t('serialMonitor.followLogs')}
          </Label>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearTerminal}>
          {t('serialMonitor.clear')}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={exportLogs}>
          {t('serialMonitor.export')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggleFullscreen}
          title={
            isFullscreen
              ? t('serialMonitor.minimize')
              : t('serialMonitor.maximize')
          }
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>
      <CardContent className="flex-1 p-2 pt-0 min-h-0 relative">
        <div
          ref={containerRef}
          className="absolute inset-0 m-2 mt-0 rounded-md overflow-hidden bg-[#1a1a1a]"
        />
      </CardContent>
    </Card>
  )
}
