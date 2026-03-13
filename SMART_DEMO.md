# OpenScreen Smart Demo

**OpenScreen Smart Demo** automatically converts screen recordings into polished demo videos by detecting user interactions and applying intelligent editing.

> Built on top of [OpenScreen](https://github.com/siddharthvaddem/openscreen) — the open-source screen recording tool. Licensed under MIT.

---

## Features

| Feature | Description |
|---|---|
| **Smart Demo Recording** | One-click recording mode that captures cursor telemetry alongside video |
| **Auto Zoom** | Automatically zooms into clicks and typing events (1.5× scale, 250ms ease) |
| **Click Highlights** | Animated pulse circles appear at every detected click position |
| **Step Generation** | Converts interactions into a numbered tutorial step list |
| **Inactivity Detection** | Identifies silence periods and suggests trim regions |
| **Automatic Editing** | Applies all effects to the editor timeline with a single click |

---

## How It Works

```
Record Smart Demo
       ↓
User records screen normally
       ↓
Cursor telemetry is captured at 10 Hz
       ↓
Smart Demo panel analyses interactions:
    • Click detection (velocity → dwell pattern)
    • Typing detection (sustained cursor stillness)
    • Window change detection (large position jumps)
    • Navigation detection (fast cursor sweeps)
       ↓
Generated effects:
    • Zoom regions (auto-centred on cursor position)
    • Click highlight annotations (600ms pulse)
    • Tutorial steps (human-readable descriptions)
    • Trim suggestions (for silences > 3 seconds)
       ↓
One-click apply → polished demo ready to export
```

---

## Usage

### Record Smart Demo

1. Open OpenScreen
2. Select a screen/window source
3. Click **Smart** (✦ purple button) in the HUD overlay
4. Record your workflow normally
5. Stop recording — the editor opens automatically

### Apply Smart Demo Effects

1. In the editor, scroll down in the right panel
2. Open the **Smart Demo** accordion section
3. Click **Generate Smart Demo** to run analysis
4. Review the generated steps
5. Click **Apply Zoom & Highlights** to add effects to the timeline
6. Optionally click **Trim Silences** to remove inactive periods
7. Export as MP4 or GIF

---

## Architecture

```
src/
├── smart-demo/
│   ├── interactionRecorder.ts    # Cursor telemetry → interaction events
│   ├── timelineAnalyzer.ts       # Events → demo segments
│   ├── inactivityDetector.ts     # Silence / trim detection
│   ├── stepGenerator.ts          # Tutorial step text generation
│   └── effects/
│       ├── autoZoom.ts           # ZoomRegion generation from clicks
│       └── clickHighlight.ts     # AnnotationRegion generation for pulses
└── ui/
    └── SmartDemoPanel.tsx        # React UI panel in the editor
```

### Interaction Detection Algorithm

The system analyses 10 Hz cursor telemetry captured by the main process:

- **Click**: moving cursor → sudden deceleration → dwell 150–800 ms → movement resumes
- **Typing**: cursor velocity < threshold for > 1 second
- **Window change**: instantaneous position jump > 60% of screen width
- **Navigation**: fast sweep covering > 30% screen distance

### Auto Zoom

Each click generates a `ZoomRegion` with:
- **Scale**: depth 2 = 1.5×
- **Duration**: 1 500 ms after the click
- **Centre**: normalised cursor position at click moment
- **Ease**: 250 ms ramp-up

Overlapping zoom regions (< 300 ms apart) are merged and their focus points averaged.

### Click Highlight

Each click generates an `AnnotationRegion` (text `●`) with:
- **Colour**: `#4F8CFF` with `rgba(79,140,255,0.18)` background
- **Diameter**: 6% of video width
- **Duration**: 600 ms
- **Z-index**: 100 (always on top)

---

## Tech Stack

- **Electron** — desktop app shell
- **React + TypeScript** — UI
- **PixiJS** — video rendering and zoom transforms
- **Vite** — build system
- **Tailwind CSS** — styling

---

## Attribution

Built on top of **OpenScreen**
- Repository: https://github.com/siddharthvaddem/openscreen
- License: MIT

---

## Hackathon Demo Script

```
1. Open app
2. Click "Smart" button (purple ✦) in HUD
3. Select screen source → recording starts
4. Open browser → click Login → type credentials → submit form
5. Stop recording (≈ 30 seconds)
6. Editor opens automatically
7. Open "Smart Demo" panel → click "Generate Smart Demo"
8. See: detected clicks, zoom count, step list
9. Click "Apply Zoom & Highlights"
10. Play preview → auto-zoom and click pulses visible
11. Export MP4
```
