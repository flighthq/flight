# TS↔Rust Alignment: @flighthq/tween

**Verdict:** Strong name/file alignment — all 17 TS exports map 1:1 with correct casing and filenames — but two extra Rust public functions and the `u64`-ptr / `current_values_fn` target model are unrecorded behavioral divergences that should be added to the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `createColorTween` (`colorTween.ts`) | `create_color_tween` (`color_tween.rs`) | Name + file OK. **Signature divergence:** TS takes `(target: Record<string, number>, property: string, …, toColor)` and wires write-back via `connectSignal(tween.onUpdate, …)`; Rust takes `(color_ptr: u64, from_color, to_color, …)` and returns an index, leaving recompose to the caller. Not recorded. |
| — | `color_start_values` (`color_tween.rs`) | **Extra Rust public fn, no TS counterpart.** Builds the `(r,g,b)` start snapshot that TS does inline inside `createColorTween`. Exists because Rust has no `onUpdate` closure / generic property lookup. Not in divergence map. |
| — | `pack_color` (`color_tween.rs`) | **Extra Rust public fn, no TS counterpart.** Recomposes packed `0xRRGGBB`; TS does this inline in the `onUpdate` closure. Not in divergence map. |
| `applyTween` (`tween.ts`) | `apply_tween` (`tween.rs`) | Name + file OK. Signature: TS `<T>(manager, target: T, propertyMap)` → Rust `(manager, target_ptr: u64, properties: &[(String, f32)])`. Same `u64`-ptr target model (see note below). |
| `stopTween` / `completeTween` (`tween.ts` / `updateTweens.ts`) | `stop_tween` / `complete_tween` | Name + file OK. Both return `Vec<(String, f32)>` where TS returns `void`; the returned current-values are the Rust substitute for TS reading them off the live target. Behavioral, unrecorded. |
| `createTween`, `createTweenManager`, `createTweenTimer`, `updateTweens`, `pauseTween`/`pauseTweens`/`pauseAllTweens`, `resumeTween`/`resumeTweens`/`resumeAllTweens`, `resetAllTweens`, `stopTweens`/`stopAllTweens` | `create_tween`, `create_tween_manager`, `create_tween_timer`, `update_tweens`, `pause_*`, `resume_*`, `reset_all_tweens`, `stop_*` | All names map 1:1, full type words preserved, snake_case correct. `updateTweens` takes the `current_values_fn` callback; the manager keys tweens by `u64` ptr. |
| `initializeTween` (`internal.ts`, non-barrel) | `initialize_tween` (`internal.rs`, `pub(crate)`) | Correctly mirrored: private on both sides, filename tracks. |

## In sync

- **Crate name** `flighthq-tween` is identity with `@flighthq/tween`. No undocumented rename.
- **All 17 public TS exports** are present in Rust with correct camelCase→snake_case and full, unabbreviated type words (`createTweenManager` → `create_tween_manager`, etc.). `npm run rust:conformance` reports 17/17, 0 missing.
- **Filenames track exactly**: `colorTween.ts`↔`color_tween.rs`, `timer.ts`↔`timer.rs`, `tween.ts`↔`tween.rs`, `tweenManager.ts`↔`tween_manager.rs`, `updateTweens.ts`↔`update_tweens.rs`, `internal.ts`↔`internal.rs`. The Rust `lib.rs` barrel groups re-exports by source module, matching the TS `index.ts` `export *` layout.
- **Easing split** (`@flighthq/easing` as a separate dependency) is already recorded in the divergence map (`tween-easing → easing`, 2026-06-23) and reflected in the crate: `flighthq-easing` is a separate crate, not folded into tween.
- **Sentinel / teardown verbs**: tween has no `dispose_`/`destroy_`/`acquire_`/`release_` surface to mismatch; `Option<…Options>` is used for optional params, matching the TS `options?` shape.

## To add to the divergence map

The whole crate is built on a **no-GC-object-graph substitution** that has no recorded entry: TS tweens hold a generic `target: T` and mutate its numeric props directly (plus an `onUpdate` signal for color write-back); Rust cannot do generic string-keyed property access, so it replaces this with (a) `u64` `target_ptr` keys, (b) a `current_values_fn` callback supplied to `update_tweens`, and (c) functions returning `Vec<(String, f32)>` of current/applied values for the caller to write back. This is the same opaque-`u64`-target pattern already recorded for `spritesheet` (conformance.md line 67), and should get its own tween entry. The two extra public helpers `color_start_values` and `pack_color` are direct consequences of (b)/(c) — they belong in that same entry as the explicit, caller-driven replacement for TS's inline color decomposition and `onUpdate` recompose closure, rather than appearing as silent extra Rust API.
