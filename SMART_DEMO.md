# Smart Demo Notes

This document explains the current Smart Demo implementation in this repository.

It reflects the code as it exists now:

- local heuristic Smart Demo analysis is the default path
- BYOK AI refinement is optional
- OpenAI and Ollama are supported providers

---

## Product Behavior

After a recording stops, the editor can analyze the saved cursor telemetry sidecar and generate:

- click-based zoom regions
- click highlight annotations
- tutorial-style step summaries
- inactivity-based trim suggestions

The editor can also run optional AI refinement to generate:

- a demo summary
- refined step text
- AI zoom suggestions
- AI trim suggestions

AI suggestions are reviewable and applied explicitly by the user. They are not silently applied.

---

## Local Smart Demo Pipeline

### Recording

During recording, the main process samples cursor position at 10 Hz and stores:

- `recording-<timestamp>.webm`
- `recording-<timestamp>.webm.cursor.json`

### Heuristic Analysis

The local pipeline lives in:

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

Flow:

1. raw cursor telemetry
2. interaction inference
3. timeline segment generation
4. zoom/highlight/step/trim suggestion generation

### Signals

| Signal | Heuristic |
|---|---|
| Click | cursor moves, stops, dwells briefly, then moves again |
| Typing | cursor remains nearly still for a sustained period |
| Window change | cursor position jumps far enough to imply a surface switch |
| Navigation | rapid sweep over a meaningful portion of the screen |
| Silence | low movement for long enough to suggest dead time |

---

## AI Refinement Pipeline

AI is optional and layered on top of the local pipeline.

### Shared Contract

The cross-process AI contract lives in:

```text
shared/ai.ts
```

It defines:

- provider config types
- request and response shapes
- runtime normalization helpers
- Ollama model list types

### Main Process AI Layer

```text
electron/ai/
  store.ts
  runSmartDemoAI.ts
  ollamaModels.ts
  prompts.ts
  providers/
    base.ts
    openai.ts
    ollama.ts
```

Responsibilities:

- secure config storage
- provider selection
- Ollama installed model discovery
- prompt construction
- provider calls
- schema validation of model output

### Renderer AI Layer

```text
src/lib/ai/
  frameSampler.ts
  buildSmartDemoAIRequest.ts
  applySmartDemoAISuggestion.ts
  modelGuidance.ts
```

Responsibilities:

- frame sampling for multimodal analysis
- reuse of local Smart Demo signals
- request construction for the selected provider
- mapping AI output into editor timeline state
- UI guidance for model selection

---

## Provider Support

### OpenAI

- API key required
- supports text-only or vision-assisted Smart Demo analysis
- vision mode includes sampled frames in the request

### Ollama

- intended for local runtimes
- API key usually not required
- text-only mode is the safe default
- vision mode is optional and only appropriate for multimodal models
- the settings dialog can fetch installed Ollama models from the configured endpoint

The UI also warns about:

- likely base models
- likely non-vision models with vision mode enabled
- typed model names that are not currently installed

---

## Recommendation Rules In The UI

The AI settings dialog currently uses both:

- name-based heuristics
- the installed Ollama model list from the local runtime

For Ollama, the dialog prefers:

- non-base models for text-only Smart Demo
- likely multimodal models for vision mode
- smaller local models when speed is likely to matter

This is guidance, not a guarantee. The runtime still depends on the actual model behavior.

---

## Limits

Smart Demo is still constrained by:

- cursor-only local heuristics when AI is off
- the structured-output reliability of the chosen model
- local model quality for Ollama
- whether a selected local model really supports images

Base models are especially risky because the app expects strict JSON output.

---

## Current Recommended Usage

### Best default

- use local Smart Demo first
- optionally run AI Assist after local analysis

### For OpenAI

- use a model that handles structured output reliably
- enable vision only when frame context matters

### For Ollama

- prefer instruction-tuned models
- avoid `*-base` models for Smart Demo output
- keep vision off unless you know the model is multimodal
- use the installed-model recommendations in the settings dialog
