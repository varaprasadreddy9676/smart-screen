<p align="center">
  <img src="public/openscreen.png" alt="Smart Screen" width="72" />
</p>

<h1 align="center">Smart Screen</h1>

<p align="center">
  <strong>Record a screen demo, understand what happened, and turn it into a polished walkthrough.</strong>
</p>

<p align="center">
  Local-first Smart Screen analysis, optional BYOK AI, transcript-aware zooms, captions, click telemetry, and export-ready output.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" />
  <img src="https://img.shields.io/badge/desktop-Electron-black" />
  <img src="https://img.shields.io/badge/product-Smart%20Screen-111827" />
</p>

---

## Pitch

Most screen recorders stop at capture. Most AI demo tools over-edit, over-zoom, or hide the real workflow behind too much automation.

Smart Screen is built for a better path:

- record normally
- capture real interaction signals
- understand narration and clicks together
- suggest edits instead of silently forcing them
- export a polished demo with captions, zooms, trims, and keystroke overlays

This project is designed to work in three modes:

- `Offline`: local Smart Screen heuristics, no key required
- `Hybrid`: local analysis plus optional BYOK AI refinement
- `Local AI`: Ollama for teams that want to stay on-device

## What Makes It Useful

- `Speech-grounded Smart Screen`
  The app can use transcript + cursor + frames together, so spoken instructions like “click this button” or “look at this chart” become better zooms, focus moments, and step titles.

- `Native interaction telemetry`
  On macOS, the app can capture true native click telemetry and global keystrokes for cleaner demo polishing.

- `Better polish controls`
  Instead of random AI output, the editor supports selective apply for AI zooms and trims, one-click polish, calm zoom behavior, click emphasis, captions, and keystroke overlays.

- `Before / after demoability`
  The editor has an `Original` vs `Polished` preview mode so judges can immediately see the transformation.

## Core Features

### Recording

- screen/window recording
- microphone recording enabled by default
- pause / resume
- local recording storage
- native click telemetry on macOS
- native keystroke telemetry on macOS

### Editor

- timeline-based editing
- zoom regions
- trim regions
- speed regions
- caption/transcript track
- crop / padding / wallpaper
- before / after preview mode
- keyboard shortcuts customization
- playback speed control
- preset backgrounds and effects

### Transcription & Captions

- auto-transcription from microphone audio via MacOSTranscriber.app
- import transcript from common formats (SRT, VTT, plain text)
- transcript review and editing dialog with millisecond-precision timestamps
- caption styling: font size, vertical offset, text color, background color
- preset caption styles (Dark, Light, None)
- SRT / VTT export
- caption preview in video player with YouTube-style CC toggle button
- burned-in captions for MP4 and GIF exports
- dedicated "CC" row in timeline editor; click to seek

### Smart Screen

- local click / typing / navigation / silence analysis
- calmer auto-zoom planning
- transcript-aware callouts
- one-click `Polish Demo`
- Smart Screen panel as slide-over sheet (accessible from top-bar icon)
- speech-aware AI refinement

### AI Assist (Optional BYOK)

- BYOK provider settings with secure secret storage
- OpenAI support for AI-powered Smart Screen analysis
- Ollama support for on-device inference
- local Ollama model discovery
- model guidance for base vs instruction vs vision-capable models
- AI-generated summaries, step titles, zooms, trims, and focus moments

## Demo Flow

The strongest demo path is:

1. **Record** a narrated walkthrough (video + audio + native click/keystroke telemetry captured).
2. **Editor Opens** — recording is auto-loaded with:
   - Local Smart Screen analysis (click, typing, navigation, silence detection)
   - Auto-transcription if `.transcription.wav` sidecar exists
3. **Show Original Preview** — demonstrate the raw recording alongside timeline.
4. **Review Transcript** — edit captions and timestamps in the transcript review dialog.
5. **Smart Screen Panel** — open the slide-over sheet to:
   - Tune caption styling (font, size, color, presets)
   - Apply one-click `Polish Demo` (auto-zooms, trims, silences removed)
6. **Show Polished Preview** — display the transformed version side-by-side with Original.
7. **Optional AI Refinement** — open AI Assist to further refine suggestions (if OpenAI or Ollama configured).
8. **Export** — choose MP4 or GIF with burned-in captions, applied effects, and overlays.

For a ready-to-use judging script, see [HACKATHON_DEMO.md](/Users/sai/Documents/GitHub/openscreen-smart-demo/HACKATHON_DEMO.md).

For a concise submission brief, see [HACKATHON_SUBMISSION.md](/Users/sai/Documents/GitHub/openscreen-smart-demo/HACKATHON_SUBMISSION.md).

## Data Flow

```text
Record screen + audio + native events (clicks, keystrokes)
  |
  → Save as .webm video + .webm.cursor.json + .transcription.wav sidecars
  |
Open editor with recording
  |
  → Load video, cursor telemetry, auto-transcribe if .transcription.wav exists
  |
Local Smart Screen analysis
  |
  → Detect clicks, typing, inactivity, navigation patterns
  → Generate suggested zooms, trims, focus moments
  |
Review & edit transcript (timestamps, captions)
  |
Optional BYOK AI refinement (if OpenAI or Ollama configured)
  |
Apply edits: zooms, trims, captions, speed changes, overlays
  |
Export MP4 or GIF with captions, click emphasis, keystroke display
```

For detailed architecture and code module locations, see [CLAUDE.md](CLAUDE.md).

## Providers And Transcription

### AI providers

- `OpenAI`
- `Ollama`

### Transcription backends

- transcript import
- OpenAI transcription
- macOS-native transcription path

The app keeps transcription and AI analysis as separate concerns. You can use:

- no AI + imported transcript
- OpenAI transcription + Ollama analysis
- local-only analysis without any provider

## Security

- provider secrets are kept out of renderer code
- AI config is stored in the Electron main process
- project files do not store API keys
- the app remains usable without cloud AI

## Local Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npx tsc --noEmit
npx vite build
```

Packaging:

```bash
npm run build:mac
```

## Current Product Truth

This repo intentionally separates:

- `local Smart Screen heuristics`
- `optional model-driven AI refinement`

Not every “smart” feature is AI. The local pipeline is still valuable on its own, and the AI layer is additive rather than mandatory.

## Attribution

Maintained by **SaiVaraprasad Medapati**

- Repository: [varaprasadreddy9676/openscreen-smart-demo](https://github.com/varaprasadreddy9676/openscreen-smart-demo)
- Forked from: [siddharthvaddem/openscreen](https://github.com/siddharthvaddem/openscreen)
- License: MIT
