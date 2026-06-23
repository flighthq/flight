# TS↔Rust Alignment: @flighthq/velocity

**Verdict:** Strong alignment — all 8 exports map 1:1 with identical names and filenames; the only divergences are the standard, idiomatic ones (`object`/`WeakMap` → `u64`/`HashMap` source keys, entity → arena params, return-`out` dropped), none of which is yet recorded in the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `beginVelocityFrame` / `velocityField.ts` | `begin_velocity_frame` / `velocity_field.rs` | In sync. |
| `contributeVelocity(field, source: object, x, y)` / `velocityField.ts` | `contribute_velocity(field, source_id: u64, x, y)` / `velocity_field.rs` | Name OK. Source key changes from object-identity (`WeakMap<object>`) to a stable `u64` id (`HashMap<u64>`). Idiomatic Rust (slotmap/id pattern per rust/index.md), but it changes the public seam type and is **not in the divergence map**. |
| `createVelocityField` / `velocityField.ts` | `create_velocity_field` / `velocity_field.rs` | In sync. `VelocityField.samples` is `WeakMap` (TS) vs `HashMap<u64, VelocitySample>` (Rust) — same underlying source-key divergence. |
| `ensureVelocitySample(field, source)` / `velocityField.ts` | `ensure_velocity_sample(field, source_id)` / `velocity_field.rs` | Name OK; same `object`→`u64` source-key divergence. Both return the mutable sample. |
| `getVelocity(field, source, out): Velocity2D` / `velocityField.ts` | `get_velocity(field, source_id, out: &mut Velocity2D)` / `velocity_field.rs` | Name OK; `out` → `&mut` correct and alias-safe. **Return value dropped**: TS returns `out` for chaining, Rust returns `()`. Minor idiom difference, not recorded. |
| `hasVelocity` / `velocityField.ts` | `has_velocity` / `velocity_field.rs` | In sync (`has_*` boolean verb preserved). |
| `suppressVelocity` / `velocityField.ts` | `suppress_velocity` / `velocity_field.rs` | In sync. |
| `contributeTransformVelocity(field, root)` / `transformVelocity.ts` | `contribute_transform_velocity(field, transforms, hierarchy, root)` / `transform_velocity.rs` | Name + file basename track (`transformVelocity.ts` ↔ `transform_velocity.rs`). Params expand 2→4: TS reads the world matrix and children through the node's OOP/runtime binding; Rust threads explicit `NodeArena` borrows (`transforms`, `hierarchy`) + a `NodeId`. Standard entity→arena mapping (rust/index.md slotmap decision), but the param-count change is **not noted in the divergence map**. |

No missing ports, no abbreviations, no extra Rust functions, no renamed-without-reason symbols. The `-1` stale sentinel is faithfully mapped to `u64::MAX` (`STALE_FRAME_ID`) with a comment — correct given `frame_id` is unsigned in Rust.

## In sync

- Package→crate name is identity: `@flighthq/velocity` → `flighthq-velocity`. Manifest `description` strings match verbatim.
- Both files alphabetize exports and place loose constants / tests at the bottom, matching source-style rules.
- All 8 exported functions present on both sides; `npm run rust:conformance` reports `velocity | 8 | 8 | 17 | 0` (8 TS / 8 Rust / 17 tests / 0 gaps).
- Filenames track 1:1: `velocityField.ts` ↔ `velocity_field.rs`, `transformVelocity.ts` ↔ `transform_velocity.rs`; barrel `index.ts` ↔ `lib.rs`.
- Dependencies align: TS `@flighthq/{geometry,node,types}` ↔ Rust `flighthq-{geometry,node,types}` (Rust adds `slotmap`, the arena substrate — expected).
- Out-param (`&mut`), boolean-verb (`has_*`), and "return zero/false sentinel for stale/unknown source" conventions all carry across.

## Suggested divergence-map additions

This pair is fully conformant in spirit, but three recurring, currently-silent TS→Rust shifts surface here and should be recorded (ideally as a shared/global note, since they are not velocity-specific):

1. **Source key: `object`/`WeakMap` → `u64`/`HashMap`.** Object-identity keying has no `WeakMap` analogue in idiomatic Rust; the port keys on a stable `u64` source id. This is the cross-cutting slotmap/id substitution already implied by rust/index.md but not enumerated as a divergence for value-keyed seams like this one.
2. **Entity → arena param expansion.** `contributeTransformVelocity(field, root)` → `contribute_transform_velocity(field, transforms, hierarchy, root)`. Documented in principle (slotmap arena decision) but the per-function signature change is not in the map.
3. **Return-`out` dropped.** `getVelocity` returns `out` for chaining; `get_velocity` returns `()`. A general note that Rust out-param functions return unit rather than echoing `out` would cover this and every sibling crate.
