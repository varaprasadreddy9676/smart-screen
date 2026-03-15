<p align="center">
  <img src="public/openscreen.png" alt="OpenScreen Smart Demo" width="72" />
</p>

<h1 align="center">OpenScreen Smart Demo</h1>

<p align="center">
  <strong>Screen recording, timeline editing, and optional BYOK AI-assisted demo analysis.</strong><br/>
  Built on top of OpenScreen with a local heuristic Smart Demo pipeline and optional OpenAI or Ollama refinement.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-green" />
  <img src="https://img.shields.io/badge/built%20on-OpenScreen-blue" />
  <img src="https://img.shields.io/badge/desktop-Electron-black" />
</p>

---

## What This Project Is

OpenScreen Smart Demo is a desktop app for recording screen demos and polishing them inside a timeline editor.

It has two Smart Demo layers:

- `Local Smart Demo`: heuristic analysis of cursor telemetry to detect clicks, typing, navigation, and inactivity.
- `AI Assist`: optional BYOK analysis on top of the local signals, using a user-selected provider and model.

The app works without any API key. AI is additive, not required.

---

## Current AI Story

The codebase no longer treats all Smart Demo functionality as “AI”.

What is local and deterministic:

- click detection from cursor velocity and dwell
- typing detection from cursor stillness
- navigation and window-change heuristics
- automatic zoom suggestions
- click highlight annotations
- silence-based trim suggestions
- generated tutorial steps from templates

What is optional BYOK AI:

- refined Smart Demo summary
- improved step titles and descriptions
- AI-generated zoom suggestions
- AI-generated trim suggestions

Supported providers today:

- `OpenAI`
- `Ollama`

Ollama support is pragmatic:

- text-only analysis works with local heuristic input plus the user prompt
- vision mode is optional and only makes sense for vision-capable local models
- the settings dialog fetches installed Ollama models from the local runtime and recommends likely good candidates

---

## How It Works

```text
Record screen
   ->
Capture cursor telemetry at 10 Hz
   ->
Open editor with video + cursor sidecar
   ->
Run Local Smart Demo analysis
   ->
Optionally run BYOK AI refinement
   ->
Apply zooms / highlights / trims
   ->
Export MP4 or GIF
```

Smart Demo local signals:

| Signal | Detection method |
|---|---|
| Click | cursor moves -> sudden stop -> 150-800 ms dwell -> resumes |
| Typing | cursor velocity stays below threshold for > 1 second |
| Window change | instantaneous jump > 60% of display width |
| Navigation | fast sweep across a large distance |
| Silence | low cursor movement for > 3 seconds |

Generated local effects:

- zoom regions around clicks and typing
- click pulse annotations
- tutorial steps
- silence trim suggestions

---

## Quick Start

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm test
npx tsc --noEmit
npm run build:mac
```

`npm run build` runs TypeScript, renderer/main/preload bundling, and Electron packaging.

---

## Smart Demo Usage

### Local Smart Demo

1. Select a screen or window source in the HUD overlay.
2. Click `Smart` to start recording.
3. Record your workflow normally.
4. Stop recording to open the editor.
5. Open the `Smart Demo` section in the right sidebar.
6. Click `Generate Smart Demo`.
7. Review detected steps, zoom count, and silence suggestions.
8. Apply zoom/highlight suggestions or trim silences.

### AI Assist

1. Open `AI Settings` in the editor.
2. Choose `OpenAI` or `Ollama`.
3. Enter a model and any provider-specific connection details.
4. For Ollama, use the installed-model list and recommended local models in the dialog.
5. Optionally enable `Vision mode` if the selected model supports images.
6. Back in `Smart Demo`, add an optional goal prompt.
7. Click `Generate With AI`.
8. Review the AI summary and suggestions, then apply them.

Notes:

- OpenAI requires an API key.
- Ollama usually does not require a key for local use.
- Vision mode should stay off unless the selected model is actually multimodal.
- Base models often do poorly with the app's structured JSON output contract.

---

## Architecture

### App Surfaces

- HUD overlay recorder
- source selector window
- full editor window

### Main Process

- window creation and switching
- tray and menu integration
- secure AI config storage
- provider IPC handlers
- cursor telemetry capture

### Renderer

- recording controls
- video playback and timeline editor
- project persistence
- Smart Demo UI
- AI settings dialog

### Smart Demo Modules

```text
src/smart-demo/
  interactionRecorder.ts
  timelineAnalyzer.ts
  inactivityDetector.ts
  stepGenerator.ts
  effects/
    autoZoom.ts
    clickHighlight.ts
```

### AI Modules

```text
shared/ai.ts
electron/ai/
  store.ts
  runSmartDemoAI.ts
  ollamaModels.ts
  prompts.ts
  providers/
    openai.ts
    ollama.ts
src/lib/ai/
  frameSampler.ts
  buildSmartDemoAIRequest.ts
  applySmartDemoAISuggestion.ts
  modelGuidance.ts
```

---

## Security Notes

- API keys are not stored in the renderer.
- Provider secrets stay in the Electron main process.
- Stored credentials use Electron `safeStorage` when available.
- Project files do not store provider secrets.

---

## Testing

Current automated coverage focuses on the new AI boundary and integration seams:

- shared AI validators
- Ollama model list parsing
- provider behavior for Ollama
- AI request construction
- AI suggestion mapping
- encrypted config store behavior

Run:

```bash
npm test
```

---

## Attribution

Built on top of **OpenScreen**

- Original repository: https://github.com/siddharthvaddem/openscreen
- Original author: [@siddharthvaddem](https://github.com/siddharthvaddem)
- License: MIT
