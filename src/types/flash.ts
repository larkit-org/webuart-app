export type FlashMode = 'esp' | 'raw'
export type FlashComplexity = 'simple' | 'advanced'

export type FlashStatus =
  | 'idle'
  | 'connecting'
  | 'detecting'
  | 'erasing'
  | 'flashing'
  | 'verifying'
  | 'success'
  | 'error'

export interface FlashFile {
  id: string
  file: File
  address: number // hex address like 0x0, 0x1000, 0x10000
  data?: ArrayBuffer
}

export interface EspChipInfo {
  chipFamily: string // ESP32, ESP8266, ESP32-S2, ESP32-S3, ESP32-C3, etc.
  chipName: string
  features: string[]
  crystalFrequency?: number
  macAddress: string
  flashSize?: number
}

export interface FlashProgress {
  status: FlashStatus
  currentFile: number
  totalFiles: number
  bytesWritten: number
  totalBytes: number
  percentage: number
  message: string
}

export interface FlashConfig {
  mode: FlashMode
  complexity: FlashComplexity
  baudRate: number
  eraseBeforeFlash: boolean
  verifyAfterFlash: boolean
}

export const DEFAULT_FLASH_CONFIG: FlashConfig = {
  mode: 'esp',
  complexity: 'simple',
  baudRate: 921600,
  eraseBeforeFlash: true,
  verifyAfterFlash: false,
}

// Common ESP32 flash addresses
export const ESP32_ADDRESSES = {
  BOOTLOADER: 0x1000,
  PARTITION_TABLE: 0x8000,
  APP: 0x10000,
  MERGED: 0x0,
} as const

// Supported baud rates for flashing
export const FLASH_BAUD_RATES = [
  115200,
  230400,
  460800,
  921600,
  1500000,
] as const
