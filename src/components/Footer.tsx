import { Heart, Github, Coffee } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Footer() {
  return (
    <footer className="border-t py-3 px-4 text-xs text-muted-foreground">
      <div className="flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
          <p className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
            All data stays in your browser — no tracking, no cookies
          </p>
          <span className="hidden md:inline text-muted-foreground/50">|</span>
          <p>Open source</p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/larkit-org/webuart-app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">GitHub</span>
          </a>

          <a
            href="https://revolut.me/cyberkosta"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
              <Coffee className="h-3.5 w-3.5" />
              Buy me a coffee
            </Button>
          </a>

          <a
            href="https://larkit.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            Made with <Heart className="h-3 w-3 text-red-500 fill-red-500" /> by Lark IT
          </a>
        </div>
      </div>
    </footer>
  )
}
