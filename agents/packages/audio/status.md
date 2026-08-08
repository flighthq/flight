---
package: '@flighthq/audio'
updated: 2026-08-08
by: principal
---

# audio — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/audio/src/` on 2026-08-08. Both loader fixes still hold — the abort
barrier sits after the un-cancellable decode (`audioResourceFrom.ts:54`, `:62`) and the URL loader
rejects a non-`ok` response with its status before paying for a decode (`:78`) — so what is open is
mostly shape and rulings.

- **Two decode paths, one registry.** `resolveAudioResourceReference` decodes embedded bytes through
  the registered decoder for the reference's MIME type (`audioResourceReference.ts:149`), while the
  whole `loadAudioResourceFrom*` family goes straight to `context.decodeAudioData`
  (`audioResourceFrom.ts:56`) and never consults `audioDecoderRegistry`. A decoder registered for a
  format the platform cannot decode therefore serves references but not loaders.
- **The reject-vs-sentinel fork is unruled.** `loadAudioResourceFromUrl` rejects; `loadAudioResourceFromUrls`
  returns an empty resource (`audioResourceFrom.ts:94`). The SDK sentinel rule favors the empty
  resource, the charter's honest-async north star favors the throw, and the same fork exists in `video`
  and `image` — one ruling across the resource family, parked in [assessment](./assessment.md) Backlog.
- **`index.ts` is not alphabetized.** It opens `findAudioResourceReferenceByName`,
  `unregisterAudioDecoder`, `resolveAudioResourceReference`, against the source-style rule that exported
  names are alphabetized within a file.
- **The rest of the live work is parked and cross-cutting**: the streaming-source carrier (the data
  layer cannot represent a long music track), the audio-processing tier, a WAV PCM codec, and splitting
  the playback types out of `AudioResource.ts` in `@flighthq/types`. Each needs a ruling, not a sweep.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Re-verified all Open items against source; the 2026-07-30 loader fixes still hold.
  Converted to the Open + Log contract; the 2026-06-25 entry's `getAudioContext` is gone from the whole
  repo per charter Decision #1, so it is no longer restated.
- **2026-07-30** — Added the family's abort barrier: `loadAudioResourceFromBytes` re-checks the signal
  after the await, because `decodeAudioData` cannot be cancelled and an aborted load was resolving with
  a resource indistinguishable from a wanted one. Every entry point funnels here, but the guarantee is
  per entry point, so each has its own regression test.
- **2026-07-30** — `loadAudioResourceFromUrl` checks `response.ok` and reports the status; `fetch`
  resolves for 404/500, so an error page was being handed to the decoder and the codec blamed for a
  transport failure.
- **2026-06-25** — Extracted from the eliminated `@flighthq/resources` as `audioResource` /
  `audioResourceFrom`; consumed by `@flighthq/media`.
- **2026-06-25** — A `flighthq-audio` Rust crate mirrored the split; that code no longer lives here.
