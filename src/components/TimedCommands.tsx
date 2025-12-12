import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useSerialStore } from '@/store/serialStore'
import { TimedCommandForm } from './TimedCommandForm'
import type { TimedCommand } from '@/types'

export function TimedCommands() {
  const { t } = useTranslation()
  const {
    quickCommands,
    timedCommands,
    isConnected,
    addTimedCommand,
    removeTimedCommand,
    updateTimedCommand,
    startTimedCommand,
    stopTimedCommand,
  } = useSerialStore()

  const [showDialog, setShowDialog] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [commandForm, setCommandForm] = useState<
    Omit<TimedCommand, 'id' | 'isActive'>
  >({
    quickCommandId: '',
    interval: 1000,
    isLoop: false,
  })

  const getQuickCommandName = (id: string) => {
    return quickCommands.find((cmd) => cmd.id === id)?.name || t('common.unknown')
  }

  const openAddDialog = () => {
    setIsEditing(false)
    setEditingId(null)
    setCommandForm({
      quickCommandId: '',
      interval: 1000,
      isLoop: false,
    })
    setShowDialog(true)
  }

  const openEditDialog = (cmd: TimedCommand) => {
    setIsEditing(true)
    setEditingId(cmd.id)
    setCommandForm({
      quickCommandId: cmd.quickCommandId,
      interval: cmd.interval,
      isLoop: cmd.isLoop,
    })
    setShowDialog(true)
  }

  const handleSubmit = () => {
    if (isEditing && editingId) {
      updateTimedCommand({
        ...commandForm,
        id: editingId,
        isActive: false,
      })
    } else {
      addTimedCommand({
        ...commandForm,
        id: crypto.randomUUID(),
        isActive: false,
      })
    }
    setShowDialog(false)
  }

  const toggleCommand = (cmd: TimedCommand) => {
    if (cmd.isActive) {
      stopTimedCommand(cmd.id)
    } else {
      startTimedCommand(cmd.id)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('timedCommands.title')}
        </h3>
        <div className="flex gap-1">
          {timedCommands.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsDeleteMode(!isDeleteMode)}
              title={t('timedCommands.deleteMode')}
            >
              <Trash2
                className={`h-3.5 w-3.5 ${isDeleteMode ? 'text-destructive' : ''}`}
              />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={openAddDialog}
            title={t('timedCommands.add')}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[140px]">
        <div className="space-y-1 pr-2">
          {timedCommands.length > 0 ? (
            timedCommands.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center justify-between p-1.5 bg-muted/50 rounded text-xs gap-1"
              >
                <div
                  className="flex-1 cursor-pointer min-w-0"
                  onClick={() => openEditDialog(cmd)}
                >
                  <div className="font-medium truncate">
                    {getQuickCommandName(cmd.quickCommandId)}
                  </div>
                  <div className="text-muted-foreground text-[10px]">
                    {cmd.interval}ms |{' '}
                    {cmd.isLoop
                      ? t('timedCommands.loop')
                      : t('timedCommands.once')}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {isDeleteMode && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeTimedCommand(cmd.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant={cmd.isActive ? 'destructive' : 'default'}
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => toggleCommand(cmd)}
                    disabled={!isConnected}
                  >
                    {cmd.isActive
                      ? t('timedCommands.stop')
                      : t('timedCommands.start')}
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-2 text-center text-xs text-muted-foreground">
              {t('timedCommands.noCommands')}
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t('timedCommands.edit') : t('timedCommands.add')}
            </DialogTitle>
          </DialogHeader>
          <TimedCommandForm
            value={commandForm}
            onChange={setCommandForm}
            quickCommands={quickCommands}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!commandForm.quickCommandId || !commandForm.interval}
            >
              {isEditing ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
