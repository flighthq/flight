# Dependency Alignment: @flighthq/scene

**Verdict:** Clean and predictable — one unused declared dependency (`@flighthq/signals`), no phantom deps, no boundary or barrel violations.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Low | `@flighthq/signals` (dependency) | Declared but never imported in `src/` (or tests). Scene exposes signal enablement (`enableSceneNodeSignals`, `getSceneNodeSignals`, mesh equivalents) by delegating entirely to `@flighthq/node` (`enableNodeSignals`/`getNodeSignals`); the `NodeSignals` type it references comes from `@flighthq/types`, not from `@flighthq/signals`. `node` already declares `signals` itself. This matches `sprite`'s pattern (delegates to `node`, does **not** declare `signals`), not `displayobject`'s (declares **and** uses it directly in `stage.ts`). | Remove `@flighthq/signals` from `dependencies`; it is pulled in transitively through `@flighthq/node`, which owns the signals wiring. |
| Info | `@flighthq/geometry`, `@flighthq/node`, `@flighthq/types` (dependencies) | All present and directly used (`createMatrix4`; `createNode`/`createNodeRuntime`/`enableNodeSignals`/`getNodeRuntime`/`getNodeSignals`; all scene/mesh types + kinds). Edges read cleanly for a 3D node-family graph package. | None. |
| Info | `@flighthq/materials`, `@flighthq/mesh` (devDependencies) | Both used only in `mesh.test.ts` (`createStandardPbrMaterial`, `createBoxMeshGeometry`) — correctly dev-scoped, not runtime deps. Keeping the renderable inputs (mesh geometry, materials) out of runtime deps is the right call: scene stores `geometry`/`materials` by reference via `@flighthq/types` contracts and never constructs them. | None. |
| Info | Layering / barrel / types | No import of `@flighthq/sdk`. No inline cross-package types — every cross-package type (`SceneNode`, `Mesh`, `Material`, `MeshGeometry`, `NodeSignals`, `Kind`, runtime/traits) is sourced from `@flighthq/types`. Type-only imports use `import type` on their own lines. `"sideEffects": false` declared; no top-level side effects. Depends "down" only (types/geometry/node), never on renderers or a peer node family. | None. |

## Declared vs used

**Unused (declared, not imported):**

- `@flighthq/signals` — declared in `dependencies`; no import in `src/`. Reachable transitively via `@flighthq/node`. Remove.

**Phantom (imported, not declared):**

- None. Every non-test import (`@flighthq/geometry`, `@flighthq/node`, `@flighthq/types`) is declared. Test-only imports (`@flighthq/materials`, `@flighthq/mesh`, `vitest`) are correctly in `devDependencies`.

**Pinning:** All workspace deps pinned `"*"` per convention.
