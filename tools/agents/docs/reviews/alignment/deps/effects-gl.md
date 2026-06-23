# Dependency Alignment: @flighthq/effects-gl

**Verdict:** Clean layering and tree-shakable; one phantom dependency — `@flighthq/filters` is declared but never imported (the package uses `@flighthq/filters-gl`, a different package).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/filters` | Declared in `dependencies` but never imported in `src/` (no value or type reference). The only filter edge is `@flighthq/filters-gl` (`applyGaussianBlurFilterToGl` in `glBloomEffect.ts`). Likely confused with the `-gl` sibling, or a leftover. `packages:check` passes because it does not flag unused workspace deps. | Remove `@flighthq/filters` from `dependencies`. |
| Info | `@flighthq/filters-gl` | Cross-leaf edge: a `<subject>-gl` effect leaf depending on another `<subject>-gl` filter leaf. Not a layering violation (both sit over `render-gl`, neither reaches up), but it is the one edge a reader would not predict from "effects backend over render core" alone. Justified: bloom reuses the GL gaussian-blur pass rather than reimplementing it. No change; noted so the edge is intentional. |

All other checks pass:

- No `@flighthq/sdk` import.
- No inline cross-package types — zero local `interface`/`type` declarations; every type (`GlRenderState`, `GlRenderTarget`, `GlRenderEffectRunner`, `GlFullscreenProgram`, and all `*Effect` descriptors) is imported from `@flighthq/types`.
- All workspace deps pinned `"*"`.
- `"sideEffects": false`; `index.ts` is a thin re-export barrel with a single `.` entry, no per-file subpaths.
- Type-only imports use `import type` consistently (all `@flighthq/types` imports are `import type`); runtime imports (`@flighthq/render-gl`, `@flighthq/effects`, `@flighthq/filters-gl`, `@flighthq/geometry`) are plain `import`.
- Layering respected: depends on the header (`types`), the GL backend **core** (`render-gl`), value/math (`geometry`), the backend-agnostic effects logic (`effects` — `computeBloomBlurRadius`), and a sibling GL leaf (`filters-gl`). Nothing reaches up a layer; no dependency on other backends (`render-canvas`/`render-dom`/`render-wgpu`).

## Declared vs used

**Unused (declared, not imported):**

- `@flighthq/filters` — phantom; remove.

**Phantom (used, not declared):** none. Every imported package (`@flighthq/effects`, `@flighthq/filters-gl`, `@flighthq/geometry`, `@flighthq/render-gl`, `@flighthq/types`) is declared.

**Used and correctly declared:**

- `@flighthq/types` — 47 files (all `import type`).
- `@flighthq/render-gl` — 46 files (target acquire/release, fullscreen pass, program compile).
- `@flighthq/effects` — `glBloomEffect.ts` (`computeBloomBlurRadius`).
- `@flighthq/filters-gl` — `glBloomEffect.ts` (`applyGaussianBlurFilterToGl`).
- `@flighthq/geometry` — `glRenderEffectPipeline.ts` (`createMatrix`).
