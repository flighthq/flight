# Dependency Alignment: @flighthq/sprite

**Verdict:** Clean. Four declared deps, all used and correctly pinned `"*"`; no phantom/unused deps, no barrel import, no inline cross-package types, and every edge is predictable from the package's role.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/displayobject` | Edge is justified, not a surprise: every sprite-family type (`Sprite`, `QuadBatch`, `Tilemap`, plus particle emitter) `extends DisplayObject`/`DisplayObjectData`/`DisplayObjectRuntime` in `@flighthq/types`, and the package consumes exactly `createDisplayObjectGeneric` / `createDisplayObjectRuntime` / `getDisplayObjectRuntime`. The package-map line "sprite/tilemap/quad-batch graph" sits in the display-object family, so depending on `displayobject` (not a sibling renderer) is the correct layering. | — |
| None | `@flighthq/node` | Used for graph/bounds invalidation (`invalidateNodeLocalBounds`, `getNodeLocalBounds*`). Depends on the shared hierarchy feature layer, not across a boundary. | — |
| None | `@flighthq/geometry` | Used for rectangle ops and typed-array reserve helpers in the batch paths. Expected for a batch-rendering graph. | — |
| None | `@flighthq/types` | All cross-package types (`Sprite`, `QuadBatchData`, `TilemapRuntime`, `TextureAtlas`, `MethodsOf`, etc.) and all `*Kind` strings sourced here. Types imported with `import type`; only the `*Kind` value imports are runtime. | — |

Checklist results (beyond `npm run packages:check`, which reports `86 packages valid`):

- No `@flighthq/sdk` (barrel) import. Confirmed absent.
- No `@flighthq/render*` import — sprite is a graph package, not a renderer; correctly does not reach into render core or backends.
- No inline cross-package types: zero `interface`/`type` declarations in src; all shapes come from `@flighthq/types`.
- Type-only imports use a dedicated `import type { }` line in every file; value imports limited to functions and `*Kind` constants. Tree-shakable, `"sideEffects": false`.
- Workspace deps all pinned `"*"`.

## Declared vs used

- **Unused declared:** none. All four (`@flighthq/displayobject`, `@flighthq/geometry`, `@flighthq/node`, `@flighthq/types`) are imported in src.
- **Phantom (used-but-undeclared):** none. Every `@flighthq/*` import resolves to a declared dependency.
