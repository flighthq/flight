---
name: functional-test
description: Create or modify a Flight functional test under tests/functional/{name} — one scene rendered across Canvas/DOM/WebGL backends and validated by a screenshot baseline plus an in-page not-blank/oracle check. Use when adding visual coverage that jsdom unit tests cannot exercise (transforms, blending, clipping, filters, text layout, WebGL specifics) or when verifying a rendering change looks correct across backends.
---

# Writing a functional test

Functional tests live in `tests/functional/{testName}/`. Each renders one scene across one or more backends. Validation is layered: the screenshot is hashed against a committed baseline under `tools/baselines/functional/...`, the in-page verifier asserts the frame is not blank (and runs any per-test oracle), and any `pageerror` / console error fails the run. There is no per-pixel assertion primitive beyond the oracle hook below.

Write one when the behavior involves rendering jsdom cannot exercise, you want a persistent cross-backend visual record, or you want automatic regression detection. Agents are expected to add functional tests when implementing or verifying visual rendering behavior.

## File structure

A test is a single scene module plus a manifest. The per-backend render plumbing is **not** hand-written per test — it lives in the shared harness (`tests/functional/_harness`), reached through the `@ft/render` alias. (This is the current pattern; older tests with per-backend `render.canvas.ts` / `render.webgl.ts` files predate the harness and should not be copied.)

```
tests/functional/{testName}/
├── package.json
└── src/
    └── app.ts        ← the whole test: build the scene, then render(root)
```

`discoverEntries()` includes a test when `package.json` and `src/app.ts` both exist. The vite harness serves `/tests/{name}/{renderer}/` and supplies the real backend-specific `@ft/render` module at runtime; the checked-in `_harness/render.ts` is only a TypeScript stub. One `app.ts` runs on every backend — you do not write backend-specific code.

Copy `templates/package.json` and `templates/app.ts` from this skill as a starting point.

## package.json

```json
{
  "name": "functional-test-{testName}",
  "private": true,
  "type": "module",
  "dependencies": { "@flighthq/sdk": "*" }
}
```

## app.ts

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
- `contextAttributes?: { alpha? }`, `syncPolicy?`, `clip?`, `cache?` — opt-ins for tests that need them.

### When NOT to use the harness

Tests whose subject _is_ the render plumbing keep their wiring explicit and local: `blur` (offscreen render targets + filter passes) and `particle-emitter` (custom sync policy). If your test is about the plumbing rather than a scene, copy one of those and wire the backend directly. See `tests/functional/_harness/README.md` for what the harness owns and why.

## Per-test oracle (optional — Tier 4)

Beyond the automatic not-blank check, `app.ts` may export precise checks. The verifier reads them off the module:

```typescript
import type { Surface } from '@flighthq/sdk';
// throws to fail; receives the rendered frame
export function assertRender(surface: Readonly<Surface>): void | Promise<void> {
  /* sample pixels with the @flighthq/surface helpers and throw on mismatch */
}
export const minCoverage = 0.01; // override the default non-blank fraction for this test
```

## Logging

```typescript
import { logInfo } from '@flighthq/log';
logInfo({ nodeCount: 42, pass: true }, 'test'); // 2nd arg is the channel
```

Logs land in `logs.jsonl` after capture; the harness installs the capture sink before loading `app.ts`, so module-init logs are captured too. (Full logging contract: the `visual-capture` skill.)

## Validate, then baseline

1. `npm run capture:functional -- --filter={testName}` (auto-starts the server).
2. Read `tools/output/functional/{testName}/{renderer}/screenshot.png` — confirm it looks right on each backend.
3. Read `tools/output/functional/{testName}/{renderer}/logs.jsonl` — check for `pageerror` entries.
4. When correct, set the baseline: `npm run capture:functional:baseline -- --filter={testName}`.
5. Commit `tools/baselines/functional/{testName}/` (the `baseline.sha256` hash files; screenshots are gitignored).

The headless pass/fail gate that CI runs for these tests is `npm run test:functional` (its `smoke` / `parity` / `regression` legs) — your new test is discovered automatically. See `agents/conventions/npm-scripts.md` for that vocabulary, and the `visual-capture` skill for capture/watch detail.
