---
package: '@flighthq/video'
updated: 2026-08-08
by: principal
---

# video — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every claim this file carried was re-checked against `packages/video/src/` on 2026-08-08 and all of
them hold, so little is open in-package. The two lanes are in sync (`index.ts` reaches every name
`contract.ts` exports).

- **Object-URL ownership is settled and implemented, not parked.** `loadVideoResourceFromBlob`
  transfers the URL to the resource it returns (`videoResourceFrom.ts:35`) and `disposeVideoResource`
  revokes it (`videoResource.ts:26-28`). The failure path is the one place the loader still revokes
  (`videoResourceFrom.ts:32`), because it returns no resource for anyone to dispose.
- **Both abandonment paths release the element through `disposeVideoResource`**
  (`videoResourceFrom.ts:65`, `:71`), so the `removeAttribute('src')` + `load()` sequence has exactly
  one home and a third path cannot introduce a third variant. Success is deliberately untouched — the
  caller takes ownership there.
- **The live work is parked and cross-cutting, not local.** [assessment](./assessment.md) Backlog holds
  the frame-capture seam into `bitmap`/`image`, the `*FromUrl`-rejects vs `*FromUrls`-sentinel
  convention fork (shared with `audio` and `image`), splitting the playback types out of
  `VideoResource.ts` in `@flighthq/types`, and whether the `createVideoResource(element?)` wrapper
  earns a function. Each needs a ruling rather than a sweep.
- **No Rust crate lives in this repo.** The `flighthq-video` mirror and the parity note the log below
  refers to are in the spun-out Rust repository; there is no `Cargo.toml` here to check against.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Re-verified all Open items against source; all still hold. Converted to the Open + Log
  contract and dropped the resolved revoke-timing entry and the dangling `_QUESTIONS.md` pointer.
- **2026-07-30** — Blob object-URL revocation moved to disposal: `VideoResource` gains a nullable
  `objectUrl` in `@flighthq/types`, the loader transfers ownership, `disposeVideoResource` revokes.
  The verb stays `dispose*` — revoking releases a blob-store reference to GC and frees nothing non-GC.
- **2026-07-30** — Both loader abandonment paths (error, abort) route their element release through
  `disposeVideoResource`; an empty `src` resolves against the document base URL and re-fetches the page
  as media, which is why the old `src = ''` release was worse than none.
- **2026-06-25** — Extracted from the eliminated `@flighthq/resources` as `videoResource` /
  `videoResourceFrom`; consumed by `@flighthq/media`.
- **2026-06-25** — A `flighthq-video` Rust crate mirrored the split; that code no longer lives here.
