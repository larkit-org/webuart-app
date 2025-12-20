import { useFlashStore } from '@/store/flashStore'
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { FLASH_BAUD_RATES } from '@/types/flash'

export function FlashOptions() {
  const { t } = useTranslation()
  const config = useFlashStore((state) => state.config)
  const setBaudRate = useFlashStore((state) => state.setBaudRate)
  const setEraseBeforeFlash = useFlashStore((state) => state.setEraseBeforeFlash)
  const isFlashing = useFlashStore((state) => state.isFlashing)

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="baudrate" className="text-sm whitespace-nowrap">
          {t('flash.options.baudRate', 'Baud Rate')}
        </Label>
        <Select
          value={config.baudRate.toString()}
          onValueChange={(value) => setBaudRate(parseInt(value))}
          disabled={isFlashing}
        >
          <SelectTrigger id="baudrate" className="w-28 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLASH_BAUD_RATES.map((rate) => (
              <SelectItem key={rate} value={rate.toString()}>
                {rate.toLocaleString()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config.mode === 'esp' && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="erase"
            checked={config.eraseBeforeFlash}
            onCheckedChange={(checked) => setEraseBeforeFlash(checked === true)}
            disabled={isFlashing}
          />
          <Label htmlFor="erase" className="text-sm">
            {t('flash.options.eraseBeforeFlash', 'Erase before flash')}
          </Label>
        </div>
      )}
    </div>
  )
}
