# Dependency Alignment: @flighthq/node

**Verdict:** Dependency surface is minimal and correct (all 4 declared deps used, none phantom, no `@flighthq/sdk`, no inline cross-package types); the one defect is a self-referential barrel import in `transform2d.ts` that should be a relative path.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `transform2d.ts` → `@flighthq/node` (self) | The package imports its own root barrel: `import { computeNodeWorldTransformRevision } from '@flighthq/node'`. The symbol is defined locally in `revision.ts`. Sibling `transform3d.ts` imports the same function correctly via `./revision`. The self-barrel import creates an intra-package cycle (file → own barrel → file), risks build-order/tree-shaking surprises, and is inconsistent with the rest of the package. `packages:check` does not catch it. | Change line 9 of `transform2d.ts` to `import { computeNodeWorldTransformRevision } from './revision';` to match `transform3d.ts`. |
| Info | `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/signals` | Runtime (value) imports, not type-only — correctly declared as `dependencies`, not flagged. `entity` (`createEntityRuntime`/`getEntityRuntime`), `geometry` (`createMatrix4`, `createRectangle`, matrix ops), `signals` (`createSignal`, `emitSignal`) are all genuinely invoked at runtime. | None. |
| Info | layering | Edges read cleanly for a base scene-graph package: depends only on the header (`types`), value primitives (`geometry`), the entity/runtime base (`entity`), and notification infra (`signals`). No reach-up into `render`/`displayobject`/`sprite`, no cross-backend edges, no `@flighthq/sdk`. Workspace deps pinned `"*"`. `"sideEffects": false`. Cross-package types come from / are re-exported through `@flighthq/types` (e.g. `hasTransform3d.ts` re-exports `HasTransform3D`); no inline cross-package type definitions. | None. |

## Declared vs used

- **Declared:** `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/signals`, `@flighthq/types` (+ devDep `typescript`).
- **Used in non-test source:** `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/signals`, `@flighthq/types` — all four.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. (`@flighthq/node` appears in `transform2d.ts` as a self-import, not an external dependency — it is the Medium finding above, not a missing declaration.)
