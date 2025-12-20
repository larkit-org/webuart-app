import { useFlashStore } from '@/store/flashStore'
import { Progress } from '@/components/ui/progress'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FlashProgress() {
  const { t } = useTranslation()
  const progress = useFlashStore((state) => state.progress)

  if (progress.status === 'idle') {
    return null
  }

  const isActive = ['connecting', 'detecting', 'erasing', 'flashing', 'verifying'].includes(
    progress.status
  )
  const isSuccess = progress.status === 'success'
  const isError = progress.status === 'error'

  return (
    <div className="space-y-3 p-4 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2">
        {isActive && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {isSuccess && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {isError && <AlertCircle className="h-4 w-4 text-destructive" />}
        <span
          className={cn(
            'text-sm font-medium',
            isSuccess && 'text-green-500',
            isError && 'text-destructive'
          )}
        >
          {progress.message || getStatusMessage(progress.status, t)}
        </span>
      </div>

      {(progress.status === 'flashing' || progress.status === 'verifying') && (
        <>
          <Progress value={progress.percentage} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {progress.totalFiles > 1 &&
                t('flash.progress.file', 'File {{current}}/{{total}}', {
                  current: progress.currentFile + 1,
                  total: progress.totalFiles,
                })}
            </span>
            <span>{progress.percentage}%</span>
          </div>
        </>
      )}
    </div>
  )
}

function getStatusMessage(
  status: string,
  t: (key: string, defaultValue: string) => string
): string {
  switch (status) {
    case 'connecting':
      return t('flash.progress.connecting', 'Connecting...')
    case 'detecting':
      return t('flash.progress.detecting', 'Detecting chip...')
    case 'erasing':
      return t('flash.progress.erasing', 'Erasing flash...')
    case 'flashing':
      return t('flash.progress.flashing', 'Flashing...')
    case 'verifying':
      return t('flash.progress.verifying', 'Verifying...')
    case 'success':
      return t('flash.progress.success', 'Flash complete!')
    case 'error':
      return t('flash.progress.error', 'Flash failed')
    default:
      return ''
  }
}
