# TS↔Rust Alignment: @flighthq/types

**Verdict:** The header layer is well-aligned at the type level (389 Rust type defs cover the TS concept set), but the **kind-identity model has diverged from the now-authoritative string model and the divergence is not recorded** — TS moved every `*Kind` to a serializable string constant while Rust still carries a dual model (runtime `KindId` u64 for old entity kinds + partial `*_KIND_NAME` strings for new 3D kinds), and the docs that justify `KindId` are stale.

`@flighthq/types` exports **zero functions** — it is the pure header layer (interfaces, enums, kind constants). `npm run rust:conformance` reports `types: 0 TS fns / 0 gap`, so the function-coverage tracker is silent here; this review is the only signal for this crate. The audit is therefore about type/enum/kind concept alignment and file layout, not function name mapping.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `BitmapKind = 'Bitmap'` (`Bitmap.ts`), `ShapeKind`, `SpriteKind`, `DisplayObjectKind`, etc. | `bitmap_kind() -> KindId`, `shape_kind()`, `display_object_kind()` (`display.rs`) — runtime-allocated `KindId(u64)` via `OnceLock<KindId>::get_or_init(KindId::new)` | **Authoritative-model drift, unrecorded.** TS kinds are now **strings** (`types-layout.md`: "Kind identity is a string … not a `Symbol()`"; CLAUDE.md Core Patterns confirms). Rust's old entity kinds are runtime-allocated u64s that do **not** round-trip in serialized scenes — the exact property the string model exists to provide ("simultaneously the registry key, the serialized form, and the user-facing vocabulary"). |
| `*Kind` string constants (uniform across all kinds) | `KindId` u64 newtype (`kind.rs`) | **Doc rationale is stale.** `rust/index.md` line 42 calls `KindId` "the Rust form of the TS `*Kind` `Symbol()`", and the TS map line 5 still says "`*Kind` symbols". The TS model is no longer a `Symbol()`; both doc statements describe the obsolete design. The `KindId`-as-Symbol-port rationale needs re-justifying against the string model or replacing. |
| `AmbientLightKind = 'AmbientLight'`, `MeshKind = 'Mesh'`, `StandardPbrMaterialKind = 'StandardPbrMaterial'` | `AMBIENT_LIGHT_KIND_NAME: &str = "AmbientLight"`, `MESH_KIND_NAME`, `STANDARD_PBR_MATERIAL_KIND_NAME` (`lighting.rs`, `mesh.rs`, `pbr_material.rs`) | **Internal inconsistency, naming nuance.** Only 10 kinds (the newer 3D family) use string `*_KIND_NAME` constants — these DO match the TS string model. Result: two coexisting Rust kind systems. Also a name-shape nuance: TS `AmbientLightKind` → Rust `AMBIENT_LIGHT_KIND_NAME` adds a `_NAME` suffix not present upstream; `AMBIENT_LIGHT_KIND` would track the TS symbol more directly. |
| One concept per file (~300 files: `Aabb.ts`, `BloomEffect.ts`, `ColorTransform.ts`, …); filename = primary type name | 27 thematic modules (`geometry.rs`, `material.rs`, `display.rs`, `lighting.rs`, …) | **File-name tracking does not hold — but this is acceptable, idiomatic Rust.** TS's one-file-per-concept is a grepability rule for the header; Rust idiomatically groups types into thematic modules with full re-exports from `lib.rs`. Not flagged as a defect, but it means the TS↔Rust _filename_ tracking rule (`transform2D.ts ↔ transform2d.rs`) is inapplicable for this crate and should be acknowledged as such, not silently assumed. |
| `KuwaharaEffect.ts`, `SsaoEffect.ts`, `WindForce.ts`, `SurfaceFingerprint.ts`, etc. (full TS concept set) | type defs present across thematic modules (`ParticleEmitter`, `Tween`, `WindForce`, `SurfaceFingerprint`, `ColorTransform`, `Matrix`, `TextFormat`, `BlendMode` all resolve) | **In sync** — broad type-level coverage confirmed by spot check; no missing-concept findings surfaced. |

## In sync

- **Type concept coverage is broad.** 389 distinct `pub struct`/`enum`/`trait` definitions; every spot-checked TS concept (geometry, color, blend, text, particles, tween, forces, surface, materials) resolves to a Rust type.
- **Signals re-export.** `flighthq-signals` is a dependency and signal types are re-exported from the crate root, matching the TS "signals re-exported from `@flighthq/types`" routing.
- **New 3D kind strings.** Lights, mesh, and standard PBR material use string `*_KIND_NAME` constants whose values exactly match the TS string kind values — these are correctly aligned to the authoritative model.
- **No structural-gate violations attributable to this crate.** The only `rust:conformance` structural failures (`surface-rs` missing / `surface-wasm` unexpected) are unrelated to `flighthq-types`.
- **Crate name is identity.** `@flighthq/types` → `flighthq-types`, no rename.

## Should be added to / fixed in the divergence map

1. **Record (and decide) the kind-identity model.** Either (a) migrate the old entity kinds (`bitmap_kind()` → a `BITMAP_KIND` string const) to converge on the now-authoritative TS string model, making all Rust kinds serializable strings; or (b) record an explicit, rationalized divergence entry in `conformance.md` explaining why Rust keeps `KindId` u64 for registry dispatch despite TS strings, and how serialized-scene round-tripping is preserved. Today it is silent drift.
2. **Refresh the stale doc statements.** `rust/index.md` line 42 ("Rust form of the TS `*Kind` `Symbol()`") and the TS map line 5 ("`*Kind` symbols") both predate the TS string-kind switch and should be updated to reference the string model.
3. **Resolve the internal inconsistency.** Pick one Rust kind representation. The two-system state (runtime `KindId` for old kinds, `*_KIND_NAME` strings for new kinds) is itself a drift signal even before comparing to TS.
4. **Acknowledge the file-layout exception.** Note in the conformance map that `flighthq-types` intentionally uses thematic modules rather than one-file-per-concept, so the filename-tracking rule is N/A for this crate (prevents a future reviewer re-flagging it).
