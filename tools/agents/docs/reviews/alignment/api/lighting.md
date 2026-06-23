# API Alignment: @flighthq/lighting

**Verdict:** Strong, near-exemplary leaf package — consistent `create*`/`clone*` value-constructor surface; only a missing `get*` counterpart to `setSpotLightCone`, one parameter-name asymmetry, and a minor `Readonly<>` gap.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `setSpotLightCone` (and lack of a getter) | The cone is set from degrees (`setSpotLightCone`) but stored as cosines (`innerConeCos`/`outerConeCos`). There is no inverse reader, so a caller cannot recover the degrees they set without inlining `Math.acos`. This is a set-without-get symmetry/completeness gap for a package the map wants at AAA completeness. | Add `getSpotLightInnerConeDegrees(light)` / `getSpotLightOuterConeDegrees(light)` (or a single `getSpotLightConeDegrees(out, light)` writing both), mirroring the setter. |
| Low | `setSpotLightCone(out, innerDegrees, outerDegrees)` vs `createSpotLight` options | Same concept, two different parameter names: the options interface uses `innerConeDegrees`/`outerConeDegrees` while the setter uses `innerDegrees`/`outerDegrees`. Hurts cross-function consistency within one file. | Pick one spelling. Align the setter to `innerConeDegrees`/`outerConeDegrees` to match `SpotLightOptions`. |
| Low | `EnvironmentOptions.environment: CubeTexture \| null` | The option holds an object reference that is read-only here (stored by aliasing, never mutated). Per the "default to `Readonly<>` on object params" rule it should be marked immutable; the sibling vector options already use `Readonly<Vector3Like>`. | Type it `Readonly<CubeTexture> \| null`. |
| Info | `setSpotLightCone` out-param semantics | The `out: SpotLight` is the subject mutated in place rather than a separate destination — acceptable under the `out`/`target` mutate convention, and it is alias-safe (only primitive params are read, then `out` fields written; no read-after-write). No change needed; noted for completeness. | — |

## Clean

- **Verb discipline:** every constructor is `create*`, every copy is `clone*` — uniform across all six light kinds plus `Environment`, and consistent with the SDK's `create*`/`clone*` allocation verbs.
- **Full, unabbreviated type words:** `createDirectionalLight`, `cloneHemisphereLight`, `setSpotLightCone`, etc. — no abbreviated type names; all names are globally self-identifying from the barrel.
- **Allocation by verb:** `create*`/`clone*` allocate (via `createEntity` and `cloneVector3`/`createVector3`); the only non-constructor, `setSpotLightCone`, writes into its `out` and does not allocate. Correct split.
- **`Readonly<T>` usage:** all `clone*` sources are `Readonly<...>`, all `*Options` params are `Readonly<...Options>`, and vector option fields use `Readonly<Vector3Like>`. Only the `CubeTexture` field above is missed.
- **Sentinels, no throwing:** no thrown errors for expected cases; `range ?? -1` uses `-1` as the documented "infinite range" sentinel, and `environment` defaults to `null`.
- **Cross-package types from `@flighthq/types`:** `AmbientLight`, `SpotLight`, `Vector3Like`, `CubeTexture`, `Environment`, and all `*Kind` discriminants are imported from `@flighthq/types`; only the local `*Options` input shapes are defined inline, which is the correct place for them.
- **`import type {}` hygiene:** type-only imports are on their own `import type { ... }` lines, separate from the value imports of the matching `*Kind` constants and `@flighthq/entity`/`@flighthq/geometry` helpers.
- **Alphabetized exports** (`clone*` then `create*` per file; `setSpotLightCone` last in `spotLight.ts`) and a thin re-export `index.ts`.
- **Coverage:** every source file has a colocated `*.test.ts`.
