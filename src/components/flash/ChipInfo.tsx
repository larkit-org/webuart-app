import { useFlashStore } from '@/store/flashStore'
import { useTranslation } from 'react-i18next'
import { Cpu, Wifi } from 'lucide-react'

export function ChipInfo() {
  const { t } = useTranslation()
  const chipInfo = useFlashStore((state) => state.chipInfo)

  if (!chipInfo) {
    return null
  }

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
      <Cpu className="h-6 w-6 text-green-500" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-green-600 dark:text-green-400">
            {chipInfo.chipName}
          </span>
          {chipInfo.features.includes('WiFi') && (
            <Wifi className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        {chipInfo.macAddress && (
          <p className="text-xs text-muted-foreground">
            {t('flash.chipInfo.mac', 'MAC')}: {chipInfo.macAddress}
          </p>
        )}
      </div>
    </div>
  )
}
