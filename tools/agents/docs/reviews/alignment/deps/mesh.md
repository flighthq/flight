# Dependency Alignment: @flighthq/mesh

**Verdict:** One real issue — `@flighthq/entity` is a phantom dependency (imported as a runtime value but undeclared, currently masked by workspace hoisting); everything else (no `@flighthq/sdk`, no inline cross-package types, type-only imports, tree-shaking, layering) is clean.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| High | `@flighthq/entity` | Phantom (used-but-undeclared). `meshGeometry.ts` imports `createEntity` — a runtime value, not type-only — from `@flighthq/entity`, but the package is absent from `package.json` `dependencies`. It only resolves because the workspace hoists it (it is a transitive dep via `@flighthq/geometry`). `packages:check` passes regardless, so this is judgment beyond the tool. Peer `@flighthq/node` does the identical `createEntity` import and declares `@flighthq/entity` directly — that is the convention mesh should match. | Add `"@flighthq/entity": "*"` to `dependencies`. |
| Info | `@flighthq/geometry`, `@flighthq/types` | Correctly declared, both used as runtime + type imports, pinned `"*"`. No action. | — |
| Info | layering / mapping | Reads cleanly for a value/math leaf crate: depends on the entity primitive, geometry math (`createAabb`), and the `@flighthq/types` header. No backend, no render-core, no cross-boundary or "upward" edge. Predictable from the package's purpose. | — |

## Declared vs used

- **Declared:** `@flighthq/geometry`, `@flighthq/types` (+ devDep `typescript`).
- **Used in `src/` (non-test):** `@flighthq/entity` (`createEntity` value, `EntityRuntimeKey` value), `@flighthq/geometry` (`createAabb` value), `@flighthq/types` (types: `MeshGeometry`, `MeshGeometryRuntime`, `MeshSubset`, `PrimitiveTopology`, `VertexAttributeLayout`, `AabbLike`; value: `EntityRuntimeKey`).
- **Unused declared:** none.
- **Phantom (used, undeclared):** `@flighthq/entity` — runtime import, must be declared.

### Hygiene checks (all clean)

- No import of `@flighthq/sdk`.
- No inline cross-package types — every cross-package type comes from `@flighthq/types`.
- `import type { ... }` used on its own lines for all type-only imports; runtime values imported separately. No type import pulls runtime weight.
- `"sideEffects": false`; single root `.` export, no per-file subpaths — stays tree-shakable.
- Workspace deps pinned `"*"`.
