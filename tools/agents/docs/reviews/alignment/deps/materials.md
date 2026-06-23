# Dependency Alignment: @flighthq/materials

**Verdict:** Clean dependency set (`@flighthq/entity` + `@flighthq/types`, both used, both pinned `*`); the only issue is a cross-package type alias `LinearColor` defined inline here instead of in the `@flighthq/types` header.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `LinearColor` (type, defined in `src/color.ts`) | Cross-package type alias defined inline in this consumer, violating the "shared types cross boundaries → `@flighthq/types`" rule. It is imported by `@flighthq/scene-gl` renderers (`phongGlMeshMaterialRenderer.ts`, `glUnlitPrelude.ts`, `specularPbrGlMeshMaterialRenderer.ts`, `sheenPbrGlMeshMaterialRenderer.ts`, `matcapGlMeshMaterialRenderer.ts`, and others) via `import type { LinearColor } from '@flighthq/materials'`. The header layer should be navigable without importing implementation packages, but a downstream renderer must currently reach into `materials` for a pure value-type alias. | Move `export type LinearColor = [number, number, number, number]` into `@flighthq/types`, re-export/consume from there in both `materials` and `scene-gl`. (Cross-package change — surface to user before acting.) |
| Info | `@flighthq/entity` | Correct and minimal: used at runtime by `colorTransform.ts`, `colorTransformMaterial.ts`, and `material.ts` for `createEntity`. Carries no transitive weight beyond `@flighthq/types`. Edge is predictable for an entity-backed package. | None. |
| Info | `@flighthq/types` | Header-layer dep; all material kinds, `Material`/`SurfaceMaterial`/`ColorTransform*` and PBR shapes, `BlendMode`, `Kind`, `AlphaType` come from here. `import type` correctly separated from value imports (kinds, `BlendMode`) on their own lines per convention. | None. |
| Info | self-import `@flighthq/materials` | `colorTransform.test.ts` imports from the package root barrel rather than relative paths. This is a test-only convenience, not a source dependency, and does not affect the shipped graph. | Acceptable; optionally switch to relative imports for consistency with sibling source files. |

## Declared vs used

- **Declared:** `@flighthq/entity` (`*`), `@flighthq/types` (`*`); dev `typescript`.
- **Used (source):** `@flighthq/entity` (3 files, `createEntity`), `@flighthq/types` (all type/kind/`BlendMode` imports).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. All `@flighthq/*` imports in source resolve to declared deps; the `@flighthq/materials` self-import is test-only.
- **Pinning:** both workspace deps pinned `"*"` as required.
- **Tree-shaking:** `"sideEffects": false`; no top-level registration/side effects; type imports use `import type`. `packages:check` passes (86 packages, 16 examples valid).
