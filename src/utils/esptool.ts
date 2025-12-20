import { ESPLoader, Transport } from 'esptool-js'
import type { EspChipInfo, FlashFile } from '@/types/flash'

export interface EspToolTerminal {
  clean: () => void
  writeLine: (data: string) => void
  write: (data: string) => void
}

export interface EspLoaderResult {
  loader: ESPLoader
  transport: Transport
}

export async function createEspLoader(
  port: SerialPort,
  terminal: EspToolTerminal,
  baudRate: number = 115200
): Promise<EspLoaderResult> {
  const transport = new Transport(port, true)

  const loader = new ESPLoader({
    transport,
    baudrate: baudRate,
    romBaudrate: 115200,
    terminal,
    debugLogging: false,
  })

  return { loader, transport }
}

export async function connectAndDetectChip(
  loader: ESPLoader,
  terminal: EspToolTerminal
): Promise<EspChipInfo> {
  terminal.writeLine('Connecting to device...')

  const chip = await loader.main()

  terminal.writeLine(`Chip detected: ${chip}`)

  const chipInfo: EspChipInfo = {
    chipFamily: loader.chip?.CHIP_NAME || chip || 'Unknown',
    chipName: chip || 'Unknown',
    features: [],
    macAddress: '',
  }

  // Try to get MAC address
  try {
    const mac = await loader.chip?.readMac(loader)
    if (mac) {
      chipInfo.macAddress = mac
      terminal.writeLine(`MAC Address: ${mac}`)
    }
  } catch {
    // MAC reading might fail, that's ok
  }

  return chipInfo
}

// Helper to read file as binary string - uses FileReader.readAsBinaryString
// exactly like official esptool-js demo
function readFileAsBinaryString(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (ev: ProgressEvent<FileReader>) => {
      if (ev.target?.result) {
        resolve(ev.target.result as string)
      } else {
        reject(new Error('Failed to read file'))
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsBinaryString(file)
  })
}

export async function flashWithEspTool(
  loader: ESPLoader,
  files: FlashFile[],
  terminal: EspToolTerminal,
  onProgress: (fileIndex: number, written: number, total: number) => void,
  options: {
    eraseAll?: boolean
    compress?: boolean
  } = {}
): Promise<void> {
  const { eraseAll = true, compress = true } = options

  // Prepare files for flashing
  const flashFiles: { data: string; address: number }[] = []

  for (const file of files) {
    // Use FileReader.readAsBinaryString - same as official esptool-js demo
    const binaryString = await readFileAsBinaryString(file.file)
    flashFiles.push({
      data: binaryString,
      address: file.address,
    })
  }

  terminal.writeLine(`Preparing to flash ${files.length} file(s)...`)

  if (eraseAll) {
    terminal.writeLine('Erasing flash...')
  }

  await loader.writeFlash({
    fileArray: flashFiles,
    flashSize: 'keep',
    flashMode: 'keep',
    flashFreq: 'keep',
    eraseAll,
    compress,
    reportProgress: (fileIndex: number, written: number, total: number) => {
      onProgress(fileIndex, written, total)
    },
    calculateMD5Hash: () => {
      // MD5 calculation - return empty for now
      return ''
    },
  })

  // Hard reset the chip to run the new firmware
  terminal.writeLine('Resetting device...')
  try {
    await loader.after('hard_reset')
  } catch {
    // Some devices may not support hard reset via RTS
    terminal.writeLine('Note: Manual reset may be required')
  }

  terminal.writeLine('Flash complete!')
}

export async function flashRawBinary(
  port: SerialPort,
  data: ArrayBuffer,
  onProgress: (written: number, total: number) => void,
  terminal: EspToolTerminal
): Promise<void> {
  const writer = port.writable?.getWriter()
  if (!writer) {
    throw new Error('Cannot get port writer')
  }

  const chunkSize = 4096
  const totalSize = data.byteLength
  let written = 0

  terminal.writeLine(`Sending ${totalSize} bytes...`)

  try {
    while (written < totalSize) {
      const chunk = data.slice(written, Math.min(written + chunkSize, totalSize))
      await writer.write(new Uint8Array(chunk))
      written += chunk.byteLength
      onProgress(written, totalSize)
    }
    terminal.writeLine('Transfer complete!')
  } finally {
    writer.releaseLock()
  }
}

// Utility to format file size
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// Utility to format address as hex
export function formatAddress(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(4, '0')}`
}

// Utility to parse hex address
export function parseAddress(hex: string): number | null {
  const cleaned = hex.replace(/^0x/i, '').trim()
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null
  return parseInt(cleaned, 16)
}
