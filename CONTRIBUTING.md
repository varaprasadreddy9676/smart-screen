# Contributing

This repository is an Electron + React + TypeScript desktop app built on top of OpenScreen.

The most important rule for contributors is to keep the app truthful:

- local heuristic Smart Demo behavior should be documented as local heuristics
- optional BYOK AI behavior should be documented as provider-driven AI refinement

Do not describe all Smart Demo functionality as “AI” when the implementation is deterministic.

---

## Local Setup

```bash
npm install
npm run dev
```

Useful validation commands:

```bash
npm test
npx tsc --noEmit
npx vite build
```

If you need packaged output:

```bash
npm run build:mac
```

---

## What To Test

Before opening a pull request, run the relevant checks for your changes.

Minimum expectation for most code changes:

- `npm test`
- `npx tsc --noEmit`

If you touch build wiring, Electron preload/main code, or shared types:

- `npx vite build`

If you touch packaging or release config:

- run the relevant `build:*` target for your platform

---

## Important Areas

### Smart Demo Heuristics

Local Smart Demo modules live under:

```text
src/smart-demo/
```

When changing heuristics:

- keep threshold changes intentional and explain them in the PR
- avoid breaking existing local-only behavior
- update docs if the product behavior meaningfully changes

### AI Integration

The AI boundary is split across:

```text
shared/ai.ts
electron/ai/
src/lib/ai/
src/components/video-editor/AISettingsDialog.tsx
src/ui/SmartDemoPanel.tsx
```

When changing AI behavior:

- keep secrets out of the renderer
- preserve offline usability
- validate model output before trusting it
- prefer provider-specific adapters instead of branching everywhere in UI code
- add or update tests for contract changes

### Ollama Support

Ollama integration should remain pragmatic:

- text-only support is the baseline
- vision is optional and model-dependent
- do not assume every installed local model is instruction-tuned
- do not assume every local model supports images

If you change Ollama UX:

- keep installed-model discovery working
- keep warnings for base models and non-vision models accurate enough to be useful

---

## Pull Requests

Please include:

- a short problem statement
- the change made
- any behavior or UX differences
- the commands you ran to validate it

If your PR changes user-facing behavior, update:

- [README.md](./README.md)
- [SMART_DEMO.md](./SMART_DEMO.md)

---

## Style Notes

- Keep changes typed and explicit.
- Prefer small modules over pushing more logic into large UI components.
- Add tests for new contract or provider logic.
- Avoid storing provider secrets in project files, localStorage, or renderer state.

---

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
