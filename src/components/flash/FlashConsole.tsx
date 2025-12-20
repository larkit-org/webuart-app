import { useFlashStore } from '@/store/flashStore'
import { useTranslation } from 'react-i18next'
import { useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function FlashConsole() {
  const { t } = useTranslation()
  const logs = useFlashStore((state) => state.logs)
  const clearLogs = useFlashStore((state) => state.clearLogs)
  const [isExpanded, setIsExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, isExpanded])

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join('\n'))
  }

  if (logs.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between p-2 border-b">
        <button
          className="flex items-center gap-2 text-sm font-medium hover:text-primary"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {t('flash.console.title', 'Console Output')}
          <span className="text-xs text-muted-foreground">({logs.length})</span>
        </button>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearLogs}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className={cn(
          'font-mono text-xs overflow-auto transition-all duration-200',
          isExpanded ? 'max-h-48 p-3' : 'max-h-0 p-0'
        )}
        style={{ backgroundColor: '#1a1a1a' }}
      >
        {logs.map((log, index) => (
          <div key={index} className="text-green-400 whitespace-pre-wrap">
            {log}
          </div>
        ))}
      </div>
    </div>
  )
}
