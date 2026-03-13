<div align="center">

<img src="public/logo.png" alt="WebUART" width="120" />

# WebUART

Browser-based serial terminal and firmware flasher for embedded development.

[**webuart.app**](https://webuart.app)

[![Open Source](https://img.shields.io/badge/open_source-yes-green)](https://github.com/larkit-org/webuart-app)
[![Made by Lark IT](https://img.shields.io/badge/made_by-Lark_IT-blue)](https://larkit.org)

</div>

Connect to Arduino, ESP32, and other microcontrollers directly from your browser using the [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API). No installation required.

## Features

### Serial Terminal
- Real-time serial monitoring with [xterm.js](https://xtermjs.org/)
- Configurable baud rate (4800–460800 + custom), data bits, stop bits, parity
- ASCII, HEX, and RAW data formats
- Quick commands — save frequently used serial commands for one-click sending
- Timed commands — schedule commands to run at intervals
- Log recording to browser storage (IndexedDB)
- Export logs as `.txt` files

### Firmware Flasher
- Flash ESP32/ESP8266 firmware directly from the browser using [esptool-js](https://github.com/niccokunzmann/esptool-js)
- Simple mode (single file) and advanced mode (multiple files with custom addresses)
- Chip detection and info display
- Raw binary transfer mode for other devices

### Live Session Sharing
- Share your terminal session with a colleague via a secret link
- Real-time data relay through Cloudflare Durable Objects
- Viewer sees live terminal output — no installation needed on their side
- 1:1 sharing (one host, one viewer per session)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| UI | Tailwind CSS 4, shadcn/ui, Radix |
| Terminal | xterm.js |
| State | Zustand |
| Storage | IndexedDB (idb) |
| Backend | Cloudflare Workers + Durable Objects |
| Deploy | Cloudflare Pages |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)
- A browser with [Web Serial API support](https://caniuse.com/web-serial) (Chrome, Edge, Opera)

### Development

```bash
# Install dependencies
pnpm install

# Start frontend dev server
pnpm dev

# Start worker dev server (for session sharing)
cd worker && pnpm install && pnpm dev
```

Frontend runs on `http://localhost:5173`, worker on `http://localhost:8787`.

### Build & Deploy

```bash
# Build frontend
pnpm build

# Deploy frontend to Cloudflare Pages
pnpm deploy

# Deploy worker to Cloudflare Workers
pnpm worker:deploy
```

## Project Structure

```
src/
├── components/       # React UI components
│   ├── flash/        # Firmware flasher components
│   └── ui/           # shadcn/ui base components
├── hooks/            # Custom React hooks
├── i18n/             # Internationalization
├── pages/            # Page components (Terminal, Flash, Viewer)
├── store/            # Zustand state management
├── types/            # TypeScript definitions
└── utils/            # Utilities (IndexedDB, hex conversion, esptool)

worker/
└── src/
    ├── index.ts      # Worker entry: HTTP routing, CORS, rate limiting
    └── session.ts    # SessionRoom Durable Object (WebSocket relay)
```

## Browser Support

Web Serial API is required. Supported browsers:

- Chrome 89+
- Edge 89+
- Opera 75+

Safari and Firefox do not support Web Serial API.

## License

Open source. See [LICENSE](LICENSE) for details.

## Links

- [webuart.app](https://webuart.app) — live app
- [Lark IT](https://larkit.org) — made by
