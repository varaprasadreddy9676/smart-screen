<p align="center">
  <img src="public/openscreen.png" alt="OpenScreen Smart Demo Logo" width="64" />
</p>

# OpenScreen Smart Demo

**AI-powered smart demo generation built on top of OpenScreen.**
Automatically converts screen recordings into polished demos by detecting user interactions and applying intelligent editing.

> Built on top of [OpenScreen](https://github.com/siddharthvaddem/openscreen) — the open-source screen recording tool. Licensed under MIT.

---

## What's New in Smart Demo

| Feature | Description |
|---|---|
| **Smart Recording** | One-click "Smart" button captures cursor telemetry alongside video |
| **Auto Zoom** | Automatically zooms into clicks and typing at 1.5× |
| **Click Highlights** | Animated pulse circles at every detected click (#4F8CFF, 600ms) |
| **Step Generation** | Auto-generates numbered tutorial steps from interactions |
| **Inactivity Detection** | Detects silence periods and suggests trim regions |
| **One-click Apply** | Instantly populates the editor timeline with all generated effects |

---

## How to Use Smart Demo

1. **Select** your screen/window source in the HUD
2. Click the **✦ Smart** (purple) button to start a Smart Demo recording
3. **Record** your workflow — open browser, click buttons, type, navigate
4. **Stop** recording — the editor opens automatically
5. In the editor, open the **Smart Demo** accordion in the right panel
6. Click **Generate Smart Demo** → review detected clicks, zooms, steps
7. Click **Apply Zoom & Highlights** → effects are added to the timeline
8. Optionally **Trim Silences** to remove inactive periods
9. **Export** as MP4 or GIF

---

## Demo Flow

```
Click ✦ Smart → record normally → stop
       ↓
Editor opens + cursor telemetry loaded
       ↓
Open "Smart Demo" panel → Generate
       ↓
See: clicks / zooms / steps detected
       ↓
Apply → polished demo ready to export
```

---

## Core Features (from OpenScreen)

- Record your whole screen or specific apps
- Manual zoom regions (customizable depth levels)
- Background wallpapers, gradients, solid colors
- Annotations (text, arrows, images)
- Trim, speed regions, motion blur
- Export in different aspect ratios and resolutions (MP4 / GIF)

---

## Smart Demo Architecture

```
src/
├── smart-demo/
│   ├── interactionRecorder.ts    # Cursor telemetry → click/type/nav events
│   ├── timelineAnalyzer.ts       # Events → demo segments with zoom targets
│   ├── inactivityDetector.ts     # Silence detection for trim suggestions
│   ├── stepGenerator.ts          # Human-readable tutorial step generation
│   └── effects/
│       ├── autoZoom.ts           # ZoomRegion generation from clicks
│       └── clickHighlight.ts     # AnnotationRegion pulse circles
└── ui/
    └── SmartDemoPanel.tsx        # React panel integrated in the editor
```

### Interaction Detection

The system analyses 10 Hz cursor telemetry captured by Electron's main process:

- **Click** — moving cursor → sudden stop → dwell 150–800 ms → movement resumes
- **Typing** — cursor velocity < threshold for > 1 second
- **Window change** — instantaneous position jump > 60% of screen
- **Navigation** — fast sweep > 30% screen distance

All processing is 100% client-side. No external AI API required.

---

## Built With

- Electron · React · TypeScript · Vite · PixiJS · Tailwind CSS

---

## Attribution

This project is a fork and extension of **OpenScreen** by [@siddharthvaddem](https://github.com/siddharthvaddem/openscreen).
Original project: https://github.com/siddharthvaddem/openscreen
License: MIT

---

## Installation

```bash
npm install
npm run dev        # development
npm run build:mac  # production build (macOS)
```
