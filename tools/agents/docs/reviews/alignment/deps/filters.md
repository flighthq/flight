# Dependency Alignment: @flighthq/filters

**Verdict:** Clean — a single type-only dependency on `@flighthq/types`, no phantom or unused deps, fully tree-shakable; nothing to fix.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Only runtime-declared dependency; imported exclusively via `import type` across all 15 filter sources, workspace-pinned `"*"`. Correct header-layer edge. | None |
| None | (barrel) `src/index.ts` | Re-exports filter type aliases (`BevelFilter`, `BitmapFilter`, …) from `@flighthq/types` via `export type { … }` rather than redefining them locally — the descriptor types live in the header layer, this package owns only the `create*` constructors and `computeBoxBlur*` math. Matches the "types in `@flighthq/types`, not inline in a consumer" rule. | None |
| None | `blurMath.ts` | Zero imports — pure cross-substrate math leaf, exactly as the package description ("shared cross-substrate blur math") advertises. Backends (`filters-canvas`, `filters-css`, GL) depend on this; this depends on no backend. Layering is respected. | None |
| None | `package.json` | No `@flighthq/sdk` import anywhere; `"sideEffects": false` declared; `devDependencies` limited to `typescript`. | None |

## Declared vs used

- **Declared:** `@flighthq/types` (dependency), `typescript` (devDependency).
- **Used (source + tests):** `@flighthq/types` only — the sole external import across every `.ts` and `.test.ts` file (15 occurrences, all `import type`). All other imports are relative (`./bevelFilter`, etc.).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none.

The dependency mapping reads exactly as a reader would predict from the package's role: a leaf of plain filter-descriptor constructors plus blur math, sitting on the type header with no cross-package or backend coupling. `packages:check` passes (86 packages valid); this audit adds no findings beyond it.
