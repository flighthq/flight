# Dependency Alignment: @flighthq/shape

**Verdict:** Clean layering and types hygiene; one defect — `@flighthq/geometry` is declared as a runtime `dependency` but is used only in a test, so it should move to `devDependencies`.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/geometry` | Declared as a runtime `dependency` but imported only in `shape.test.ts` (`createRectangle`); no non-test source imports it. This falsely advertises that consumers pulling `@flighthq/shape` also pull `geometry`, and is the kind of unused-runtime-dep `packages:check` does not detect (it only enforces `"*"` pinning). The repo already has a convention of placing test-only `@flighthq/*` deps in `devDependencies` (e.g. `interaction`, `render`, `scene`, `velocity`, `filters-gl`). | Move `@flighthq/geometry` from `dependencies` to `devDependencies`. |
| Info | `@flighthq/node` (direct edge) | shape imports `invalidateNodeLocalBounds`/`invalidateNodeLocalContent` directly from `@flighthq/node` even though it also depends on `displayobject` (which depends on `node`). This is correct, not a violation: `displayobject` does not re-export these, and depending directly on the owning package is the explicit, preferred choice over transitive reliance. Noted only because a direct `node` edge alongside `displayobject` could look redundant at a glance. | None. |

Checks that passed (no findings):

- No `@flighthq/sdk` (barrel) import anywhere.
- No inline cross-package types: all shared types (`Shape`, `ShapeData`, `ShapeRuntime`, `Scale9Shape*`, `Path`, `PathCommand`, `ShapeFillRegion`, `ShapeHitTestCommand`, `*Kind`, style/gradient enums, `Matrix`, `Rectangle`, `Node`, `PartialNode`, `ImageResource`) come from `@flighthq/types`. `PathCommand` is intentionally re-exported from `@flighthq/types`, not redefined.
- All type-only imports use `import type` (or import a runtime value where the value is genuinely used, e.g. `PathCommand`, `*Kind`). `"sideEffects": false` is set; package stays tree-shakable.
- Layering reads cleanly for a vector display node: `shape → displayobject → node → types`. No cross-renderer/backend edges, nothing reaches "up" a layer, no surprising edges.
- No phantom (used-but-undeclared) deps: every non-test import (`displayobject`, `node`, `types`) is declared. All `@flighthq/*` deps pinned `"*"`.

## Declared vs used

Declared runtime `dependencies`: `@flighthq/displayobject`, `@flighthq/geometry`, `@flighthq/node`, `@flighthq/types`.

Used in non-test `src/`: `@flighthq/displayobject`, `@flighthq/node`, `@flighthq/types`.

- **Unused (runtime):** `@flighthq/geometry` — used only by `shape.test.ts`; belongs in `devDependencies`.
- **Phantom (used-but-undeclared):** none.
- **Test-only (currently mis-placed):** `@flighthq/geometry` (this is the same row as Unused — it is used, but only in tests).
