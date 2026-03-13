import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { saveAs } from 'file-saver'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { Terminal } from '@xterm/xterm'
import type { ReactNode } from 'react'

interface TerminalToolbarProps {
  terminalRef: React.RefObject<Terminal | null>
  followLogs: boolean
  onFollowLogsChange: (value: boolean) => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
  exportFilename?: string
  /** Extra controls rendered before Follow toggle */
  leading?: ReactNode
}

export function TerminalToolbar({
  terminalRef,
  followLogs,
  onFollowLogsChange,
  isFullscreen,
  onToggleFullscreen,
  exportFilename = 'serial-logs',
  leading,
}: TerminalToolbarProps) {
  const { t } = useTranslation()

  const clearTerminal = useCallback(() => {
    terminalRef.current?.clear()
  }, [terminalRef])

  const exportLogs = useCallback(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    const buffer = terminal.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i)
      if (line) lines.push(line.translateToString().trim())
    }

    const content = lines.join('\n').replace(/\[\d+(?:;\d+)*m/g, '')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    saveAs(blob, `${exportFilename}-${new Date().toISOString()}.txt`)
  }, [terminalRef, exportFilename])

  return (
    <div className="py-1.5 px-3 flex justify-end items-center gap-1 flex-shrink-0 border-b">
      {leading}
      <div className="flex items-center gap-1.5 mr-2">
        <Switch
          id="follow-logs"
          checked={followLogs}
          onCheckedChange={onFollowLogsChange}
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
        title={isFullscreen ? t('serialMonitor.minimize') : t('serialMonitor.maximize')}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>
    </div>
  )
}
