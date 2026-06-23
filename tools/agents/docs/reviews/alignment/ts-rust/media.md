# TS↔Rust Alignment: @flighthq/media

**Verdict:** In sync — all 16 TS functions port 1:1 (snake*case, full type words, sentinels/out-params preserved); the only deltas are the documented web-relocated backend seam plus two public `complete*\*\_channel` entry points that the divergence map should name explicitly.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| (private) `completeAudioChannel`, `audioChannel.ts` | `complete_audio_channel` (pub), `audio_channel.rs` | Promoted private → public. In TS, completion fires internally from `sourceNode.onended`; in Rust the seam backend (host-web) must invoke it externally when a node ends, so it is public surface. Sound, but it is a named export not in TS — should get a one-line divergence-map entry. |
| (private) `completeVideoChannel`, `videoChannel.ts` | `complete_video_channel` (pub), `video_channel.rs` | Same as above (TS drives it from the `ended` event listener). Public Rust-only export; add to the divergence map alongside its audio twin. |
| n/a | `set_audio_backend`, `set_video_backend`, `AudioBackend`, `VideoBackend` | Rust-only backend seam. Explicitly the documented pattern for web-relocated capabilities (conformance.md line 119 lists `media`); the TS browser drivers (Web Audio `AudioContext`, `HTMLVideoElement`) live in host-web. No action — covered by the map. |
| all 16 media functions (each `*.test.ts`) | crate tests exist (`*_behavior_with_backend`, `complete_*_channel_loops_then_completes`) | Conformance script reports all 16 as "no Rust test" (coverage-gap list, line 135 of `npm run rust:conformance`). This is a false gap from the script's per-function name-match: the crate bundles assertions into two serialized `#[serial]` test fns over a stub backend. Expected for a web-relocated crate; the crate is actually better-tested than the gap list implies. No action. |
| `playAudioResource` → `AudioChannel \| null` | `play_audio_resource` → `Option<AudioChannel>` | Sentinel-null → `Option` correctly carried. |
| `playVideoResource` → `VideoChannel \| null` | `play_video_resource` → `Option<VideoChannel>` | Same; correct. |

## In sync

- **Package→crate name** is identity: `@flighthq/media` → `flighthq-media`. No undocumented rename.
- **File names track exactly:** `audioChannel.ts` ↔ `audio_channel.rs`, `videoChannel.ts` ↔ `video_channel.rs`, and the `index.ts` barrel ↔ `lib.rs` re-export both expose the full root surface.
- **All 16 exported functions map 1:1** with camelCase→snake_case and the full type word preserved (`getAudioChannelCurrentTime` → `get_audio_channel_current_time`, `setVideoChannelPlaybackRate` → `set_video_channel_playback_rate`, etc.). No abbreviations, no missing ports, no unjustified renames.
- **Out-param / sentinel / mutation conventions carry across:** TS channel-mutating functions take `channel: Channel` and mutate in place → Rust takes `&mut AudioChannel`/`&mut VideoChannel`; read-only `get*` take `&AudioChannel`; `null` returns → `Option`; setters return the clamped/applied value in both. No `dispose_`/`destroy_`/`acquire_`/`release_` verbs are involved (none in TS), so nothing to preserve there.
- **State machine matches:** clamp, loop-then-complete, `on_complete` signal emission, and play/pause/resume/stop/seek/gain/rate semantics mirror the TS source field-for-field; `loopsRemaining`/`startedAt` runtime state is modeled on the `Channel` entity (`loops_remaining`) and in the backend, consistent with the entity/runtime split.

## Suggested divergence-map additions

Add a short `media` note to `tools/agents/docs/rust/conformance.md`: the TS-private `completeAudioChannel`/`completeVideoChannel` become **public** `complete_audio_channel`/`complete_video_channel` in Rust because completion is backend-driven through the seam (the host backend calls them on node-end / `ended`), rather than wired to a private DOM event callback as in TS. The `set_*_backend` seam itself is already covered by the existing web-relocated-functions paragraph that names `media`.
