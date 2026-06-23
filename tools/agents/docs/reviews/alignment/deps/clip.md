# Dependency Alignment: @flighthq/clip

**Verdict:** Clean. The three declared deps (`geometry`, `path`, `types`) are minimal, correct, pinned `"*"`, all used, and read exactly as a path/rectangle-to-`ClipRegion` value-leaf should — no issues beyond what `packages:check` already passes.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/types` | Imported type-only and correctly via a dedicated `import type { ClipRegion, Path, Rectangle }` line; `ClipRegion` is defined in `@flighthq/types` (`ClipRegion.ts`), not redefined inline. No action — confirms header-layer discipline. | — |
| Info | `@flighthq/geometry`, `@flighthq/path` | Runtime value deps (`cloneRectangle`/`createRectangle`, `flattenPath`). Both lower-level value crates; clip reaches down, never up or sideways. Mapping is predictable from purpose. | — |
| Info | `tsconfig.json` references | `references` lists exactly `../geometry`, `../path`, `../types` — in sync with `dependencies`. No stale or missing project reference. | — |
| Nit | `setRectangleToContoursBounds` typed param `readonly (readonly number[])[]` vs `flattenPath` return `number[][]` | Source-internal type tightening, not a dependency-hygiene issue. The contour shape from `@flighthq/path` is `number[][]`; clip narrows it locally. Worth noting only that the contour element type is duplicated by structural shape rather than a shared named type, but it is a primitive array and crosses no entity boundary, so it does not warrant a `@flighthq/types` definition. | None required. |

No `@flighthq/sdk` import. No inline cross-package types. No backend/renderer coupling. `"sideEffects": false`; package stays tree-shakable.

## Declared vs used

- **Unused declared deps:** none. All three dependencies are imported in `src/clipRegion.ts`.
- **Phantom (used-but-undeclared) deps:** none. The only `@flighthq/*` specifiers in `src/` are `geometry`, `path`, `types`, all declared. (`src/clipRegion.test.ts` also imports only those three.)
- **Pinning:** all workspace deps pinned `"*"` as required.
