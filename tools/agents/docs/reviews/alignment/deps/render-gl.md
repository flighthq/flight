# Dependency Alignment: @flighthq/render-gl

**Verdict:** Clean and well-layered — no boundary, barrel, or inline-type violations; the only nit is `@flighthq/displayobject` declared as a runtime `dependency` while it is used solely as a test fixture (and `packages:check` passes, so this is not caught automatically).

`npm run packages:check` passes (86 packages, 16 examples valid). Everything below is judgment beyond that gate.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Low | `@flighthq/displayobject` | Declared in `dependencies`, but its only import (`createDisplayObject`) is in `glRenderTarget.test.ts`. Runtime source references display objects only via the `DisplayObject` _type_ from `@flighthq/types`. The codebase already treats test-only workspace deps as `devDependencies` (e.g. `@flighthq/render` lists `camera`/`lighting`/`mesh`/`scene` as devDeps). For consistency this belongs under `devDependencies`. | Move `@flighthq/displayobject` from `dependencies` to `devDependencies`. Note: sibling `@flighthq/render-wgpu` has the identical misclassification, so fix both for symmetry (or leave both and treat as accepted convention — `packages:check` does not enforce the split). |
| Info | `@flighthq/render` edge | Correct and expected: render-gl is a backend **core** layering over the backend-agnostic `render` core (`createRenderState`, `createRenderStateRuntime`, `setRenderStateBackgroundColor`, `getOrCreateRenderProxy2D`). No reach "up" a layer, no edge to another backend (no `render-wgpu`/`render-canvas`/`displayobject-gl`). Layering is respected. | None. |
| Info | `@flighthq/types` edge | All cross-package types come from the header (`GlRenderState`, `GlBitmapShader`, `DisplayObject`, `Material`, `RenderProxy2D`, etc.), via `import type`. `glShaderTypes.ts` and `internal.ts` are pure re-exports from `@flighthq/types` — no inline cross-package type definitions. | None. |

Checklist results:

- No `@flighthq/sdk` import. Confirmed (grep: none).
- No inline cross-package types — all type definitions live in `@flighthq/types`; the package only re-exports them.
- All type imports use `import type` on dedicated lines; `"sideEffects": false` is declared; no runtime weight pulled by types.
- Workspace deps are pinned `"*"`. Confirmed for all four.
- Dependency mapping reads cleanly: a backend GPU core depending on `render` + `geometry` + `types` is exactly what a reader would predict from its role. The lone surprising edge (`displayobject`) is test-only and dissolves once reclassified.

## Declared vs used

**Declared dependencies (4):** `@flighthq/displayobject`, `@flighthq/geometry`, `@flighthq/render`, `@flighthq/types`.

- `@flighthq/geometry` — used at runtime (`glRenderTarget.ts`, `glRenderState.ts`: matrix helpers). Correct.
- `@flighthq/render` — used at runtime (`glRenderState.ts`, `glShaderBinding.ts`). Correct.
- `@flighthq/types` — used everywhere as the type header (23 import sites). Correct.
- `@flighthq/displayobject` — **used only in `glRenderTarget.test.ts`** as a test fixture. Should be a `devDependency`.

**Unused declared deps:** none (all four are imported somewhere).

**Phantom deps (used but undeclared):** none. Every non-relative import (`@flighthq/types`, `@flighthq/render`, `@flighthq/geometry`, `@flighthq/displayobject`) is declared.
