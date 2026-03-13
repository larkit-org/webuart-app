import { ThemeToggle } from './ThemeToggle'
import type { ReactNode } from 'react'
import { useRouter } from '@/hooks/useRouter'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Terminal, Cpu } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AppHeaderProps {
  children?: ReactNode
}

export function AppHeader({ children }: AppHeaderProps) {
  const { route, navigate } = useRouter()
  const { t } = useTranslation()

  // Map discriminated union page to toggle value string
  const activeTab = route.page === 'flash' ? '/flash' : '/'

  return (
    <div className="flex justify-between items-center w-full">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="w-7 h-7 dark:invert" />
        <h1 className="text-xl font-bold hidden sm:block">
          WebUART{' '}
          <span className="text-xs font-normal text-muted-foreground">v{__APP_VERSION__}</span>
        </h1>

        {/* Navigation tabs */}
        <ToggleGroup
          type="single"
          value={activeTab}
          onValueChange={(value) => value && navigate(value)}
          className="ml-2"
        >
          <ToggleGroupItem value="/" aria-label={t('nav.terminal', 'Terminal')} className="gap-1.5 px-3">
            <Terminal className="h-4 w-4" />
            <span className="hidden sm:inline">{t('nav.terminal', 'Terminal')}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="/flash" aria-label={t('nav.flash', 'Flash')} className="gap-1.5 px-3">
            <Cpu className="h-4 w-4" />
            <span className="hidden sm:inline">{t('nav.flash', 'Flash')}</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {children}
      </div>
    </div>
  )
}
