# TS↔Rust Alignment: @flighthq/timeline

**Verdict:** Strong alignment — all 27 exported functions map 1:1 with correct snake_case and full type words; the one issue is a **stale divergence-map entry** (conformance.md line 68) that describes a now-resolved "open decision."

## Name map findings

| TS symbol/file | Rust symbol/file | Issue |
| --- | --- | --- |
| `createMovieClip` / `movieClip.ts` | `create_movie_clip` / `movie_clip.rs` | **Divergence map stale.** conformance.md line 68 states "there is **no `create_movie_clip` node constructor** (only `create_movie_clip_data`)" and frames an "Open decision." The crate now ships `create_movie_clip(arena) -> NodeId` over `create_display_object_generic` — i.e. the "align to TS" branch was taken. Update or remove the entry; the open decision is closed. |
| `createMovieClipRuntime(): MovieClipRuntime` | `create_movie_clip_runtime() -> Option<MovieClipSignals>` | Return type diverges by design (TS returns a full DisplayObject runtime with a `movieClipSignals` slot; Rust returns just the optional signals slot, reflecting the decoupling). Doc-commented in source but **not recorded** in the divergence map — should be noted as the canonical Rust runtime-slot seam. |
| `getMovieClipRuntime(source: MovieClip)` | `get_movie_clip_runtime(runtime: &Option<MovieClipSignals>)` | Same decoupling: TS takes the clip node and reaches into its runtime; Rust takes the caller-owned slot directly. Behavioral parity, different parameter shape. Worth a one-line divergence-map note. |
| `getMovieClipSignals(clip: MovieClip)` | `get_movie_clip_signals(signals: &mut Option<MovieClipSignals>)` | Same pattern — lazy-init on a caller-owned `Option` slot vs. on the clip's runtime. Alias-safe, consistent. |
| `setMovieClipSource(clip, source)` | `set_movie_clip_source(data, source, node_id: u64)` | Rust adds a 3rd `node_id: u64` param (TS sets `timeline.target = clip` directly; Rust passes the arena node id since the timeline cannot hold a node reference). Justified by the slotmap-arena decision, but an **extra parameter** not present upstream — should be a recorded divergence. |
| `getMovieClipCurrentFrame / getMovieClipTotalFrames(clip)` | `..._movie_clip_...(data: &MovieClipData)` | Operate on `&MovieClipData` instead of the clip node; same decoupling family. |
| `createMovieClipData(Partial<MovieClipData>)` | `create_movie_clip_data(Option<Timeline>)` | TS takes a partial seed object; Rust takes `Option<Timeline>` directly (the only field). Acceptable simplification; matches Rust idiom. |
| `gotoAndPlay/StopTimeline(frame: number \| string)` | `..._timeline(frame: TimelineFrame)` | TS `number \| string` modeled as the Rust-local `TimelineFrame { Index(u32), Label(String) }` enum (exported from lib.rs, with `From<u32>`/`From<&str>`). A Rust-only **type** export, not a function, so it does not count against the function map; idiomatic and correct. |

## In sync

- Package→crate name is identity: `@flighthq/timeline` → `flighthq-timeline`. No undocumented name divergence.
- `npm run rust:conformance` reports timeline **27 exported / 27 ported / 0 missing**.
- All 24 movie-clip + timeline function names port exactly with full type words preserved: `goto_and_play_movie_clip`, `get_movie_clip_total_frames`, `next_frame_timeline`, `find_timeline_label`, etc. No abbreviations, no renames-without-reason, no extra functions beyond `TimelineFrame` (a type).
- File names track cleanly: TS `timeline.ts` ↔ Rust `timeline.rs`; TS `movieClip.ts` ↔ Rust `movie_clip.rs` (camelCase→snake_case basename). Barrel `index.ts` ↔ `lib.rs`.
- Conventions carry across: `out`→`&mut` (`update_timeline(&mut Timeline, ...)`), `null`→`Option` (`find_timeline_label -> Option<&TimelineLabel>`), sentinel returns preserved (current/total frame fall back to `1`). No teardown verbs in this package (no `dispose_*`/`destroy_*`), consistent with TS.
- `createSpritesheetTimelineSource` lives in `@flighthq/spritesheet`, not `@flighthq/timeline`, so it is correctly out of scope for this crate.

### Suggested divergence-map maintenance

1. **Rewrite conformance.md line 68** — the "no `create_movie_clip` node constructor / Open decision" text is factually stale. Replace with a closed entry: Rust ships `create_movie_clip(arena)` (aligned to TS) **and** keeps the `MovieClipData`/`Option<MovieClipSignals>` decoupling for the data/runtime/signals accessors.
2. **Record the runtime-shape divergences** (currently only in source doc-comments): `create_movie_clip_runtime`/`get_movie_clip_runtime`/`get_movie_clip_signals` operate on a caller-owned `Option<MovieClipSignals>` slot rather than a DisplayObject runtime, and `set_movie_clip_source` takes an extra `node_id: u64`. These are reasonable arena-driven adaptations but are silent drift relative to the map.
