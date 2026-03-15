# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start Electron + Vite dev server
npm run build            # Full production build (native tools + TS + Vite + Electron Builder)
npm run lint             # Check code with Biome
npm run lint:fix         # Auto-fix linting issues
npm run format           # Auto-format with Biome
npm test                 # Run Vitest test suite once
npm run test:watch       # Run tests in watch mode
```

To run a single test file:
```bash
npx vitest run src/smart-demo/timelineAnalyzer.test.ts
```

## Architecture

This is an **Electron + React + TypeScript** desktop app for recording screen demos and creating polished walkthrough videos with AI or local heuristic analysis.

### Process Model

**Two distinct processes — keep their responsibilities separate:**

- **Main Process** (`/electron/`) — privileged: recording lifecycle, native macOS telemetry (click/keyboard monitors), transcription pipeline, AI provider calls, secure secret storage
- **Renderer Process** (`/src/`) — React UI: HUD overlay, source selector, timeline editor
- **IPC Bridge** (`/electron/preload.ts`, `/electron/ipc/handlers.ts`) — 50+ contextBridge channels connect the two
- **Shared Types** (`/shared/`) — cross-process TypeScript contracts; changes here affect both sides

### Key Data Flow

1. Recording → cursor sampled at 10 Hz → `.webm` video + `.webm.cursor.json` sidecar
2. Load → IPC retrieves telemetry sidecar
3. **Local Smart Demo** (`/src/smart-demo/`) → deterministic heuristics detect clicks, typing, navigation, silence
4. **Optional AI** (`/electron/ai/`) → BYOK OpenAI or local Ollama; request built in renderer (`/src/lib/ai/`), executed in main
5. Edit → apply zooms, trims, captions, annotations in timeline editor
6. Export → decode video frames → render overlays (Pixi.js/Canvas) → re-encode MP4 or GIF

### Operating Modes

The app is **offline-first** — fully functional without any AI provider:
- **Offline** — local Smart Demo heuristics only
- **Hybrid** — local heuristics + optional BYOK AI refinement (OpenAI)
- **Local AI** — Ollama for on-device LLM

### Important Module Locations

| What | Where |
|------|-------|
| AI provider implementations | `/electron/ai/providers/` |
| Secure secret storage | `/electron/ai/store.ts` |
| IPC handlers (all ~50+) | `/electron/ipc/handlers.ts` |
| Smart Demo heuristics | `/src/smart-demo/` |
| AI request building (renderer) | `/src/lib/ai/` |
| Export pipeline (MP4/GIF) | `/src/lib/exporter/` |
| Window management | `/electron/windows.ts` |
| Keyboard shortcuts context | `/src/contexts/ShortcutsContext.tsx` |

### Path Aliases

```
@/*       → src/*
@shared/* → shared/*
```

### Native macOS Tools

Three bundled native apps in `/build/native/` handle:
- `MacOSTranscriber.app` — speech recognition
- `MouseClickMonitor.app` — click position/timing capture
- `KeyboardShortcutMonitor.app` — keystroke logging

Build native tools with: `npm run build:macos-transcriber`

## Testing

- **Framework:** Vitest 4.0, environment: Node (not browser)
- **Property testing:** fast-check used in algorithmic tests
- Tests live alongside source: `*.test.ts` / `*.spec.ts`
- Target coverage: 80%+

## Tech Stack Highlights

- **Video processing:** Pixi.js 8 for frame rendering with annotation overlays; `mediabunny`/`mp4box`/`web-demuxer` for codec work
- **Linting/formatting:** Biome (not ESLint/Prettier) — run `npm run lint:fix` before committing
- **UI components:** Radix UI primitives + shadcn/ui wrappers in `/src/components/ui/`
- **Styling:** Tailwind CSS 3.4
