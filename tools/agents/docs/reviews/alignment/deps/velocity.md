# Dependency Alignment: @flighthq/velocity

**Verdict:** Clean — declared deps exactly match usage, layering is downward and predictable, no `@flighthq/sdk` import, no inline cross-package types; nothing to fix.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | — | `npm run packages:check` passes; cross-check of declared deps against `src/` imports found no unused, phantom, or mis-placed edges | — |

Judgment notes (no action required):

- **`@flighthq/types` in `dependencies`, used type-only.** All three velocity contracts (`Velocity2D`, `VelocitySample`, `VelocityField`) plus `Transform2DNode` are imported with `import type` from `@flighthq/types` (`packages/types/src/Velocity.ts`). Listing the header layer as a real runtime `dependency` (not a devDep) is the codebase convention; it carries no runtime weight and the package stays `"sideEffects": false`. Correct as-is.
- **`@flighthq/displayobject` correctly demoted to `devDependencies`.** Its only consumer is `transformVelocity.test.ts` (`createDisplayObject`), used as a concrete `Transform2DNode` fixture. Source files depend only on the feature alias `Transform2DNode` from `@flighthq/types`, never on `@flighthq/displayobject` — so velocity stays graph-family-agnostic (works for sprite graphs too) and the heavy display-object package never enters the published dependency closure.
- **Layering is textbook-downward.** velocity → `@flighthq/geometry` (matrix copy/create) + `@flighthq/node` (world-transform + child walk) + `@flighthq/types` (header). No sideways edge to another renderer/backend, no reach "up" into a graph family, no `@flighthq/sdk`. The edge set is exactly what the package's purpose (a generic per-node velocity field with a transform-delta baseline) predicts.
- **Workspace deps pinned `"*"`** across both `dependencies` and `devDependencies`, matching convention.

## Declared vs used

**Unused declared deps:** none.

- `@flighthq/geometry` — used (`copyMatrix`, `createMatrix` in `transformVelocity.ts`).
- `@flighthq/node` — used (`ensureNodeWorldTransformMatrix`, `getNodeChildAt`, `getNodeChildCount`, `getNodeWorldTransformMatrix` in `transformVelocity.ts`).
- `@flighthq/types` — used (type-only: `Velocity2D`, `VelocitySample`, `VelocityField`, `Transform2DNode`).
- `@flighthq/displayobject` (dev) — used (`createDisplayObject` in `transformVelocity.test.ts`).
- `typescript` (dev) — build toolchain.

**Phantom (used-but-undeclared) deps:** none. Every `@flighthq/*` specifier imported in `src/` (including tests) resolves to a declared dependency or devDependency.
