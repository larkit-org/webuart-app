import { ThemeToggle } from './ThemeToggle'
import type { ReactNode } from 'react'

interface AppHeaderProps {
  children?: ReactNode
}

export function AppHeader({ children }: AppHeaderProps) {
  return (
    <div className="flex justify-between items-center w-full">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="w-7 h-7 dark:invert" />
        <h1 className="text-xl font-bold">True WebSerial</h1>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {children}
      </div>
    </div>
  )
}
