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
import { QuickCommandForm } from './QuickCommandForm'
import type { QuickCommand } from '@/types'

export function QuickCommands() {
  const { t } = useTranslation()
  const {
    quickCommands,
    isConnected,
    addQuickCommand,
    removeQuickCommand,
    updateQuickCommand,
    sendQuickCommand,
  } = useSerialStore()

  const [showDialog, setShowDialog] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [nameError, setNameError] = useState('')
  const [commandForm, setCommandForm] = useState<Omit<QuickCommand, 'id'>>({
    name: '',
    command: '',
    format: 'ASCII',
    addNewline: false,
  })

  const openAddDialog = () => {
    setIsEditing(false)
    setEditingId(null)
    setNameError('')
    setCommandForm({
      name: '',
      command: '',
      format: 'ASCII',
      addNewline: false,
    })
    setShowDialog(true)
  }

  const openEditDialog = (cmd: QuickCommand) => {
    setIsEditing(true)
    setEditingId(cmd.id)
    setNameError('')
    setCommandForm({
      name: cmd.name,
      command: cmd.command,
      format: cmd.format,
      addNewline: cmd.addNewline,
    })
    setShowDialog(true)
  }

  const handleSubmit = () => {
    const isDuplicateName = quickCommands.some((cmd) => {
      if (isEditing && editingId === cmd.id) {
        return false
      }
      return cmd.name === commandForm.name
    })

    if (isDuplicateName) {
      setNameError(t('quickCommands.duplicateNameError'))
      return
    }

    if (isEditing && editingId) {
      updateQuickCommand({
        ...commandForm,
        id: editingId,
      })
    } else {
      addQuickCommand({
        ...commandForm,
        id: crypto.randomUUID(),
      })
    }
    setShowDialog(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {t('quickCommands.title')}
        </h3>
        <div className="flex gap-1">
          {quickCommands.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setIsDeleteMode(!isDeleteMode)}
              title={t('quickCommands.deleteMode')}
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
            title={t('quickCommands.add')}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[140px]">
        <div className="space-y-1 pr-2">
          {quickCommands.length > 0 ? (
            quickCommands.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center justify-between p-1.5 bg-muted/50 rounded text-xs gap-1"
              >
                <div
                  className="flex-1 cursor-pointer min-w-0"
                  onClick={() => openEditDialog(cmd)}
                >
                  <div className="font-medium truncate">{cmd.name}</div>
                  <div className="text-muted-foreground truncate text-[10px]">
                    {cmd.command}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {isDeleteMode && (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeQuickCommand(cmd.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => sendQuickCommand(cmd)}
                    disabled={!isConnected}
                  >
                    {t('quickCommands.send')}
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-2 text-center text-xs text-muted-foreground">
              {t('quickCommands.noCommands')}
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator />

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t('quickCommands.edit') : t('quickCommands.add')}{' '}
              {t('quickCommands.quickCommand')}
            </DialogTitle>
          </DialogHeader>
          <QuickCommandForm
            value={commandForm}
            onChange={setCommandForm}
            error={nameError}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit}>
              {isEditing ? t('common.save') : t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
