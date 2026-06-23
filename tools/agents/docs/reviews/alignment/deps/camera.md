# Dependency Alignment: @flighthq/camera

**Verdict:** Clean — three declared deps (`entity`, `geometry`, `types`), all used, all pinned `"*"`; no phantom/unused deps, no barrel import, no inline cross-package types. The mapping reads exactly as the package's purpose predicts.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| — | (none) | `packages:check` passes (86 packages valid) with no camera findings. All four hygiene axes hold: declared = used, types come from `@flighthq/types`, no `@flighthq/sdk` edge, `"sideEffects": false` with type-only imports using `import type`. | — |
| Info | `@flighthq/entity` | Used solely for `createEntity` in `createCamera` (camera.ts:14). This is the one runtime (non-math) dep and is the only edge a reader might not predict from a "3D camera math" description — but it is the codebase-wide entity/runtime primitive, correct per the entity/runtime split convention, and minimal. Not a violation; noted only because it is the least obvious edge. | None needed. |
| Info | `CameraOptions` (camera.ts:79) | Package-local `*Options` structural input, defined inline — this is correct. It is not a cross-package type (not consumed elsewhere, not a `*Like`/entity contract); the cross-package types `Camera`, `Matrix4Like`, `Vector3Like`, `Projection`, `OrthographicProjection`, `PerspectiveProjection` all come from `@flighthq/types` via `import type`. | None needed. |

## Declared vs used

- **Declared:** `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/types` (all `"*"`); dev: `typescript`.
- **Used in src:**
  - `@flighthq/entity` — `createEntity` (camera.ts).
  - `@flighthq/geometry` — `createMatrix4`, `createVector2`, `inverseMatrix4`, `multiplyMatrix4`, `setMatrix4LookAt` (camera.ts); `setOrthographicMatrix4`, `setPerspectiveMatrix4` (projection.ts).
  - `@flighthq/types` (type-only) — `Camera`, `Matrix4Like`, `Vector3Like`, `Projection` (camera.ts); `Matrix4Like`, `OrthographicProjection`, `PerspectiveProjection`, `Projection` (projection.ts).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. (Test files add `createPerspectiveMatrix4`, `createVector3`, `setOrthographicMatrix4` from `@flighthq/geometry` and projection types from `@flighthq/types` — both already declared.)
- **Workspace pinning:** all three workspace deps pinned `"*"`. Correct.
