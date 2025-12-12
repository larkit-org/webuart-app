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
import { formatHexInput } from '@/utils/hex'
import type { QuickCommand } from '@/types'

interface QuickCommandFormProps {
  value: Omit<QuickCommand, 'id'>
  onChange: (value: Omit<QuickCommand, 'id'>) => void
  error?: string
}

export function QuickCommandForm({
  value,
  onChange,
  error,
}: QuickCommandFormProps) {
  const { t } = useTranslation()

  const handleCommandChange = (command: string) => {
    if (value.format === 'HEX') {
      onChange({ ...value, command: command.replace(/[^0-9A-Fa-f]/g, '') })
    } else {
      onChange({ ...value, command })
    }
  }

  const handleFormatChange = (format: 'ASCII' | 'HEX') => {
    let command = value.command
    if (format === 'HEX') {
      command = command.replace(/[^0-9A-Fa-f]/g, '')
    }
    onChange({ ...value, format, command })
  }

  const displayCommand =
    value.format === 'HEX' ? formatHexInput(value.command) : value.command

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label>{t('quickCommands.form.name')}</Label>
        <Input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className={error ? 'border-destructive' : ''}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="space-y-2">
        <Label>{t('quickCommands.form.command')}</Label>
        <Input
          value={displayCommand}
          onChange={(e) => handleCommandChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('quickCommands.form.format')}</Label>
        <Select value={value.format} onValueChange={handleFormatChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ASCII">ASCII</SelectItem>
            <SelectItem value="HEX">HEX</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label htmlFor="add-newline">
          {t('quickCommands.form.addNewline')}
        </Label>
        <Switch
          id="add-newline"
          checked={value.addNewline}
          onCheckedChange={(checked) =>
            onChange({ ...value, addNewline: checked })
          }
        />
      </div>
    </div>
  )
}
