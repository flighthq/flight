# Dependency Alignment: @flighthq/lighting

**Verdict:** Clean — minimal, correctly-declared, fully-used dependency set with no boundary, phantom, or unused-dep issues; `npm run packages:check` passes and judgment finds nothing to add.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Header-layer dep. All entity types (`AmbientLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `HemisphereLight`, `AreaLight`, `Environment`, `CubeTexture`, `Vector3Like`) and `*Kind` constants resolve here; types via `import type`, Kinds via value import (runtime constants). Correct. | — |
| None | `@flighthq/entity` | Used in every source file for `createEntity` (entity/runtime construction). Predictable for a descriptor package. | — |
| None | `@flighthq/geometry` | Used in `areaLight`/`directionalLight`/`pointLight`/`spotLight` for `createVector3`/`cloneVector3` (direction/position vectors). Not imported by `ambientLight`/`hemisphereLight`/`environment`, which legitimately have no Vector3 fields — package-level dep is still justified by the four consumers. | — |
| Info | local `*Options` interfaces | Each file defines a package-local `*Options` input shape (e.g. `AmbientLightOptions`). These are consumer-local _input_ descriptors, not cross-package entity types, so they correctly stay inline and do not belong in `@flighthq/types`. No violation. | — |
| Info | `Sampler` import | `import type { Sampler }` appears only in `environment.test.ts` (from `@flighthq/types`), not in shipped source. No impact on declared deps. | — |

- No import of `@flighthq/sdk` (barrel). Clean.
- No inline cross-package types; all shared types redefined nowhere — sourced from `@flighthq/types`.
- `"sideEffects": false` set; no top-level side effects; tree-shakable.
- Layering respected: a value/math leaf descriptor crate depending only on the header (`types`) plus the entity and geometry primitives. No "up-layer" reach, no renderer/backend edges, no cross-backend coupling. Edge set is exactly what the package's purpose predicts.

## Declared vs used

- **Declared:** `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/types` (all `"*"`-pinned workspace deps); dev: `typescript`.
- **Used:** `@flighthq/entity` (all files), `@flighthq/geometry` (4 of 7 files), `@flighthq/types` (all files).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. `@flighthq/geometry` transitively depends on `entity`/`types`, but `lighting` declares both directly — no reliance on transitive resolution.
