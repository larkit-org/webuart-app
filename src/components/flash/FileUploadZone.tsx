import { useCallback, useRef, useState } from 'react'
import { useFlashStore } from '@/store/flashStore'
import { useTranslation } from 'react-i18next'
import { Upload, X, File, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatFileSize, formatAddress, parseAddress } from '@/utils/esptool'
import { cn } from '@/lib/utils'
import { ESP32_ADDRESSES } from '@/types/flash'

export function FileUploadZone() {
  const { t } = useTranslation()
  const files = useFlashStore((state) => state.files)
  const addFile = useFlashStore((state) => state.addFile)
  const removeFile = useFlashStore((state) => state.removeFile)
  const updateFileAddress = useFlashStore((state) => state.updateFileAddress)
  const isFlashing = useFlashStore((state) => state.isFlashing)
  const complexity = useFlashStore((state) => state.config.complexity)

  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const getDefaultAddress = (fileName: string): number => {
    const name = fileName.toLowerCase()
    if (name.includes('bootloader')) return ESP32_ADDRESSES.BOOTLOADER
    if (name.includes('partition')) return ESP32_ADDRESSES.PARTITION_TABLE
    if (name.includes('app') || name.includes('firmware')) return ESP32_ADDRESSES.APP
    return ESP32_ADDRESSES.MERGED
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const droppedFiles = Array.from(e.dataTransfer.files)
      for (const file of droppedFiles) {
        if (file.name.endsWith('.bin') || file.name.endsWith('.hex')) {
          // In simple mode, only allow one file
          if (complexity === 'simple' && files.length > 0) {
            continue
          }
          const address = complexity === 'advanced' ? getDefaultAddress(file.name) : 0x0
          addFile(file, address)
        }
      }
    },
    [addFile, complexity, files.length]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || [])
      for (const file of selectedFiles) {
        if (file.name.endsWith('.bin') || file.name.endsWith('.hex')) {
          // In simple mode, only allow one file
          if (complexity === 'simple' && files.length > 0) {
            continue
          }
          const address = complexity === 'advanced' ? getDefaultAddress(file.name) : 0x0
          addFile(file, address)
        }
      }
      // Reset input
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    },
    [addFile, complexity, files.length]
  )

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleAddressChange = (id: string, value: string) => {
    const address = parseAddress(value)
    if (address !== null) {
      updateFileAddress(id, address)
    }
  }

  const canAddMore = complexity === 'advanced' || files.length === 0

  return (
    <div className="space-y-3">
      {canAddMore && (
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
            isDragging && 'border-primary bg-primary/5',
            isFlashing && 'opacity-50 cursor-not-allowed',
            !isDragging && !isFlashing && 'hover:border-primary/50'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={isFlashing ? undefined : handleClick}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".bin,.hex"
            multiple={complexity === 'advanced'}
            className="hidden"
            onChange={handleFileSelect}
            disabled={isFlashing}
          />
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t('flash.files.dropzone', 'Drag & drop .bin file here or click to browse')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {complexity === 'simple'
              ? t('flash.files.singleFile', 'Single file mode')
              : t('flash.files.multipleFiles', 'Multiple files supported')}
          </p>
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 bg-muted rounded-lg"
            >
              {complexity === 'advanced' && (
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
              )}
              <File className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.file.size)}
                </p>
              </div>
              {complexity === 'advanced' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">@</span>
                  <Input
                    type="text"
                    value={formatAddress(file.address)}
                    onChange={(e) => handleAddressChange(file.id, e.target.value)}
                    className="w-24 h-8 text-xs font-mono"
                    placeholder="0x0"
                    disabled={isFlashing}
                  />
                </div>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => removeFile(file.id)}
                disabled={isFlashing}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && (
        <p className="text-sm text-muted-foreground text-center">
          {t('flash.files.noFiles', 'No files selected')}
        </p>
      )}

      {complexity === 'advanced' && files.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>{t('flash.files.commonAddresses', 'Common ESP32 addresses:')}</p>
          <ul className="list-disc list-inside pl-2 space-y-0.5">
            <li>Bootloader: 0x1000</li>
            <li>Partition table: 0x8000</li>
            <li>Application: 0x10000</li>
            <li>Merged binary: 0x0</li>
          </ul>
        </div>
      )}
    </div>
  )
}
