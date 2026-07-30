---
package: '@flighthq/video'
updated: 2026-07-30
by: builder
---

# video — Status Log

## 2026-07-30 — decoder release on the loader's abandonment paths (builder)

Swept the cell; all six assessment Recommended items were already landed (commit `2ef652b3`) and are now retired there, so the TODO index was scraping a stale section. The cell itself did hold a real defect, in the one place the review singles out for praise — "mid-load abort clears `src` to stop the network fetch … the best-crafted code in the package."

`loadVideoResourceFromUrl` creates the element it loads into, so it owns that element on any path where it does not hand it to the caller. There are two such paths and neither released it correctly. Probed before fixing: on abort the element ended with `src` **present and empty** and `load()` never called; on error it ended with `src` fully intact and no release attempt at all. The empty-`src` case is the worse of the two — an empty src resolves against the document base URL, so the element goes on to fetch the *page* as media instead of stopping.

Fixed as a class rather than an instance: both rejection paths now route through `disposeVideoResource`, which already encodes the correct `removeAttribute('src')` + `load()` sequence, so the sequence has exactly one home and a third abandonment path cannot reintroduce a third variant. Success is deliberately untouched — the caller takes ownership there. One regression test per abandonment transition; both were confirmed to fail against the unfixed code (with the mutation verified as applied first), and the other 14 in the file kept passing. 56 → 58 tests.

Not fixed, and parked in [assessment](./assessment.md) Backlog for a ruling: `loadVideoResourceFromBlob` revokes its object URL when the load settles rather than at end of life, which breaks playback outright under `readiness: 'metadata'`. Every available fix crosses a seam (a new `VideoResource` field in `@flighthq/types`, plus a `dispose*`/`destroy*` verb question), and two existing tests currently pin the defective timing.

## 2026-06-25 — extracted from @flighthq/resources (resources eliminated)

New package: `videoResource`/`videoResourceFrom` (create + URL constructors). Deps: types. Consumed by `@flighthq/media` (videoChannel). 9 tests pass.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-video` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.
