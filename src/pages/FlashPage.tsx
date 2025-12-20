import { AppHeader } from '@/components/AppHeader'
import { Footer } from '@/components'
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { PanelRightOpen, Cpu } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useFlashStore } from '@/store/flashStore'
import {
  FlashModeSelector,
  FileUploadZone,
  FlashProgress,
  ChipInfo,
  FlashConsole,
  FlashOptions,
  FlashActions,
} from '@/components/flash'
import type { FlashComplexity } from '@/types/flash'

export function FlashPage() {
  const { t } = useTranslation()
  const complexity = useFlashStore((state) => state.config.complexity)
  const setComplexity = useFlashStore((state) => state.setComplexity)
  const isFlashing = useFlashStore((state) => state.isFlashing)

  return (
    <SidebarInset className="flex flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <AppHeader>
          <SidebarTrigger className="md:hidden">
            <PanelRightOpen className="h-5 w-5" />
          </SidebarTrigger>
        </AppHeader>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Header row - compact */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Cpu className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">{t('flash.title', 'Firmware Flasher')}</h1>
            </div>

            {/* Mode and complexity in header */}
            <div className="flex items-center gap-3">
              <FlashModeSelector />
              <Tabs
                value={complexity}
                onValueChange={(value) => setComplexity(value as FlashComplexity)}
              >
                <TabsList className="h-8">
                  <TabsTrigger value="simple" disabled={isFlashing} className="text-xs px-3">
                    {t('flash.complexity.simple', 'Simple')}
                  </TabsTrigger>
                  <TabsTrigger value="advanced" disabled={isFlashing} className="text-xs px-3">
                    {t('flash.complexity.advanced', 'Advanced')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Left column - File upload */}
            <Card>
              <CardContent className="p-4">
                <FileUploadZone />
                {complexity === 'advanced' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('flash.files.advancedHint', 'Add multiple files with custom addresses')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Right column - Options & Info */}
            <div className="space-y-3">
              {/* Chip info */}
              <ChipInfo />

              {/* Options */}
              <Card>
                <CardContent className="p-4">
                  <FlashOptions />
                </CardContent>
              </Card>

              {/* Progress */}
              <FlashProgress />
            </div>
          </div>

          {/* Actions - full width */}
          <FlashActions />

          {/* Console - full width at bottom */}
          <FlashConsole />
        </div>
      </div>

      <Footer />
    </SidebarInset>
  )
}
