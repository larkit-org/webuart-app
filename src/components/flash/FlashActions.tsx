import { useFlashStore } from '@/store/flashStore'
import { useSerialStore } from '@/store/serialStore'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Plug, Unplug, Zap, Search, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function FlashActions() {
  const { t } = useTranslation()
  const isConnected = useFlashStore((state) => state.isConnected)
  const isFlashing = useFlashStore((state) => state.isFlashing)
  const files = useFlashStore((state) => state.files)
  const mode = useFlashStore((state) => state.config.mode)
  const chipInfo = useFlashStore((state) => state.chipInfo)
  const progress = useFlashStore((state) => state.progress)

  const connect = useFlashStore((state) => state.connect)
  const disconnect = useFlashStore((state) => state.disconnect)
  const detectChip = useFlashStore((state) => state.detectChip)
  const startFlash = useFlashStore((state) => state.startFlash)

  // Check if terminal is using the serial port
  const terminalConnected = useSerialStore((state) => state.isConnected)

  const handleConnect = async () => {
    if (terminalConnected) {
      toast.error(t('flash.errors.portInUse', 'Serial port is in use by terminal. Please disconnect first.'))
      return
    }

    try {
      await connect()
      toast.success(t('flash.messages.connected', 'Connected'))

      // Auto-detect chip after connecting in ESP mode
      if (mode === 'esp') {
        const chip = await detectChip()
        if (chip) {
          toast.success(t('flash.messages.chipDetected', 'Chip detected: {{chip}}', { chip: chip.chipName }))
        }
      }
    } catch {
      toast.error(t('flash.errors.connectionFailed', 'Connection failed'))
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
    toast.success(t('flash.messages.disconnected', 'Disconnected'))
  }

  const handleDetectChip = async () => {
    const chip = await detectChip()
    if (chip) {
      toast.success(t('flash.messages.chipDetected', 'Chip detected: {{chip}}', { chip: chip.chipName }))
    }
  }

  const handleFlash = async () => {
    if (files.length === 0) {
      toast.error(t('flash.errors.noFiles', 'Please select a firmware file'))
      return
    }

    await startFlash()
  }

  const isDetecting = progress.status === 'detecting'
  const canFlash = isConnected && files.length > 0 && !isFlashing

  return (
    <div className="flex flex-wrap gap-2">
      {!isConnected ? (
        <Button onClick={handleConnect} disabled={terminalConnected} className="gap-2">
          <Plug className="h-4 w-4" />
          {t('flash.actions.connect', 'Connect')}
        </Button>
      ) : (
        <>
          <Button variant="outline" onClick={handleDisconnect} disabled={isFlashing} className="gap-2">
            <Unplug className="h-4 w-4" />
            {t('flash.actions.disconnect', 'Disconnect')}
          </Button>

          {mode === 'esp' && !chipInfo && (
            <Button
              variant="secondary"
              onClick={handleDetectChip}
              disabled={isFlashing || isDetecting}
              className="gap-2"
            >
              {isDetecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {t('flash.actions.detectChip', 'Detect Chip')}
            </Button>
          )}

          <Button
            onClick={handleFlash}
            disabled={!canFlash}
            className="gap-2"
          >
            {isFlashing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {isFlashing
              ? t('flash.actions.flashing', 'Flashing...')
              : t('flash.actions.flash', 'Flash')}
          </Button>
        </>
      )}

      {terminalConnected && !isConnected && (
        <p className="w-full text-xs text-amber-500">
          {t('flash.errors.portInUse', 'Serial port is in use by terminal. Please disconnect first.')}
        </p>
      )}
    </div>
  )
}
