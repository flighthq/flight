# TS↔Rust Alignment: @flighthq/sprite

**Verdict:** In sync — all 34 TS exports port 1:1 with conformant names and filenames; the 20 extra Rust functions are the expected slotmap-arena field accessors, but that pattern is not recorded in the divergence map.

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `@flighthq/sprite` | `flighthq-sprite` | None — identity package→crate name. |
| `particleEmitter.ts` / `quadBatch.ts` / `sprite.ts` / `tilemap.ts` | `particle_emitter.rs` / `quad_batch.rs` / `sprite.rs` / `tilemap.rs` | None — every TS basename tracks its Rust counterpart; `index.ts` barrel ↔ `lib.rs`. |
| All 34 exported functions (`createSprite`, `computeTilemapLocalBoundsRectangle`, `hitTestQuadBatchPointXY`, `getQuadTransformStride`, …) | matching `create_sprite`, `compute_tilemap_local_bounds_rectangle`, `hit_test_quad_batch_point_xy`, `get_quad_transform_stride`, … | None — camelCase→snake_case, full type words preserved, no abbreviations, no renames. Conformance script: 34/34, 0 missing. |
| `Sprite.atlas` / `.id` / `.rect` (direct field access) | `get_sprite_atlas`/`set_sprite_atlas`, `get_sprite_id`/`set_sprite_id`, `get_sprite_rect`/`set_sprite_rect` | Extra Rust functions with no TS export. Justified by the slotmap-arena model (entity lives in `DisplayObjectArena` keyed by `NodeId`; no direct field access), but **not recorded** in the divergence map. |
| `Tilemap.columns` / `.rows` / `.tileset` (direct field access) | `get_tilemap_columns`, `get_tilemap_rows`, `get_tilemap_tileset`/`set_tilemap_tileset` | Same arena-accessor pattern; unrecorded. |
| `QuadBatch.atlas` / `.instanceCount` (direct field access) | `get_quad_batch_atlas`/`set_quad_batch_atlas`, `get_quad_batch_instance_count` | Same arena-accessor pattern; unrecorded. |
| `ParticleEmitter.atlas` / `.particleCount` / `.worldSpace` (direct field access) | `get_particle_emitter_atlas`/`set_…`, `get_particle_emitter_particle_count`/`set_…`, `get_particle_emitter_world_space`/`set_…` | Same arena-accessor pattern; unrecorded. |

## In sync

- **Package/crate name** is identity per the mapping rule.
- **All four source files** map by basename (camelCase→snake_case), and the TS `index.ts` barrel maps to Rust `lib.rs`.
- **Every TS export is ported** with the full unabbreviated type word preserved and correct snake_case. `npm run rust:conformance` reports `sprite | 34 | 34 | 53 | 0` (0 missing).
- **Convention carry-across is clean:** out-params (`compute*`, `set*LocalBoundsRectangle`) use `&mut`/explicit out args; nullable returns use `Option<&T>` (`get_sprite_atlas`, `get_tilemap_tileset`); expected-failure sentinels use `-1` (`get_tilemap_tile`, `hit_test_quad_batch_point_xy` → `i32`); no teardown verbs apply to this value/graph crate.
- **The 20 extra Rust functions are not drift** — each is a `get_*`/`set_*` accessor for a plain public field on the corresponding TS entity, mandated by the Rust slotmap-arena decision (free functions over `(&arena, NodeId)` instead of direct field access). Names remain fully conformant.

### Suggested divergence-map addition

The conformance map (`tools/agents/docs/rust/conformance.md`) records the arena decision conceptually (rust/index.md "Scene graph: slotmap arena") but does not note that it produces **per-field `get_*`/`set_*` accessor functions with no TS export** for graph-entity crates (`sprite`, and by extension `displayobject`, `node`). Adding one line acknowledging this systemic accessor expansion — so the export-count delta (53 Rust vs 34 TS) is auditable rather than reading as silent extra surface — would close the gap. This is a documentation-only nit; the code is correct and conformant.
