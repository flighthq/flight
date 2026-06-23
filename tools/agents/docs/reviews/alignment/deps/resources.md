# Dependency Alignment: @flighthq/resources

**Verdict:** Clean overall — no `@flighthq/sdk` import, no inline cross-package types, all `@flighthq/types` imports are type-only, `"sideEffects": false` holds — but one misplaced edge: `@flighthq/geometry` is declared as a runtime `dependency` while it is used only in a test file, and per the codebase's own convention (`velocity`, `interaction`) test-only flight deps belong in `devDependencies`.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/geometry` (in `dependencies`) | Imported only in `src/textureAtlasRegion.test.ts` (`createRectangle`, `createVector2`); zero references in any shipped (non-test) source. Declared as a runtime `dependency`, so it is effectively unused at runtime. The codebase convention is to place test-only `@flighthq/*` deps in `devDependencies` — see `@flighthq/velocity` (`@flighthq/displayobject`) and `@flighthq/interaction` (`@flighthq/sprite`), both test-only and both in `devDependencies`. `packages:check` does not catch this (it validates `"*"` pinning, tsconfig paths/refs, side-effects, export targets — not import-vs-dep placement). | Move `@flighthq/geometry` from `dependencies` to `devDependencies` (keep `"*"`). The shipped public API references geometry types only via `RectangleLike` / `Vector2Like` re-exported from `@flighthq/types`, so no runtime geometry edge is needed. |
| Info | `@flighthq/entity` | Correctly a runtime dependency: `createEntity` is a value import used across `font.ts`, `imageResource.ts`, `imageResourceFrom.ts`, `textureAtlas.ts`, `tileset.ts`, `textureAtlasRegion.ts`. Maps cleanly to the package's role (resource entities). | None. |
| Info | `@flighthq/types` | Correct and type-only: every `@flighthq/types` import is `import type` (`ImageResource`, `TextureAtlas`, `Tileset`, `Font`, `FontResource`, `AudioResource`, `VideoResource`, `RectangleLike`, `Vector2Like`, etc.). No inline cross-package type definitions exist in src. Header-layer dependency reads exactly as expected. | None. |

## Declared vs used

**Declared dependencies:** `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/types` (all pinned `"*"` ✓). devDependencies: `typescript`.

- **Unused at runtime (misplaced):** `@flighthq/geometry` — declared in `dependencies` but imported only in `textureAtlasRegion.test.ts`. Not a true phantom (it is genuinely needed to compile/run the test), but wrong section: should be `devDependencies`.
- **Phantom (used-but-undeclared):** none. The only `@flighthq/*` imports across all src are `entity`, `geometry`, `types` — all three are declared.
- **Correctly placed runtime deps:** `@flighthq/entity` (value: `createEntity`), `@flighthq/types` (type-only).
- **No `@flighthq/sdk` import.** ✓
- **`"sideEffects": false`** present; no top-level side effects (confirmed by `packages:check`). Tree-shakable. ✓
