# Dependency Alignment: @flighthq/path

**Verdict:** Clean — the single declared dependency (`@flighthq/types`, pinned `*`) is the only thing imported, all cross-package types come from the header, and the type/value import split is correct; no action needed.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Sole declared dependency; supplies all four cross-package symbols used (`Path`, `PathMesh`, `PathWinding` as types; `PathCommand` as a runtime const). Pinned `"*"` per workspace convention. | — |
| None | (no `@flighthq/sdk`) | No barrel import. | — |
| None | inline types | No cross-package types redefined inline; `Path`/`PathMesh`/`PathWinding`/`PathCommand` all sourced from `@flighthq/types` (`Path.ts`, `PathMesh.ts`, `ShapeCommand.ts`). | — |
| None | `import type` discipline | Type-only symbols (`Path`, `PathMesh`, `PathWinding`) use `import type`; `PathCommand` is a `const` object used at runtime (`PathCommand.MOVE_TO`, etc.) and is correctly a value import. `sideEffects: false` holds — package is pure leaf math. | — |
| None | layering | Lowest-layer value/math leaf (curve flattening + ear-clip tessellation). Depends only on the header; no upward reach, no renderer/backend edges. Matches the "mixable value-in/value-out leaf" role described in rust/index.md. | — |

## Declared vs used

- **Declared, used:** `@flighthq/types` (runtime dep) — used by `path.ts`, `flattenPath.ts`, `tessellatePath.ts`. `typescript` (dev) — build only.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. The only non-relative import across all source files is `@flighthq/types`, and intra-package imports are relative (`./flattenPath`).

The dependency mapping reads exactly as a reader would predict from the package purpose ("vector path geometry: curve flattening and tessellation of GraphicsPath outlines"): a pure geometry leaf needs only the shared type header. `packages:check` passes with no path-specific notes.
