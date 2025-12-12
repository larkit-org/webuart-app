import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ConnectionStatus } from '@/store/serialStore'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useSerialStore } from '@/store/serialStore'

const BAUD_RATES = [4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800]
const DEFAULT_BAUD_RATE = 115200

export function SerialConnect() {
  const { t } = useTranslation()
  const {
    config,
    setConfig,
    isConnected,
    connectionStatus,
    error,
    connect,
    disconnect,
  } = useSerialStore()

  const ConnectionIndicator = ({ status }: { status: ConnectionStatus }) => {
    switch (status) {
      case 'connecting':
        return (
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
            <span className="text-xs text-muted-foreground">{t('serialConnect.status.connecting')}</span>
          </div>
        )
      case 'connected':
        return (
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-600 dark:text-green-400">{t('serialConnect.status.connected')}</span>
          </div>
        )
      case 'error':
        return (
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-xs text-red-600 dark:text-red-400">{t('serialConnect.status.error')}</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
            <span className="text-xs text-muted-foreground">{t('serialConnect.status.disconnected')}</span>
          </div>
        )
    }
  }

  const [selectedBaudRate, setSelectedBaudRate] = useState<string>(
    BAUD_RATES.includes(config.baudRate)
      ? config.baudRate.toString()
      : 'custom'
  )
  const [customBaudRate, setCustomBaudRate] = useState<number>(
    BAUD_RATES.includes(config.baudRate)
      ? DEFAULT_BAUD_RATE
      : config.baudRate
  )

  useEffect(() => {
    if (selectedBaudRate !== 'custom') {
      setConfig({ baudRate: parseInt(selectedBaudRate) })
    } else if (customBaudRate > 0) {
      setConfig({ baudRate: customBaudRate })
    }
  }, [selectedBaudRate, customBaudRate, setConfig])

  const handleConnection = async () => {
    try {
      if (isConnected) {
        await disconnect()
      } else {
        await connect()
      }
    } catch (err) {
      console.error('Connection operation failed:', err)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('serialConnect.title')}
        </h3>
        <ConnectionIndicator status={connectionStatus} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t('serialConnect.baudRate')}</Label>
        <Select
          value={selectedBaudRate}
          onValueChange={setSelectedBaudRate}
          disabled={isConnected}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BAUD_RATES.map((rate) => (
              <SelectItem key={rate} value={rate.toString()}>
                {rate}
              </SelectItem>
            ))}
            <SelectItem value="custom">
              {t('serialConnect.customBaudRate')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedBaudRate === 'custom' && (
        <div className="space-y-2">
          <Label className="text-xs">{t('serialConnect.customBaudRate')}</Label>
          <Input
            type="number"
            value={customBaudRate}
            onChange={(e) => setCustomBaudRate(parseInt(e.target.value) || 0)}
            disabled={isConnected}
            min={1}
            className="h-8"
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">{t('serialConnect.dataBits')}</Label>
          <Select
            value={config.dataBits.toString()}
            onValueChange={(v) =>
              setConfig({ dataBits: parseInt(v) as 7 | 8 })
            }
            disabled={isConnected}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7</SelectItem>
              <SelectItem value="8">8</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('serialConnect.stopBits')}</Label>
          <Select
            value={config.stopBits.toString()}
            onValueChange={(v) =>
              setConfig({ stopBits: parseInt(v) as 1 | 2 })
            }
            disabled={isConnected}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">{t('serialConnect.parity')}</Label>
          <Select
            value={config.parity}
            onValueChange={(v) =>
              setConfig({ parity: v as 'none' | 'even' | 'odd' })
            }
            disabled={isConnected}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t('serialConnect.parityOptions.none')}
              </SelectItem>
              <SelectItem value="even">
                {t('serialConnect.parityOptions.even')}
              </SelectItem>
              <SelectItem value="odd">
                {t('serialConnect.parityOptions.odd')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        className="w-full"
        size="sm"
        variant={isConnected ? 'destructive' : 'default'}
        onClick={handleConnection}
      >
        {isConnected
          ? t('serialConnect.disconnect')
          : t('serialConnect.connect')}
      </Button>

      {error && (
        <div className="flex items-center gap-2 p-2 text-xs text-destructive bg-destructive/10 rounded-md">
          <AlertCircle className="h-3 w-3" />
          <span>{t('serialConnect.connectionError')}</span>
        </div>
      )}

      <Separator />
    </div>
  )
}
