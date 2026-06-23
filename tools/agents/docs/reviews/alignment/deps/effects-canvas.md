# Dependency Alignment: @flighthq/effects-canvas

**Verdict:** `npm run packages:check` passes, but the manifest is out of sync with the source: `@flighthq/geometry` is used yet undeclared (phantom), while `@flighthq/filters` and `@flighthq/filters-canvas` are declared yet unused.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| High | `@flighthq/geometry` | Used (`import { createMatrix }` in `canvasRenderEffectPipeline.ts:7`) but **not declared** in `package.json`. Build works only by hoisting through another package's tree — a phantom dependency that breaks under strict isolation. | Add `"@flighthq/geometry": "*"` to `dependencies`. |
| Medium | `@flighthq/filters` | **Declared but unused** — no import anywhere in `src/` (including tests). | Remove from `dependencies` (note: sibling `effects-gl`/`effects-wgpu` also declare `filters` without importing it directly; the over-declaration looks copied across the effects family). |
| Medium | `@flighthq/filters-canvas` | **Declared but unused** — no import anywhere in `src/`. The per-state effect registry is lookup-based, so there is no static edge to the canvas filter backend. | Remove from `dependencies` unless a future runner is expected to import it; if kept as an intentional peer, document why. |
| Info | `@flighthq/displayobject-canvas` | Declared + used (`createCanvasRenderTarget`/`begin`/`end`/`resize`). This is the surprising-looking but correct edge: it is the Canvas render-core substrate effects-canvas composites into, the parallel of `effects-gl → render-gl`. No render-core crate exists for Canvas; the target lives here. Reads cleanly once that mapping is known. | None. |

Beyond `packages:check`: the tool validates monorepo shape, references, and `*` pinning (all green), but does not cross-check declared-vs-imported, so it missed both the phantom `geometry` edge and the two unused filter deps. All real deps are pinned `"*"` correctly.

## Declared vs used

- **Unused (declared, not imported):** `@flighthq/filters`, `@flighthq/filters-canvas`.
- **Phantom (imported, not declared):** `@flighthq/geometry`.
- **Correct (declared + used):** `@flighthq/effects` (`computeBloomBlurRadius`), `@flighthq/displayobject-canvas` (canvas render targets), `@flighthq/types` (43 `import type` lines — all cross-package types sourced from the header layer; none redefined inline).

Other axes clean: no `@flighthq/sdk` import; no inline cross-package types (zero locally-exported interfaces/types); `"sideEffects": false`; all 43 `@flighthq/types` imports are `import type`, pulling no runtime weight.
