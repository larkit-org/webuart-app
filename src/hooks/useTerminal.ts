import { useRef, useCallback, useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { ITerminalOptions } from '@xterm/xterm'

interface TerminalConfig extends ITerminalOptions {
  scrollback?: number
  fontSize?: number
  fontFamily?: string
}

const defaultConfig: TerminalConfig = {
  fontSize: 14,
  fontFamily: 'Consolas, Monaco, monospace',
  theme: {
    background: '#1a1a1a',
    foreground: '#f5f5f5',
    cursor: '#f5f5f5',
    black: '#000000',
    red: '#FF0000',
    green: '#00FF00',
    yellow: '#FFFF00',
    blue: '#0000FF',
    magenta: '#FF00FF',
    cyan: '#00FFFF',
    white: '#FFFFFF',
  },
  cursorBlink: true,
  scrollback: 100000,
  convertEol: true,
  fastScrollSensitivity: 10,
}

export function useTerminal(config: Partial<TerminalConfig> = {}) {
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const configRef = useRef(config)

  const initTerminal = useCallback((container: HTMLElement) => {
    if (terminalRef.current) {
      return terminalRef.current
    }

    const terminalConfig = { ...defaultConfig, ...configRef.current }

    const terminal = new Terminal(terminalConfig)
    const fitAddon = new FitAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    terminal.open(container)

    // Delay fit to ensure container has dimensions
    setTimeout(() => {
      fitAddon.fit()
    }, 0)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    return terminal
  }, [])

  const write = useCallback((data: string) => {
    terminalRef.current?.write(data)
  }, [])

  const clear = useCallback(() => {
    terminalRef.current?.clear()
  }, [])

  const handleResize = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      try {
        fitAddonRef.current.fit()
      } catch {
        // Ignore fit errors during initialization
      }
    }
  }, [])

  const dispose = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  const getTerminal = useCallback(() => terminalRef.current, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      dispose()
    }
  }, [dispose])

  return {
    terminalRef,
    fitAddonRef,
    initTerminal,
    write,
    clear,
    handleResize,
    dispose,
    getTerminal,
  }
}
