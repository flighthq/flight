---
name: functional-test
description: Create or modify a Flight functional scene under functional/scenes/ — one scene rendered across Canvas/DOM/WebGL/WebGPU backends and validated by a fingerprint baseline plus an in-page not-blank/oracle check. Use when adding visual coverage that jsdom unit tests cannot exercise (transforms, blending, clipping, filters, text layout, WebGL specifics) or when verifying a rendering change looks correct across backends.
---

# Writing a functional scene

Functional scenes live as flat files under `functional/scenes/`. Each renders one scene on one or more backends. Validation is layered: the frame fingerprint is compared against a committed baseline under `functional/baselines/{name}.json`, the in-page verifier asserts the frame is not blank (and runs any per-scene oracle), and any `pageerror` / console error fails the run.

Write one when the behavior involves rendering jsdom cannot exercise, you want a persistent cross-backend visual record, or you want automatic regression detection. Agents are expected to add functional scenes when implementing or verifying visual rendering behavior.

## The two scene shapes

A scene's filename encodes the backend(s) it runs on — there is **no `package.json` and no `renderers[]` field; existence is the manifest**:

```
functional/scenes/
  node-alpha.ts            ← backend-agnostic: one file, runs on ALL default backends (dom, canvas, webgl, webgpu)
  effect-bloom.canvas.ts   ← backend-specific: a self-contained target for ONE backend
  effect-bloom.webgl.ts    ←   (independent code — nothing shared between the backend variants)
  effect-bloom.webgpu.ts
```

- **Backend-agnostic (`<name>.ts`)** — the common case. Call `createFunctionalTarget(...)` from `@ft/render`; the harness picks the backend at runtime (`window.__ftBackend`, set from the `/tests/{name}/{backend}/` route). One file runs on every default backend. Use this whenever the scene builds a display list and renders it the same way on every backend.
- **Backend-specific (`<name>.<backend>.ts`)** — when the backend wiring genuinely differs (render effect pipelines, the 3D scene renderers, or a feature only some backends support). Each file is **fully self-contained**: it builds its own render state directly and shares no code with its sibling backends. To restrict a scene to a subset of backends, ship only those `<name>.<backend>.ts` files. Backends compare against each other by `<name>`.

Do not add both a `<name>.ts` and a `<name>.<backend>.ts` for the same name.

File existence declares that the capture target runs on a backend. **A scene's cells must all show the SAME THING** — so a backend that cannot produce the picture gets no file, rather than a file that renders the feature's absence. Read [`functional/README.md`](../../../functional/README.md) before shipping a backend variant, declaring a backend unsupported, or changing a scene's antialiasing; it carries the ratified rules and the two worked cases that generated them.

`export const functionalBackendSupport = 'control' as const` still exists and is still read by `npm run support`, but **do not add new ones.** Controls are being retired: a capability gap belongs in the support matrix and the package's `status.md`, and a "did the effect run" signal belongs _inside_ the picture — a directly-drawn reference element beside the treated one, present in every cell. If you are about to declare a control, you are at a decision the README covers.

`discoverEntries()` / the vite harness enumerate scenes by globbing `functional/scenes/*.ts`. The harness serves `/tests/{name}/{backend}/`; `@ft/render` and `@ft/verify` resolve to the real `tools/harness` modules (no per-backend build-time trampoline).

Copy `templates/app.ts` from this skill as a starting point for a backend-agnostic scene.

## Backend-agnostic scene (`functional/scenes/{name}.ts`)

A top-level async module. Call `createFunctionalTarget(...)`, build the scene in **fixed logical coordinates** (`width × height` — do not divide by `scale`; the harness owns device-pixel-ratio, and `scale` is always `1`), then call `render(root)` last. `await` freely for asset loading.

```typescript
import { addNodeChild, createDisplayContainer, createShape, ShapeKind } from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xff000000, // packed RGBA clear colour
  kinds: [ShapeKind], // declare EVERY node kind the scene uses
});

const root = createDisplayContainer();
// build the scene using width × height as the logical canvas
render(root);
```

`createFunctionalTarget(options)` returns `{ kind, state, width, height, scale, render(root) }`. Options (`FunctionalTargetOptions`):

- `width`, `height` (required) — logical scene size.
- `background?` — packed RGBA (e.g. `0xff000000`); omitted leaves the backend default.
- `kinds?: readonly symbol[]` — node kinds the scene uses. The harness registers the matching renderer, shape commands, and the default WebGL material for each backend off this list. **Forgetting a kind here is the classic "blank on WebGL" bug** — declare every kind you construct.
- `contextAttributes?: { alpha? }`, `syncPolicy?`, `clip?`, `cache?` — opt-ins for scenes that need them.

## Backend-specific scene (`functional/scenes/{name}.{backend}.ts`)

When a backend needs its own wiring, write a self-contained file per backend: build the backend's render state directly (`createGlRenderState` / `createCanvasRenderState` / `createWgpuRenderState`), define a local `render(root)`, build the scene, and call it. WebGPU cannot be screenshotted by the browser, so a `.webgpu.ts` scene must register itself for GPU read-back:

```typescript
import { registerWgpuFunctionalTarget } from '@ft/verify';
// … after creating `state`, before the first render:
registerWgpuFunctionalTarget(state, scale);
```

Canvas/WebGL scenes need no registration — the verifier reads back the largest canvas on the page.

## Per-scene oracle (optional — Tier 4)

Beyond the automatic not-blank check, a scene may export precise checks. The verifier reads them off the module:

```typescript
import type { Bitmap } from '@flighthq/sdk';
// throws to fail; receives the rendered frame
export function assertRender(bitmap: Readonly<Bitmap>): void | Promise<void> {
  /* sample pixels with the @flighthq/bitmap helpers (getBitmapPixelRgb, getBitmapPixelChannel)
     and throw on mismatch */
}
export const minCoverage = 0.01; // override the default non-blank fraction for this scene
```

## Logging

```typescript
import { logInfo } from '@flighthq/log';
logInfo({ nodeCount: 42, pass: true }, 'test'); // 2nd arg is the channel
```

Logs land in `logs.jsonl` after capture; the harness installs the capture sink before loading the scene, so module-init logs are captured too. (Full logging contract: the `visual-capture` skill.)

## Validate, then baseline

1. `npm run capture:functional -- --filter={name}` (auto-starts the server). If this stops right after `Ready at …` with no `screenshot.png` and a signal exit, headless Chromium's system libs are missing — run `sudo npx playwright install-deps chromium` (the sandbox grants sudo) and retry; see the `visual-capture` skill. Capture — including WebGPU — then runs in-sandbox, so do not defer baselining to the host.
2. Read `tools/output/functional/{name}/{backend}/screenshot.png` — confirm it looks right on each backend.
3. Read `tools/output/functional/{name}/{backend}/logs.jsonl` — check for `pageerror` entries.
4. When correct, set the baseline with exact selection: `npm run capture:functional:baseline -- --filter-exact={name}`. This writes the fingerprint and decoded-pixel screenshot hash into `functional/baselines/{name}.json`; the PNG itself stays gitignored.
5. Run `npm run support` and `npm run evidence:check`. Accept only the intended evidence rows, one exact renderer target at a time: `npm run evidence:baseline -- --target functional/{name}/{renderer}`. Never use a blanket evidence-manifest update.
6. Commit `functional/baselines/{name}.json`, `agents/support-matrix.{json,md}`, and `scripts/capture-baseline-coverage-manifest.json` when they changed.

A full-resolution reference PNG is a separate, explicit commissioning act rather than a side effect of the fingerprint/screenshot-hash baseline. Follow [render-reference-image-repository.md](../../../agents/render-reference-image-repository.md) for that review and release flow; do not treat a clean `evidence:check` as a reference-image blessing.

The headless pass/fail gate CI runs is `npm run test:functional` (its `smoke` / `parity` / `regression` legs) — your new scene is discovered automatically. See `agents/conventions/npm-scripts.md` for that vocabulary, and the `visual-capture` skill for capture/watch detail.
