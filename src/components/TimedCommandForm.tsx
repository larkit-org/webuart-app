import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { TimedCommand, QuickCommand } from '@/types'

interface TimedCommandFormProps {
  value: Omit<TimedCommand, 'id' | 'isActive'>
  onChange: (value: Omit<TimedCommand, 'id' | 'isActive'>) => void
  quickCommands: QuickCommand[]
}

export function TimedCommandForm({
  value,
  onChange,
  quickCommands,
}: TimedCommandFormProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{t('timedCommands.form.quickCommand')}</Label>
        <Select
          value={value.quickCommandId}
          onValueChange={(v) => onChange({ ...value, quickCommandId: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('timedCommands.form.selectCommand')} />
          </SelectTrigger>
          <SelectContent>
            {quickCommands.map((cmd) => (
              <SelectItem key={cmd.id} value={cmd.id}>
                {cmd.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t('timedCommands.interval')}</Label>
        <Input
          type="number"
          value={value.interval}
          onChange={(e) =>
            onChange({ ...value, interval: parseInt(e.target.value) || 100 })
          }
          min={100}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="is-loop">{t('timedCommands.loop')}</Label>
        <Switch
          id="is-loop"
          checked={value.isLoop}
          onCheckedChange={(checked) => onChange({ ...value, isLoop: checked })}
        />
      </div>
    </div>
  )
}
