# Dependency Alignment: @flighthq/application

**Verdict:** Clean — both declared deps are used, pinned, and predictable; no `@flighthq/sdk` import, no inline cross-package types, no layering violations. The only notes are non-blocking: two non-barrelled alias files (`webApplication.ts` / `webWindow.ts`) and the question of whether `RenderState`/`Matrix` edges belong in a window package.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/signals` | Used for entity construction (`createSignal`) and dispatch (`connect/disconnect/emit/cancelSignal`). Correct, minimal, pinned `"*"`. Predictable: a window/app entity-of-signals package must depend on signals. | None. |
| Info | `@flighthq/types` | Header-layer import only; all imported names (`Application`, `ApplicationWindow`, `Matrix`, `RenderState`, `WindowBackend`, `WindowBounds`, `WindowOptions`) are `import type` and genuinely used. No types redefined inline. | None. |
| Low | `@flighthq/types` → `RenderState` / `Matrix` edge | `attachWindowRenderState` and `computeWindowDeviceTransform` pull render-pipeline types into a window/app package. These are type-only (no runtime weight, no dep on `@flighthq/render`), so tree-shaking and layering are intact — but the edge is mildly surprising for a package described as "bridging platform events to the scene graph." It couples windowing to the render-state shape. Worth confirming this glue belongs here vs. in `@flighthq/render`. | Keep if intentional (type-only, no runtime coupling). Otherwise consider moving render-state wiring closer to render. |
| Low | (package shape, not a dep edge) | `webApplication.ts` and `webWindow.ts` re-export aliases (`createWebApplication`, `createWebWindow`, `createAppWindow`, `AppWindow`) but are NOT in the `index.ts` barrel; they are only referenced by their own colocated tests. They are effectively dead public surface — neither exported nor used by examples. | Remove the alias files (and their tests), or fold the chosen aliases into the barrel. Don't leave non-barrelled, untested-by-anything-real files. |

## Declared vs used

**Unused declared dependencies:** none. Both `@flighthq/signals` and `@flighthq/types` are imported in `src/`.

**Phantom (used-but-undeclared) dependencies:** none. The only `@flighthq/*` imports in source are `@flighthq/signals` and `@flighthq/types`, both declared.

**Pinning:** both workspace deps pinned `"*"` as required. `typescript` correctly in `devDependencies`. `"sideEffects": false` set; type-only cross-package imports use `import type`. No `@flighthq/sdk` import. `npm run packages:check` passes (86 packages valid).
