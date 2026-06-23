# Dependency Alignment: @flighthq/filters-gl

**Verdict:** Clean and well-layered runtime deps; one stale unused `devDependency` (`@flighthq/surface`) is the only blemish — `npm run packages:check` passes and reports nothing.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Low | `@flighthq/surface` (devDependency) | Declared but never imported anywhere in `src/` (no value or `import type`; the seven `surface`/`Surface` hits in src are all prose comments referencing the CPU reference paths like `applyConvolutionFilterToSurface`/`bevelSurface`). `packages:check` does not flag unused devDeps, so this is invisible to the tooling. Almost certainly a scaffold leftover or stale cousin of `@flighthq/filters-surface`, which legitimately depends on `@flighthq/surface`. | Remove `@flighthq/surface` from `devDependencies`. |
| Info | `@flighthq/render-gl` (dependency) | Correct layering: a `<subject>-<backend>` leaf depending on the backend core (`render-gl`). The edge is non-circular — `render-gl` does not depend back on `filters` or `filters-gl`. Predictable from the package's role. No action. | — |
| Info | `@flighthq/filters` (dependency) | Correctly a runtime `dependency` (not dev): `glBlurFilter.ts` imports the value `computeBoxBlurPassRadius` (shared cross-substrate blur math). Reuses the CPU package's math rather than redefining it — good hygiene. No action. | — |
| Info | `@flighthq/types` (dependency) | All cross-package types (`GlRenderState`, `GlFullscreenProgram`, the `*Filter` descriptors, `GlRenderStateRuntime`) come from the header layer via `import type`; only the runtime value `EntityRuntimeKey` is a value import (in `glTestHelper.ts`). No inline cross-package type redefinition anywhere. Correct. | — |

## Declared vs used

**Unused (declared, not imported):**

- `@flighthq/surface` — devDependency; zero imports in `src/`, tests, or config. Remove.

**Phantom (imported, not declared):** none. Every imported package is declared:

- `@flighthq/render-gl` → declared `dependency` ✓ (value imports: `clearGlRenderTarget`, `compileGlFullscreenProgram`, `drawGlFullscreenPass`)
- `@flighthq/types` → declared `dependency` ✓ (value: `EntityRuntimeKey`; rest `import type`)
- `@flighthq/filters` → declared `dependency` ✓ (value: `computeBoxBlurPassRadius`)
- `typescript` → declared `devDependency` ✓

**Other checks:**

- No import of `@flighthq/sdk` (barrel). ✓
- All workspace deps pinned `"*"`. ✓
- `"sideEffects": false` and `import type` used for all type-only cross-package imports; package stays tree-shakable. ✓
- Single root `.` export entry; no per-file subpaths. ✓
- Type-only imports kept on their own `import type {}` lines (e.g. `glBevelFilter.ts`, `glBlurFilter.ts`). ✓
- Dependency mapping reads cleanly: a WebGL filter-backend leaf depending on the GL render core + filter math + the type header is exactly what the package's purpose predicts. The only edge that does not read cleanly is the unused `@flighthq/surface`.
