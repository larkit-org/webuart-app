import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Share2, Copy, Check, StopCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSerialStore } from '@/store/serialStore'
import { useShareSession } from '@/hooks/useShareSession'

export function ShareSession() {
  const { t } = useTranslation()
  const isConnected = useSerialStore((state) => state.isConnected)
  const { status, viewerState, shareUrl, error, startSharing, stopSharing } = useShareSession()
  const [copied, setCopied] = useState(false)

  const copyLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isConnected) return null

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">
        {t('shareSession.title')}
      </h3>

      {status === 'idle' && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={startSharing}
        >
          <Share2 className="h-3.5 w-3.5 mr-1.5" />
          {t('shareSession.startSharing')}
        </Button>
      )}

      {status === 'creating' && (
        <p className="text-xs text-muted-foreground">{t('shareSession.creating')}</p>
      )}

      {status === 'sharing' && (
        <div className="space-y-2">
          {/* Share URL */}
          <div className="flex items-center gap-1">
            <code className="flex-1 text-[10px] bg-muted p-1.5 rounded truncate block">
              {shareUrl}
            </code>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={copyLink}
              title={t('shareSession.copyLink')}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          {/* Viewer status */}
          <div className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                viewerState === 'connected'
                  ? 'bg-green-500'
                  : 'bg-yellow-500 animate-pulse'
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {viewerState === 'connected'
                ? t('shareSession.viewerConnected')
                : t('shareSession.waitingForViewer')}
            </span>
          </div>

          {/* Stop button */}
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={stopSharing}
          >
            <StopCircle className="h-3.5 w-3.5 mr-1.5" />
            {t('shareSession.stopSharing')}
          </Button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-1">
          <p className="text-xs text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={startSharing}
          >
            <Share2 className="h-3.5 w-3.5 mr-1.5" />
            {t('shareSession.startSharing')}
          </Button>
        </div>
      )}
    </div>
  )
}
