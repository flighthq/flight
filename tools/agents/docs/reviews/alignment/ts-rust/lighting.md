# TS↔Rust Alignment: @flighthq/lighting

**Verdict:** Strong alignment — all 15 TS functions ported 1:1 with correct snake*case and full type words, filenames track exactly; the only delta is the expected `*Kind`string-constant →`KindId` `get\*\*\_kind()` lowering, which is a systematic Rust-wide pattern but is not yet captured as a recorded divergence.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `*Kind` string constants (`AmbientLightKind`, …) imported from `@flighthq/types`, used internally; **no** kind function or re-export | `get_ambient_light_kind` … `get_spot_light_kind`, `get_environment_kind` → `KindId` (7 fns) | Expected lowering, not a 1:1 name port. TS `*Kind` is a string constant living in `@flighthq/types`; Rust expresses kind identity as `KindId` via `get_*_kind()` (rust/index.md L42). 7↔7 symmetric and matches the established `mesh`/`displayobject` pattern. Drift judgment: principled, but **not recorded** in the conformance map as a divergence — see note below. |
| (n/a) | conformance script reports `lighting \| 15 \| 0 \| 31 \| 15 ⚠️` | False-positive coverage flag, not a source gap. All 15 TS functions exist in the crate; the ⚠️ is a test-name-matching artifact (Rust uses nested `mod` test names + extra `get_*_kind` tests, so name-based matching scores 0 covered). No action needed in the crate. |

## In sync

- **Crate name:** `@flighthq/lighting` → `flighthq-lighting`, identity. Correct.
- **All 15 exported functions ported 1:1**, camelCase→snake_case, full type word preserved: `cloneAmbientLight`/`cloneAreaLight`/`cloneDirectionalLight`/`cloneEnvironment`/`cloneHemisphereLight`/`clonePointLight`/`cloneSpotLight`, `createAmbientLight`/`createAreaLight`/`createDirectionalLight`/`createEnvironment`/`createHemisphereLight`/`createPointLight`/`createSpotLight`, `setSpotLightCone` → `set_spot_light_cone`. No missing, renamed, or abbreviated ports.
- **Filenames track exactly:** `ambientLight.ts↔ambient_light.rs`, `areaLight.ts↔area_light.rs`, `directionalLight.ts↔directional_light.rs`, `environment.ts↔environment.rs`, `hemisphereLight.ts↔hemisphere_light.rs`, `pointLight.ts↔point_light.rs`, `spotLight.ts↔spot_light.rs`. (TS `index.ts` ↔ Rust `lib.rs`, as expected.)
- **Conventions carried across:** `clone*` allocates (matches); `create*` allocates with an optional-options arg (TS `options?` → Rust `&Options`, idiomatic default-via-`Default`); `setSpotLightCone` uses `out` → Rust `out: &mut SpotLight`, and is alias-safe (both degree inputs read before either field written).

## Note for the divergence map

The `*Kind` string-constant (TS, in `@flighthq/types`) → `KindId` `get_*_kind()` (Rust) lowering is a cross-cutting, intentional consequence of the `KindId` decision (rust/index.md L42) and recurs in every kind-bearing crate (`mesh`, `displayobject`, …). It is currently only documented as a _general principle_, not as a per-crate or pattern-level entry in `tools/agents/docs/rust/conformance.md`. Recommend adding a single pattern-level divergence entry ("`*Kind` constant → `get_*_kind() -> KindId`") so each crate's extra `get_*_kind` exports read as recorded, not silent drift, and so the conformance script's per-crate ⚠️ on kind-only deltas is explained in one place rather than re-investigated per package.
