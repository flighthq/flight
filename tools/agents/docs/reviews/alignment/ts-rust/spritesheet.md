# TS↔Rust Alignment: @flighthq/spritesheet

**Verdict:** Fully aligned — all 14 exports map 1:1, every filename tracks, and the two intentional dependency divergences (the arena-less `TimelineSource` seam) are recorded in the conformance map with rationale; no drift.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createSpritesheet` / `spritesheet.ts` | `create_spritesheet` / `spritesheet.rs` | None |
| `createSpritesheetAnimation` / `spritesheetAnimation.ts` | `create_spritesheet_animation` / `spritesheet_animation.rs` | None |
| `createSpritesheetAnimationData` / `spritesheetAnimation.ts` | `create_spritesheet_animation_data` / `spritesheet_animation.rs` | None |
| `createSpritesheetData` / `spritesheetData.ts` | `create_spritesheet_data` / `spritesheet_data.rs` | None |
| `createSpritesheetFrame` / `spritesheetFrame.ts` | `create_spritesheet_frame` / `spritesheet_frame.rs` | None |
| `createSpritesheetFrameData` / `spritesheetData.ts` | `create_spritesheet_frame_data` / `spritesheet_data.rs` | None |
| `createSpritesheetFromTileset` / `spritesheetFrom.ts` | `create_spritesheet_from_tileset` / `spritesheet_from.rs` | None |
| `createSpritesheetPlayer` / `spritesheetPlayer.ts` | `create_spritesheet_player` / `spritesheet_player.rs` | None |
| `createSpritesheetTimelineSource` / `spritesheetTimelineSource.ts` | `create_spritesheet_timeline_source` / `spritesheet_timeline_source.rs` | Signature divergence (recorded): TS wires nodes via `@flighthq/displayobject`/`@flighthq/node`; Rust takes an `apply: Box<dyn Fn(u64, SpritesheetFramePlacement)>` callback. See divergence note below. |
| `getSpritesheetAnimation` / `spritesheet.ts` | `get_spritesheet_animation` / `spritesheet.rs` | None (`null` → `Option`) |
| `getSpritesheetPlayerFrame` / `spritesheetPlayer.ts` | `get_spritesheet_player_frame` / `spritesheet_player.rs` | None (`null` → `Option`) |
| `playSpritesheetAnimation` / `spritesheetPlayer.ts` | `play_spritesheet_animation` / `spritesheet_player.rs` | None |
| `queueSpritesheetAnimation` / `spritesheetPlayer.ts` | `queue_spritesheet_animation` / `spritesheet_player.rs` | None |
| `updateSpritesheetPlayer` / `spritesheetPlayer.ts` | `update_spritesheet_player` / `spritesheet_player.rs` | None (`&mut` out-param, returns `bool`) |

Notes:

- `npm run rust:conformance` reports `spritesheet | 14 | 14 | 47 | 0` (14 TS exports, 14 Rust matched, 0 missing). No extra Rust functions, no missing ports, no abbreviated type words.
- Filename basenames track 1:1 under camelCase→snake_case (`spritesheetTimelineSource.ts` ↔ `spritesheet_timeline_source.rs`, etc.).
- camelCase→snake_case conversion is exact; the full type word `Spritesheet` is preserved in every name.

## In sync

- **All 14 exported functions** map 1:1 with correct snake_case conversion and preserved type words.
- **All 8 source filenames** track their TS counterparts; the crate name `flighthq-spritesheet` is identity with `@flighthq/spritesheet`.
- **Sentinel convention** carries: TS `null` returns (`getSpritesheetAnimation`, `getSpritesheetPlayerFrame`) → Rust `Option`.
- **Out-param convention** carries: `updateSpritesheetPlayer(player, deltaTime)` → `update_spritesheet_player(player: &mut SpritesheetPlayer, delta_time: f32)`.
- **Dependency divergences are recorded, not drift:**
  - `spritesheet → displayobject` and `spritesheet → node` are in `REVIEWED_DEP_EXCEPTIONS` (scripts/rust-conformance.ts lines 144–146) and conformance.md line 67: the arena-less `TimelineSource.construct_frame` seam defers node wiring (TS `createBitmap` / `addNodeChild` / `invalidateNodeLocalTransform`) to a caller `apply(u64, placement)` callback, forced by the slotmap-arena ownership model. Verified: the only production value imports of `displayobject`/`node` are in `spritesheetTimelineSource.ts` (the `createDisplayContainer`/`getDisplayObjectRuntime` import is in the `.test.ts` file, not a real edge).
  - The dead `spritesheet → sprite` manifest dep removal is recorded in conformance.md line 62; the Rust `Cargo.toml` correctly carries only `flighthq-resources`, `flighthq-signals`, `flighthq-types` (foldable deps `entity`/`geometry` translated mechanically).

## Map maintenance

No new entries needed and no stale entries observed. The two `REVIEWED_DEP_EXCEPTIONS` and the conformance.md narrative (lines 62, 67) accurately describe the current crate. One minor consistency note for whoever next touches the map: the `spritesheet` divergence rationale in conformance.md (line 67) cites only "bitmap/child node wiring" — it could also mention `invalidateNodeLocalTransform` to fully enumerate the deferred `@flighthq/node` symbol, matching the script's `spritesheet->node` exception. Cosmetic only.
