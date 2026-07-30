---
package: '@flighthq/audio'
updated: 2026-07-30
by: builder
---

# audio — Status Log

## 2026-07-30 — abort barrier and HTTP status in the loader family (builder)

Swept the cell; all seven assessment Recommended items were already landed, including the stale `package.json` description. Retired them, moving the record out from under the `## Recommended` heading — striking items through is not enough, the TODO generator scrapes numbered bullets under that heading regardless of formatting. Two live defects turned up in the loader family, both probed before fixing.

**An abort arriving during the decode was silently ignored.** `loadAudioResourceFromBytes` checked the signal once, on entry, before the only slow step. `decodeAudioData` cannot be cancelled, so an abort landing mid-decode did not stop the work — and, with no check afterwards, did not stop the *result* either: the promise resolved with a fully populated resource. A caller that cancelled got a resource indistinguishable from one it asked for, and there was no way to tell the two apart. Fixed by adding the post-await check. This is the whole family's abort barrier, because every loader here funnels through this one function — but the guarantee is per entry point, so there is a regression test for each of `FromBytes`, `FromBase64`, `FromBlob`, and `FromUrl`: a barrier that only holds for direct callers still lets the wrappers resolve past an abort, and only per-entry-point tests can show it does not.

**A failed HTTP response was decoded as if it were audio.** `fetch` resolves for 404/500, so `loadAudioResourceFromUrl` handed the error page to the decoder and the caller was told `Unable to decode audio data` — the codec blamed for a transport failure, after paying for a decode that never had a chance. Now checks `response.ok` and reports the status; the test pins the status text and asserts the decoder is never called, so it cannot pass merely because something rejected.

Verified by reverting each defect separately, with the mutation confirmed applied first: mutation A failed exactly the four abort tests and nothing else, mutation B failed exactly the one HTTP test. No overlap, so neither fix is being credited for the other's coverage. Also completed the `ok` field on the pre-existing fetch doubles, which had been passing only because the check did not exist. 44 → 58 tests.

The reject-vs-sentinel question this touches is not settled here — see the amended Backlog entry in [assessment](./assessment.md). The fix is about *which* failure gets reported and is correct under either ruling.

## 2026-06-25 — extracted from @flighthq/resources (resources eliminated)

New package: `audioResource`/`audioResourceFrom` (create + URL constructors) and `getAudioContext`. Deps: types. Consumed by `@flighthq/media` (audioChannel). 15 tests pass.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-audio` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.
