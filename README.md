<p align="center">
  <img src="public/openscreen.png" alt="OpenScreen Smart Demo" width="72" />
</p>

<h1 align="center">OpenScreen Smart Demo</h1>

<p align="center">
  <strong>Record a screen demo, understand what happened, and turn it into a polished walkthrough.</strong>
</p>

<p align="center">
  Local-first Smart Demo analysis, optional BYOK AI, transcript-aware zooms, captions, click telemetry, and export-ready output.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" />
  <img src="https://img.shields.io/badge/desktop-Electron-black" />
  <img src="https://img.shields.io/badge/built%20on-OpenScreen-blue" />
</p>

---

## Pitch

Most screen recorders stop at capture. Most AI demo tools over-edit, over-zoom, or hide the real workflow behind too much automation.

OpenScreen Smart Demo is built for a better path:

- record normally
- capture real interaction signals
- understand narration and clicks together
- suggest edits instead of silently forcing them
- export a polished demo with captions, zooms, trims, and keystroke overlays

This project is designed to work in three modes:

- `Offline`: local Smart Demo heuristics, no key required
- `Hybrid`: local analysis plus optional BYOK AI refinement
- `Local AI`: Ollama for teams that want to stay on-device

## What Makes It Useful

- `Speech-grounded Smart Demo`
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
- annotations
- crop / padding / wallpaper
- before / after preview mode

### Smart Demo

- local click / typing / navigation / silence analysis
- calmer auto-zoom planning
- transcript-aware callouts
- one-click `Polish Demo`
- speech-aware AI refinement

### Transcript And Captions

- import transcript from common formats
- built-in transcription backends
- transcript review / editing
- SRT / VTT export
- preview captions
- burned-in captions for export

### AI Assist

- BYOK provider settings
- OpenAI support
- Ollama support
- local Ollama model discovery
- model guidance for base vs instruction vs vision-capable models
- AI-generated summaries, step titles, zooms, trims, and focus moments

## Demo Flow

The strongest demo path is:

1. Record a narrated walkthrough.
2. Open the editor and show `Original Preview`.
3. Transcribe audio or import a transcript.
4. Run `One-Click Polish Demo`.
5. Show `Polished Preview`.
6. Open `AI Assist` and refine further.
7. Export MP4 + captions.

For a ready-to-use judging script, see [HACKATHON_DEMO.md](/Users/sai/Documents/GitHub/openscreen-smart-demo/HACKATHON_DEMO.md).

For a concise submission brief, see [HACKATHON_SUBMISSION.md](/Users/sai/Documents/GitHub/openscreen-smart-demo/HACKATHON_SUBMISSION.md).

## Architecture

```text
Record screen
  ->
Capture video + cursor telemetry + optional mic audio
  ->
Open editor with recording sidecars
  ->
Run local Smart Demo analysis
  ->
Optionally run BYOK AI refinement
  ->
Apply zooms / trims / captions / callouts / overlays
  ->
Export MP4 or GIF
```

Main subsystems:

- `electron/`
  main process, secure storage, IPC, native telemetry, transcription backends
- `shared/`
  shared cross-process AI and transcription contracts
- `src/smart-demo/`
  local heuristic Smart Demo pipeline
- `src/lib/ai/`
  AI request building, grounding, transcript parsing, suggestion mapping
- `src/components/video-editor/`
  editor UI, playback, timeline, transcript review, AI settings
- `src/lib/exporter/`
  export pipeline, captions, keystrokes, click emphasis

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

- `local Smart Demo heuristics`
- `optional model-driven AI refinement`

Not every “smart” feature is AI. The local pipeline is still valuable on its own, and the AI layer is additive rather than mandatory.

## Attribution

Built on top of **OpenScreen**

- Original repository: [siddharthvaddem/openscreen](https://github.com/siddharthvaddem/openscreen)
- Original author: [@siddharthvaddem](https://github.com/siddharthvaddem)
- License: MIT
