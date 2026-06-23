# Dependency Alignment: @flighthq/textshaper-canvas

**Verdict:** Mostly clean (no `sdk` import, no inline cross-package types, `import type` honored, all workspace deps pinned `"*"`, `sideEffects: false`), but two real edges: a surprising upward dependency on `@flighthq/render` for a single pure helper, and `@flighthq/textshaper` declared as a runtime dependency despite being used only in tests. `npm run packages:check` passes; both findings are judgment beyond it.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| High | `@flighthq/textshaper` (declared `dependency`) | Imported **only** in `canvasTextShaper.test.ts` (`getTextShaperBackend`/`setTextShaperBackend`); no `src/` runtime file imports it. Declared as a runtime dep, so the published package graph claims a dependency the shipped code does not have. | Move `@flighthq/textshaper` to `devDependencies`. The runtime package only needs the `TextShaperBackend` contract from `@flighthq/types`, which it already has. |
| Medium | `@flighthq/render` (declared `dependency`, used in `src/`) | Surprising upward/cross-layer edge. `textshaper-canvas` is the **only** text/shaping package that depends on the render core; every other `@flighthq/render` consumer is a renderer-layer package (`render-gl`, `displayobject-*`, `scene-*`, `sdk`). It pulls in render solely to reach `computeTextFormatFontString` — a pure, types-only CSS-font-string formatter (`renderTextFormat.ts`) with no render-state, queue, or pipeline involvement. Via render it transitively declares a path to `displayobject`, `sprite`, `node`, `entity`, `geometry`, `materials` — the whole scene-graph/render stack — for one string helper. A measure-only shaper backend should not sit downstream of the renderer. | Relocate `computeTextFormatFontString` to a text-domain home both packages share (e.g. `@flighthq/text`/`@flighthq/textlayout`, or `@flighthq/types` as a pure formatter) so `textshaper-canvas` depends on the text/header layer, not the renderer. Then drop `@flighthq/render` here. The font string is a Canvas/CSS text concern; its current placement in render core is the root miscategorization. (Cross-package move — surface to user rather than act autonomously.) |
| Info | `@flighthq/types` | Correct: type-only import (`TextFormat`, `TextShaperBackend`) on its own `import type` line; this is the contract the backend implements. No action. | — |

## Declared vs used

**Declared dependencies:** `@flighthq/render`, `@flighthq/textshaper`, `@flighthq/types`.

- **Unused at runtime (mis-scoped):** `@flighthq/textshaper` — used only by the test file, never by `src/` runtime code. Belongs in `devDependencies`, not `dependencies`.
- **Phantom (used-but-undeclared):** none. Every value/type imported in `src/` resolves to a declared dep (`@flighthq/render`, `@flighthq/types`); `@flighthq/textshaper` in the test resolves to a declared dep too.
- **Used and correctly declared:** `@flighthq/render` (value: `computeTextFormatFontString` — declared correctly _as a dep_, though the edge itself is questionable; see Medium finding), `@flighthq/types` (type-only).
- **Pinning:** all three workspace deps pinned `"*"` per convention. `devDependencies` only `typescript`.
