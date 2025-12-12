import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { saveAs } from 'file-saver'
import { Plus, Trash2, Download, StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSerialStore } from '@/store/serialStore'
import { serialDB } from '@/utils/db'
import type { LogFile } from '@/types'

export function LogRecords() {
  const { t } = useTranslation()
  const { isConnected, isLogRecording, startLogRecording, stopLogRecording } =
    useSerialStore()

  const [logFiles, setLogFiles] = useState<LogFile[]>([])
  const [isDeleteMode, setIsDeleteMode] = useState(false)

  const loadLogFiles = async () => {
    const files = await serialDB.getLogFiles()
    setLogFiles(files)
  }

  useEffect(() => {
    loadLogFiles()
    const interval = setInterval(loadLogFiles, 1000)
    return () => clearInterval(interval)
  }, [])

  const sortedLogFiles = [...logFiles].sort((a, b) => b.updatedAt - a.updatedAt)

  const mostRecentLogId =
    sortedLogFiles.length > 0
      ? Math.max(...sortedLogFiles.map((f) => f.id || 0))
      : -1

  const formatFileSize = (content: string[]): string => {
    const bytes = content.join('\n').length
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) {
      return t('logRecords.timeFormat.justNow')
    }

    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000)
      return t('logRecords.timeFormat.minutesAgo', { n: minutes })
    }

    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000)
      return t('logRecords.timeFormat.hoursAgo', { n: hours })
    }

    const days = Math.floor(diff / 86400000)
    return t('logRecords.timeFormat.daysAgo', { n: days })
  }

  const formatDisplayName = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString()
  }

  const downloadLog = (file: LogFile) => {
    const content = file.content.join('\n').replace(/\[\d+(?:;\d+)*m/g, '')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const timestamp = new Date(file.createdAt)
      .toISOString()
      .replace(/[:.]/g, '-')
    saveAs(blob, `SerialLog_${timestamp}.txt`)
  }

  const deleteLog = async (id: number) => {
    await serialDB.deleteLogFile(id)
    await loadLogFiles()
  }

  const toggleLogging = () => {
    if (isLogRecording) {
      stopLogRecording()
    } else {
      startLogRecording()
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('logRecords.title')}
        </h3>
        <div className="flex gap-1">
          {sortedLogFiles.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsDeleteMode(!isDeleteMode)}
              title={t('logRecords.deleteMode')}
            >
              <Trash2
                className={`h-3.5 w-3.5 ${isDeleteMode ? 'text-destructive' : ''}`}
              />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={toggleLogging}
            disabled={!isConnected}
            title={
              isLogRecording
                ? t('logRecords.stopRecording')
                : t('logRecords.startRecording')
            }
          >
            {isLogRecording ? (
              <StopCircle className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[140px]">
        <div className="space-y-1 pr-2">
          {sortedLogFiles.length > 0 ? (
            sortedLogFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-1.5 bg-muted/50 rounded text-xs gap-1"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-1">
                    {isLogRecording && file.id === mostRecentLogId && (
                      <div
                        className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse flex-shrink-0"
                        title={t('logRecords.recording')}
                      />
                    )}
                    <span className="truncate">
                      {formatDisplayName(file.createdAt)}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    {formatFileSize(file.content)} · {formatTimestamp(file.updatedAt)}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {isDeleteMode && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => file.id && deleteLog(file.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => downloadLog(file)}
                    title={t('logRecords.download')}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-2 text-center text-xs text-muted-foreground">
              {t('logRecords.noLogs')}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
