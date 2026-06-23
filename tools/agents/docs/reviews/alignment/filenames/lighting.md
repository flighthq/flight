# Filename Alignment: @flighthq/lighting

**Verdict:** Clean. This is a single-implementation domain package (3D light descriptors, no backend variants), so the plain object-name rule applies and is followed exactly — every file is named after the light-type object it owns, tests are colocated and mirror their source, and `index.ts` is a thin barrel.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `ambientLight.ts` — object: `AmbientLight` descriptor (`createAmbientLight`, `cloneAmbientLight`).
- `areaLight.ts` — object: `AreaLight` descriptor.
- `directionalLight.ts` — object: `DirectionalLight` descriptor.
- `environment.ts` — object: `Environment` descriptor (ambient/IBL environment), a legitimate domain object alongside the light types.
- `hemisphereLight.ts` — object: `HemisphereLight` descriptor.
- `pointLight.ts` — object: `PointLight` descriptor.
- `spotLight.ts` — object: `SpotLight` descriptor (also `setSpotLightCone`, which correctly lives in the spot-light file rather than its own one-function file).
- `index.ts` — thin re-export barrel; not a dumping ground.
- Tests: `ambientLight.test.ts`, `areaLight.test.ts`, `directionalLight.test.ts`, `environment.test.ts`, `hemisphereLight.test.ts`, `pointLight.test.ts`, `spotLight.test.ts` — each colocated and mirroring its source filename.

No generic names (`data.ts`, `utils.ts`, `math.ts`, etc.), no one-function files, no missing/suffix-style backend tokens (none are required here).
