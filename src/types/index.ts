export interface SerialConfig {
  portId: string
  baudRate: number
  dataBits: 7 | 8
  stopBits: 1 | 2
  parity: 'none' | 'even' | 'odd'
}

export interface QuickCommand {
  id: string
  name: string
  command: string
  format: 'ASCII' | 'HEX'
  addNewline: boolean
}

export interface TimedCommand {
  id: string
  quickCommandId: string
  interval: number
  isLoop: boolean
  isActive: boolean
}

export interface SerialEvent {
  key: string
  data: unknown
}

export interface LogFile {
  id?: number
  content: string[]
  createdAt: number
  updatedAt: number
}

export type DataFormat = 'ASCII' | 'HEX' | 'RAW'
