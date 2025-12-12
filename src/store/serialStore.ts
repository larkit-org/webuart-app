import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  SerialConfig,
  QuickCommand,
  TimedCommand,
  SerialEvent,
  DataFormat,
} from '@/types'
import { hexToUint8Array, validateAndFormatHex } from '@/utils/hex'
import { serialDB } from '@/utils/db'

// Event listeners stored outside of Zustand state to prevent infinite loops
const eventListeners: Record<string, Set<(event: SerialEvent) => void>> = {}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

interface SerialState {
  // Connection
  config: SerialConfig
  isConnected: boolean
  connectionStatus: ConnectionStatus
  error: string | null
  port: SerialPort | null
  reader: ReadableStreamDefaultReader<Uint8Array> | null
  writer: WritableStreamDefaultWriter<Uint8Array> | null

  // Commands
  quickCommands: QuickCommand[]
  timedCommands: TimedCommand[]

  // Log recording
  isLogRecording: boolean
  currentLogId: number | null
  messageBuffer: string[]

  // Actions
  setConfig: (config: Partial<SerialConfig>) => void
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  sendData: (data: string | Uint8Array, format: DataFormat) => Promise<void>

  // Quick commands
  addQuickCommand: (command: QuickCommand) => void
  removeQuickCommand: (id: string) => void
  updateQuickCommand: (command: QuickCommand) => void
  sendQuickCommand: (command: QuickCommand) => Promise<void>

  // Timed commands
  addTimedCommand: (command: TimedCommand) => void
  removeTimedCommand: (id: string) => void
  updateTimedCommand: (command: TimedCommand) => void
  startTimedCommand: (id: string) => void
  stopTimedCommand: (id: string) => void
  stopAllTimedCommands: () => void

  // Log recording
  startLogRecording: () => Promise<void>
  stopLogRecording: () => Promise<void>

  // Events (these don't modify state, so they're safe)
  addEventListener: (event: string, callback: (e: SerialEvent) => void) => void
  removeEventListener: (
    event: string,
    callback: (e: SerialEvent) => void
  ) => void
  triggerEvent: (event: string, data: unknown) => void
}

const timerIds = new Map<string, ReturnType<typeof setTimeout>>()
let saveTimeout: ReturnType<typeof setTimeout> | null = null
let partialLine = ''

export const useSerialStore = create<SerialState>()(
  persist(
    (set, get) => ({
      // Initial state
      config: {
        portId: '',
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
      },
      isConnected: false,
      connectionStatus: 'disconnected',
      error: null,
      port: null,
      reader: null,
      writer: null,
      quickCommands: [],
      timedCommands: [],
      isLogRecording: false,
      currentLogId: null,
      messageBuffer: [],

      setConfig: (newConfig) =>
        set((state) => ({
          config: { ...state.config, ...newConfig },
        })),

      connect: async () => {
        const { config, stopAllTimedCommands, triggerEvent } = get()
        set({ error: null, connectionStatus: 'connecting' })

        try {
          stopAllTimedCommands()

          const port = await navigator.serial.requestPort()
          await port.open({
            baudRate: config.baudRate,
            dataBits: config.dataBits,
            stopBits: config.stopBits,
            parity: config.parity,
          })

          const writer = port.writable?.getWriter()
          const reader = port.readable?.getReader()

          if (!writer || !reader) {
            throw new Error('Failed to get serial reader/writer')
          }

          // Listen for disconnect event (device unplugged)
          const handleDisconnect = () => {
            console.log('Serial port disconnected (device unplugged)')
            // Clean up without trying to close the port (it's already gone)
            const state = get()
            if (state.isLogRecording) {
              state.stopLogRecording()
            }
            state.stopAllTimedCommands()

            set({
              port: null,
              reader: null,
              writer: null,
              isConnected: false,
              connectionStatus: 'error',
              error: 'Device disconnected',
            })
            triggerEvent('disconnect', { reason: 'device_unplugged' })
          }

          port.addEventListener('disconnect', handleDisconnect)

          set({ port, writer, reader, isConnected: true, connectionStatus: 'connected' })
          triggerEvent('connect', { port })

          // Start reading loop
          const readLoop = async () => {
            const currentReader = get().reader
            if (!currentReader) return

            try {
              while (true) {
                const { value, done } = await currentReader.read()
                if (done) break

                if (value) {
                  const decodedData = new TextDecoder().decode(value)
                  get().triggerEvent('data', decodedData)
                }
              }
            } catch (error) {
              const errorName = (error as Error).name
              // Handle read errors (often happens when device is unplugged)
              if (errorName !== 'NetworkError' && get().isConnected) {
                console.error('Read error:', error)
                set({
                  connectionStatus: 'error',
                  error: 'Connection lost'
                })
              }
            }
          }

          readLoop()
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Connection failed'
          set({ error: errorMessage, connectionStatus: 'error' })
          throw err
        }
      },

      disconnect: async () => {
        const {
          reader,
          writer,
          port,
          isLogRecording,
          stopLogRecording,
          stopAllTimedCommands,
          triggerEvent,
        } = get()

        try {
          if (isLogRecording) {
            await stopLogRecording()
          }

          stopAllTimedCommands()

          if (reader) {
            await reader.cancel()
            reader.releaseLock()
          }

          if (writer) {
            await writer.close()
            writer.releaseLock()
          }

          if (port) {
            await port.close()
          }

          set({
            port: null,
            reader: null,
            writer: null,
            isConnected: false,
            connectionStatus: 'disconnected',
            error: null,
          })

          triggerEvent('disconnect', { reason: 'user' })
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Disconnection failed'
          set({ error: errorMessage })
          throw err
        }
      },

      sendData: async (data, format) => {
        const { writer } = get()
        if (!writer) return

        try {
          if (format === 'RAW' && typeof data === 'string') {
            const bytes = new TextEncoder().encode(data)
            await writer.write(bytes)
          } else if (format === 'ASCII' && typeof data === 'string') {
            const bytes = new TextEncoder().encode(data)
            await writer.write(bytes)
          } else if (format === 'HEX' && typeof data === 'string') {
            const bytes = hexToUint8Array(data)
            await writer.write(bytes)
          } else if (data instanceof Uint8Array) {
            await writer.write(data)
          }
        } catch (error) {
          console.error('Failed to send data:', error)
          throw error
        }
      },

      // Quick commands
      addQuickCommand: (command) =>
        set((state) => ({
          quickCommands: [...state.quickCommands, command],
        })),

      removeQuickCommand: (id) =>
        set((state) => ({
          quickCommands: state.quickCommands.filter((cmd) => cmd.id !== id),
        })),

      updateQuickCommand: (command) =>
        set((state) => ({
          quickCommands: state.quickCommands.map((cmd) =>
            cmd.id === command.id ? command : cmd
          ),
        })),

      sendQuickCommand: async (cmd) => {
        const { sendData } = get()
        let dataToSend = cmd.command

        if (cmd.format === 'HEX') {
          dataToSend = validateAndFormatHex(dataToSend)
        }

        if (cmd.addNewline && cmd.format === 'ASCII') {
          dataToSend += '\r\n'
        }

        await sendData(dataToSend, cmd.format)
      },

      // Timed commands
      addTimedCommand: (command) =>
        set((state) => ({
          timedCommands: [...state.timedCommands, command],
        })),

      removeTimedCommand: (id) => {
        get().stopTimedCommand(id)
        set((state) => ({
          timedCommands: state.timedCommands.filter((cmd) => cmd.id !== id),
        }))
      },

      updateTimedCommand: (command) => {
        const state = get()
        const existing = state.timedCommands.find(
          (cmd) => cmd.id === command.id
        )
        if (existing?.isActive) {
          state.stopTimedCommand(command.id)
        }
        set((state) => ({
          timedCommands: state.timedCommands.map((cmd) =>
            cmd.id === command.id ? command : cmd
          ),
        }))
      },

      startTimedCommand: (id) => {
        const state = get()
        const command = state.timedCommands.find((cmd) => cmd.id === id)
        if (!command) return

        const quickCommand = state.quickCommands.find(
          (cmd) => cmd.id === command.quickCommandId
        )
        if (!quickCommand) return

        set((s) => ({
          timedCommands: s.timedCommands.map((cmd) =>
            cmd.id === id ? { ...cmd, isActive: true } : cmd
          ),
        }))

        if (command.isLoop) {
          const timerId = setInterval(() => {
            get().sendQuickCommand(quickCommand)
          }, command.interval)
          timerIds.set(command.id, timerId)
        } else {
          const timerId = setTimeout(() => {
            get().sendQuickCommand(quickCommand)
            get().stopTimedCommand(command.id)
          }, command.interval)
          timerIds.set(command.id, timerId)
        }
      },

      stopTimedCommand: (id) => {
        const state = get()
        const command = state.timedCommands.find((cmd) => cmd.id === id)
        if (!command) return

        const timerId = timerIds.get(command.id)
        if (timerId) {
          if (command.isLoop) {
            clearInterval(timerId)
          } else {
            clearTimeout(timerId)
          }
          timerIds.delete(command.id)
        }

        set((s) => ({
          timedCommands: s.timedCommands.map((cmd) =>
            cmd.id === id ? { ...cmd, isActive: false } : cmd
          ),
        }))
      },

      stopAllTimedCommands: () => {
        const state = get()
        state.timedCommands.forEach((cmd) => {
          if (cmd.isActive) {
            state.stopTimedCommand(cmd.id)
          }
        })
      },

      // Log recording
      startLogRecording: async () => {
        const state = get()
        if (state.isLogRecording) return

        const logId = (await serialDB.saveLogFile({
          content: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })) as number

        set({ isLogRecording: true, currentLogId: logId })

        const handleData = (event: SerialEvent) => {
          if (event.key !== 'data') return
          const data = event.data as string
          const lines: string[] = []
          const text = partialLine + data

          const matches = text.split(/\r\n|\n|\r/)
          partialLine = matches.pop() || ''

          lines.push(...matches.filter((line) => line))

          if (lines.length > 0) {
            set((s) => ({
              messageBuffer: [...s.messageBuffer, ...lines],
            }))

            const currentState = get()
            if (currentState.messageBuffer.length >= 30) {
              saveBufferToDb()
            } else {
              scheduleBufferSave()
            }
          }
        }

        const saveBufferToDb = async () => {
          const { currentLogId, messageBuffer } = get()
          if (!currentLogId || messageBuffer.length === 0) return

          const file = await serialDB.getLogFile(currentLogId)
          if (!file) return

          await serialDB.updateLogFile(currentLogId, [
            ...file.content,
            ...messageBuffer,
          ])

          set({ messageBuffer: [] })
        }

        const scheduleBufferSave = () => {
          if (saveTimeout) clearTimeout(saveTimeout)
          saveTimeout = setTimeout(saveBufferToDb, 35000)
        }

        state.addEventListener('data', handleData)
      },

      stopLogRecording: async () => {
        const state = get()
        if (!state.isLogRecording) return

        if (partialLine) {
          set((s) => ({
            messageBuffer: [...s.messageBuffer, partialLine],
          }))
          partialLine = ''
        }

        const { currentLogId, messageBuffer } = get()
        if (currentLogId && messageBuffer.length > 0) {
          const file = await serialDB.getLogFile(currentLogId)
          if (file) {
            await serialDB.updateLogFile(currentLogId, [
              ...file.content,
              ...messageBuffer,
            ])
          }
        }

        if (saveTimeout) {
          clearTimeout(saveTimeout)
          saveTimeout = null
        }

        set({
          isLogRecording: false,
          currentLogId: null,
          messageBuffer: [],
        })
      },

      // Events - these don't modify Zustand state, they use external storage
      addEventListener: (event, callback) => {
        if (!eventListeners[event]) {
          eventListeners[event] = new Set()
        }
        eventListeners[event].add(callback)
      },

      removeEventListener: (event, callback) => {
        if (eventListeners[event]) {
          eventListeners[event].delete(callback)
        }
      },

      triggerEvent: (event, data) => {
        const listeners = eventListeners[event]
        if (listeners) {
          listeners.forEach((listener) => listener({ key: event, data }))
        }
      },
    }),
    {
      name: 'serial-storage',
      partialize: (state) => ({
        config: state.config,
        quickCommands: state.quickCommands,
        timedCommands: state.timedCommands.map((cmd) => ({
          ...cmd,
          isActive: false,
        })),
      }),
    }
  )
)
