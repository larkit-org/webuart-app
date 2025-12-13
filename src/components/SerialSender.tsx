import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useSerialStore } from '@/store/serialStore'
import { formatHexInput } from '@/utils/hex'
import type { DataFormat } from '@/types'

export function SerialSender() {
  const { t } = useTranslation()
  const { isConnected, sendData } = useSerialStore()

  const [message, setMessage] = useState('')
  const [format, setFormat] = useState<'ASCII' | 'HEX'>('ASCII')
  const [autoNewline, setAutoNewline] = useState(false)
  const [localEcho, setLocalEcho] = useState(false)

  const triggerEvent = useSerialStore((state) => state.triggerEvent)

  useEffect(() => {
    if (format === 'HEX') {
      setMessage((prev) => formatHexInput(prev))
    } else {
      setMessage((prev) => prev.replace(/\s/g, ''))
    }
  }, [format])

  const handleMessageChange = (value: string) => {
    if (format === 'HEX') {
      setMessage(formatHexInput(value))
    } else {
      setMessage(value)
    }
  }

  const handleSend = async () => {
    if (!message || !isConnected) return

    let dataToSend = message
    if (autoNewline && format === 'ASCII') {
      dataToSend += '\r\n'
    }

    // Show sent data in terminal if local echo is enabled
    if (localEcho) {
      triggerEvent('data', dataToSend)
    }

    await sendData(dataToSend, format as DataFormat)
  }

  return (
    <Card className="w-full">
      <CardContent className="p-3 space-y-2">
        <Textarea
          value={message}
          onChange={(e) => handleMessageChange(e.target.value)}
          placeholder={t('serialSender.placeholder')}
          disabled={!isConnected}
          rows={1}
          className="resize-none min-h-[36px]"
        />

        <div className="flex flex-wrap gap-3 justify-between items-center">
          <div className="flex items-center gap-3">
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as 'ASCII' | 'HEX')}
            >
              <SelectTrigger className="w-[80px] h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ASCII">
                  {t('serialSender.format.ascii')}
                </SelectItem>
                <SelectItem value="HEX">
                  {t('serialSender.format.hex')}
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <Switch
                id="auto-newline"
                checked={autoNewline}
                onCheckedChange={setAutoNewline}
                className="scale-90"
              />
              <Label htmlFor="auto-newline" className="text-xs">
                {t('serialSender.autoNewline')}
              </Label>
            </div>

            <div className="flex items-center gap-1.5">
              <Switch
                id="local-echo"
                checked={localEcho}
                onCheckedChange={setLocalEcho}
                className="scale-90"
              />
              <Label htmlFor="local-echo" className="text-xs">
                {t('serialSender.localEcho')}
              </Label>
            </div>
          </div>

          <Button
            size="sm"
            className="h-7"
            onClick={handleSend}
            disabled={!isConnected || !message}
          >
            {t('serialSender.send')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
