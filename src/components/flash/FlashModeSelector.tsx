import { useFlashStore } from '@/store/flashStore'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Cpu, FileCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FlashMode } from '@/types/flash'

export function FlashModeSelector() {
  const { t } = useTranslation()
  const mode = useFlashStore((state) => state.config.mode)
  const setMode = useFlashStore((state) => state.setMode)
  const isFlashing = useFlashStore((state) => state.isFlashing)

  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(value) => value && setMode(value as FlashMode)}
      disabled={isFlashing}
      className="h-8"
    >
      <ToggleGroupItem value="esp" className="gap-1.5 px-3 text-xs h-8">
        <Cpu className="h-3.5 w-3.5" />
        <span>{t('flash.mode.esp', 'ESP')}</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="raw" className="gap-1.5 px-3 text-xs h-8">
        <FileCode className="h-3.5 w-3.5" />
        <span>{t('flash.mode.raw', 'Raw')}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
