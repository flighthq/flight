# TS↔Rust Alignment: @flighthq/interaction

**Verdict:** Strong — all 36 TS exports are ported 1:1 with correct snake_case and full type words; the only issues are two extra Rust-only keyboard functions and a file split, neither of which is recorded in the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| (none) | `connect_keyboard_input_to_interaction` / `manager.rs` | Rust-only function not present in TS. Defensible: Rust's payload-parameterized `Signal<T>` cannot fold pointer + keyboard payloads into one `connect_input_to_interaction` the way TS's `InteractionSignalName` union does, so the keyboard path is split out. But it is **undocumented drift** — no interaction entry exists in the conformance map. Record it. |
| (none) | `connect_interaction_keyboard_signal` / `manager.rs` | Rust-only function not present in TS. Same root cause: TS's single `connectInteractionSignal<Name>` is generic over the signal-name union (pointer + keyboard); Rust splits keyboard into its own typed function because `Signal<T>` is payload-typed. Defensible type-system divergence, but **not in the divergence map**. Record it. |
| `createInteractionSignals` / `interactionManager.ts` | `create_interaction_signals` / `signals.rs` | Symbol matches 1:1 (good). File **basename diverges**: TS keeps it in `interactionManager.ts`; Rust hoists it to a dedicated `signals.rs`. Nice-to-have only; harmless, but worth a one-line note if the divergence map gets an interaction section. |
| `interactionManager.ts` (file) | `manager.rs` (file) | File basename does not track: `interactionManager` → `manager` drops the `interaction` domain word. All 18 symbols inside map correctly, so this is filename-tracking nuance only, not an API issue. |

## In sync

- **Package→crate name:** `@flighthq/interaction` → `flighthq-interaction`, identity. Correct.
- **All 36 TS exports ported** (`npm run rust:conformance`: 36 TS / 36 matched / 0 missing). Every `default*HitTestPoint`, every `dispatchInteraction*`, the `connect`/`disconnect`/`capture`/`release` quartet, `enable`/`get`/`create` signal functions, and the four graph/display hit-test functions map 1:1.
- **camelCase→snake_case with full type words preserved:** `findGraphHitTarget`→`find_graph_hit_target`, `hitTestGraphLocalBounds`→`hit_test_graph_local_bounds`, `defaultMovieClipHitTestPoint`→`default_movie_clip_hit_test_point`, `dispatchInteractionPointerCancel`→`dispatch_interaction_pointer_cancel`. No abbreviation, no dropped type words.
- **Teardown / pool verbs preserved:** `captureInteractionPointer`/`releaseInteractionPointer` → `capture_interaction_pointer`/`release_interaction_pointer` (acquire/release-style bracket intact); `disconnect_interaction_signal` preserved.
- **Sentinel convention carries:** `getInteractionSignals(): InteractionSignals | null` → `get_interaction_signals(...) -> Option<...>`.
- **File basenames that do track:** `displayHitTests.ts`↔`display_hit_tests.rs`, `hitTests.ts`↔`hit_tests.rs`, `spriteHitTests.ts`↔`sprite_hit_tests.rs`.

## Suggested divergence-map additions

Add an `interaction` entry to the conformance map (`conformance.md` §"Conformance map" + `scripts/rust-conformance.ts`) recording the two Rust-only keyboard functions with the rationale: _Rust `Signal<T>` is parameterized by payload type, so the TS generic-over-name keyboard/pointer unification cannot be expressed; keyboard input wiring (`connect_keyboard_input_to_interaction`) and keyboard slot subscription (`connect_interaction_keyboard_signal`) are split into separately-typed functions._ This converts current silent drift into a reviewed decision. The `signals.rs` / `manager.rs` file split can be noted in the same entry as a non-API filename nuance.
