import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  FlashConfig,
  FlashFile,
  FlashProgress,
  FlashStatus,
  EspChipInfo,
  FlashMode,
  FlashComplexity,
} from '@/types/flash'
import { DEFAULT_FLASH_CONFIG } from '@/types/flash'
import {
  createEspLoader,
  connectAndDetectChip,
  flashWithEspTool,
  flashRawBinary,
  type EspToolTerminal,
} from '@/utils/esptool'
import { ESPLoader, Transport } from 'esptool-js'

interface FlashState {
  // Configuration
  config: FlashConfig
  setMode: (mode: FlashMode) => void
  setComplexity: (complexity: FlashComplexity) => void
  setBaudRate: (baudRate: number) => void
  setEraseBeforeFlash: (erase: boolean) => void
  setVerifyAfterFlash: (verify: boolean) => void

  // Files
  files: FlashFile[]
  addFile: (file: File, address?: number) => void
  removeFile: (id: string) => void
  updateFileAddress: (id: string, address: number) => void
  clearFiles: () => void

  // Connection state
  port: SerialPort | null
  isConnected: boolean
  chipInfo: EspChipInfo | null

  // Flashing state
  isFlashing: boolean
  progress: FlashProgress
  logs: string[]

  // Internal
  loader: ESPLoader | null
  transport: Transport | null

  // Actions
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  detectChip: () => Promise<EspChipInfo | null>
  startFlash: () => Promise<void>
  cancelFlash: () => void

  // Logs
  appendLog: (message: string) => void
  clearLogs: () => void

  // Progress
  setProgress: (progress: Partial<FlashProgress>) => void
  setStatus: (status: FlashStatus) => void
}

const initialProgress: FlashProgress = {
  status: 'idle',
  currentFile: 0,
  totalFiles: 0,
  bytesWritten: 0,
  totalBytes: 0,
  percentage: 0,
  message: '',
}

export const useFlashStore = create<FlashState>()(
  persist(
    (set, get) => ({
      // Configuration
      config: DEFAULT_FLASH_CONFIG,
      setMode: (mode) => set((state) => ({ config: { ...state.config, mode } })),
      setComplexity: (complexity) => set((state) => ({ config: { ...state.config, complexity } })),
      setBaudRate: (baudRate) => set((state) => ({ config: { ...state.config, baudRate } })),
      setEraseBeforeFlash: (eraseBeforeFlash) =>
        set((state) => ({ config: { ...state.config, eraseBeforeFlash } })),
      setVerifyAfterFlash: (verifyAfterFlash) =>
        set((state) => ({ config: { ...state.config, verifyAfterFlash } })),

      // Files
      files: [],
      addFile: (file, address = 0) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        set((state) => ({
          files: [...state.files, { id, file, address }],
        }))
      },
      removeFile: (id) => {
        set((state) => ({
          files: state.files.filter((f) => f.id !== id),
        }))
      },
      updateFileAddress: (id, address) => {
        set((state) => ({
          files: state.files.map((f) => (f.id === id ? { ...f, address } : f)),
        }))
      },
      clearFiles: () => set({ files: [] }),

      // Connection state
      port: null,
      isConnected: false,
      chipInfo: null,

      // Flashing state
      isFlashing: false,
      progress: initialProgress,
      logs: [],

      // Internal
      loader: null,
      transport: null,

      // Terminal interface for esptool
      getTerminal(): EspToolTerminal {
        return {
          clean: () => set({ logs: [] }),
          writeLine: (data: string) => {
            set((state) => ({ logs: [...state.logs, data] }))
          },
          write: (data: string) => {
            set((state) => {
              const logs = [...state.logs]
              if (logs.length > 0) {
                logs[logs.length - 1] += data
              } else {
                logs.push(data)
              }
              return { logs }
            })
          },
        }
      },

      // Actions
      connect: async () => {
        const state = get()
        if (state.isConnected) return

        try {
          set({ progress: { ...initialProgress, status: 'connecting', message: 'Requesting port...' } })

          const port = await navigator.serial.requestPort()
          // Don't open port here - esptool-js Transport will open it

          set({
            port,
            isConnected: true,
            progress: { ...initialProgress, status: 'idle', message: 'Port selected' },
          })

          state.appendLog('Port selected')
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Connection failed'
          set({
            progress: { ...initialProgress, status: 'error', message },
          })
          state.appendLog(`Error: ${message}`)
          throw error
        }
      },

      disconnect: async () => {
        const state = get()
        const { loader, transport } = state

        try {
          if (loader) {
            try {
              await loader.after('hard_reset')
            } catch {
              // Ignore reset errors
            }
          }

          if (transport) {
            try {
              await transport.disconnect()
            } catch {
              // Ignore disconnect errors
            }
          }
        } finally {
          set({
            port: null,
            isConnected: false,
            chipInfo: null,
            loader: null,
            transport: null,
            progress: initialProgress,
          })
          state.appendLog('Disconnected')
        }
      },

      detectChip: async () => {
        const state = get()
        if (!state.port) {
          state.appendLog('Error: No port connected')
          return null
        }

        try {
          set({ progress: { ...state.progress, status: 'detecting', message: 'Detecting chip...' } })

          const terminal = (get() as FlashState & { getTerminal: () => EspToolTerminal }).getTerminal()
          const { loader, transport } = await createEspLoader(state.port, terminal, state.config.baudRate)

          const chipInfo = await connectAndDetectChip(loader, terminal)

          set({
            chipInfo,
            loader,
            transport,
            progress: { ...state.progress, status: 'idle', message: `Chip: ${chipInfo.chipName}` },
          })

          return chipInfo
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Detection failed'
          set({
            progress: { ...state.progress, status: 'error', message },
          })
          state.appendLog(`Error: ${message}`)
          return null
        }
      },

      startFlash: async () => {
        const state = get()
        if (state.isFlashing) return
        if (state.files.length === 0) {
          state.appendLog('Error: No files selected')
          return
        }

        set({ isFlashing: true })

        try {
          const terminal = (get() as FlashState & { getTerminal: () => EspToolTerminal }).getTerminal()

          if (state.config.mode === 'esp') {
            // ESP mode - use esptool
            if (!state.loader && state.port) {
              // Create loader if not exists
              const { loader, transport } = await createEspLoader(state.port, terminal, state.config.baudRate)
              await connectAndDetectChip(loader, terminal)
              set({ loader, transport })
            }

            const currentLoader = get().loader
            if (!currentLoader) {
              throw new Error('ESP loader not initialized')
            }

            const totalBytes = state.files.reduce((sum, f) => sum + f.file.size, 0)

            set({
              progress: {
                status: 'flashing',
                currentFile: 0,
                totalFiles: state.files.length,
                bytesWritten: 0,
                totalBytes,
                percentage: 0,
                message: 'Starting flash...',
              },
            })

            await flashWithEspTool(
              currentLoader,
              state.files,
              terminal,
              (fileIndex, written, total) => {
                const percentage = Math.round((written / total) * 100)
                set((s) => ({
                  progress: {
                    ...s.progress,
                    currentFile: fileIndex,
                    bytesWritten: written,
                    percentage,
                    message: `Flashing file ${fileIndex + 1}/${state.files.length}: ${percentage}%`,
                  },
                }))
              },
              {
                eraseAll: state.config.eraseBeforeFlash,
                compress: true,
              }
            )

            set({
              progress: {
                ...get().progress,
                status: 'success',
                percentage: 100,
                message: 'Flash complete!',
              },
            })
          } else {
            // Raw mode - direct binary transfer
            if (!state.port) {
              throw new Error('No port connected')
            }

            const file = state.files[0]
            const data = await file.file.arrayBuffer()

            set({
              progress: {
                status: 'flashing',
                currentFile: 0,
                totalFiles: 1,
                bytesWritten: 0,
                totalBytes: data.byteLength,
                percentage: 0,
                message: 'Sending binary...',
              },
            })

            await flashRawBinary(state.port, data, (written, total) => {
              const percentage = Math.round((written / total) * 100)
              set((s) => ({
                progress: {
                  ...s.progress,
                  bytesWritten: written,
                  percentage,
                  message: `Sending: ${percentage}%`,
                },
              }))
            }, terminal)

            set({
              progress: {
                ...get().progress,
                status: 'success',
                percentage: 100,
                message: 'Transfer complete!',
              },
            })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Flash failed'
          set({
            progress: { ...get().progress, status: 'error', message },
          })
          get().appendLog(`Error: ${message}`)
        } finally {
          set({ isFlashing: false })
        }
      },

      cancelFlash: () => {
        set({
          isFlashing: false,
          progress: { ...initialProgress, status: 'idle', message: 'Cancelled' },
        })
        get().appendLog('Flash cancelled')
      },

      // Logs
      appendLog: (message) => {
        set((state) => ({
          logs: [...state.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
        }))
      },
      clearLogs: () => set({ logs: [] }),

      // Progress
      setProgress: (progress) => {
        set((state) => ({
          progress: { ...state.progress, ...progress },
        }))
      },
      setStatus: (status) => {
        set((state) => ({
          progress: { ...state.progress, status },
        }))
      },
    }),
    {
      name: 'flash-storage',
      partialize: (state) => ({
        config: state.config,
      }),
    }
  )
)
