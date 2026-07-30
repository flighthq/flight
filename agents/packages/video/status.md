---
package: '@flighthq/video'
updated: 2026-07-30
by: builder
---

# video — Status Log

## 2026-07-30 — blob object-URL revocation moved to disposal (builder)

Implements chief's ruling on the fork parked earlier the same day. `VideoResource` gains a nullable `objectUrl` in `@flighthq/types`; `loadVideoResourceFromBlob` transfers ownership of the URL to the resource it returns instead of revoking when the load settles; `disposeVideoResource` revokes it. The verb stays `dispose*` under the teardown doctrine: revoking releases the blob-store reference that keeps the `Blob` reachable, so it becomes GC-eligible — nothing non-GC is freed and no handle is invalidated ahead of teardown.

The failure path is the one place the loader still revokes, because it returns no resource for anyone to dispose. Revocation also happens *after* the element has released its src, so the media resource is never detached from a URL the element is still reading through; a test pins that ordering.

The two tests that pinned the old timing moved with the fix and now assert the invariant the old timing actually broke — the resource comes back holding a live URL — with a second case at `readiness: 'metadata'`, where only the container header has been read and every byte of media is still to come.

Verified with four separate mutations, each confirmed applied before trusting the result, each failing a disjoint set: dispose-revoke (3 tests), loader ownership transfer (2), the null guard alone (2), the failure-path revoke alone (2). That last pair is the new standing lens in practice — removing only the mechanism a test is titled for, rather than a nearby defense that would mask it.

Also fixed test hygiene in `videoResource.test.ts`: the file never restored mocks, and `vi.spyOn` returns the *existing* spy when a method is already spied, so URL spies shared one call history across tests and every count assertion silently read the previous test's calls. 58 → 64 tests.

## 2026-07-30 — decoder release on the loader's abandonment paths (builder)

Swept the cell; all six assessment Recommended items were already landed (commit `2ef652b3`) and are now retired there, so the TODO index was scraping a stale section. The cell itself did hold a real defect, in the one place the review singles out for praise — "mid-load abort clears `src` to stop the network fetch … the best-crafted code in the package."

`loadVideoResourceFromUrl` creates the element it loads into, so it owns that element on any path where it does not hand it to the caller. There are two such paths and neither released it correctly. Probed before fixing: on abort the element ended with `src` **present and empty** and `load()` never called; on error it ended with `src` fully intact and no release attempt at all. The empty-`src` case is the worse of the two — an empty src resolves against the document base URL, so the element goes on to fetch the *page* as media instead of stopping.

Fixed as a class rather than an instance: both rejection paths now route through `disposeVideoResource`, which already encodes the correct `removeAttribute('src')` + `load()` sequence, so the sequence has exactly one home and a third abandonment path cannot reintroduce a third variant. Success is deliberately untouched — the caller takes ownership there. One regression test per abandonment transition; both were confirmed to fail against the unfixed code (with the mutation verified as applied first), and the other 14 in the file kept passing. 56 → 58 tests.

Not fixed, and parked in [assessment](./assessment.md) Backlog for a ruling: `loadVideoResourceFromBlob` revokes its object URL when the load settles rather than at end of life, which breaks playback outright under `readiness: 'metadata'`. Every available fix crosses a seam (a new `VideoResource` field in `@flighthq/types`, plus a `dispose*`/`destroy*` verb question), and two existing tests currently pin the defective timing.

## 2026-06-25 — extracted from @flighthq/resources (resources eliminated)

New package: `videoResource`/`videoResourceFrom` (create + URL constructors). Deps: types. Consumed by `@flighthq/media` (videoChannel). 9 tests pass.

## 2026-06-25 — Rust crate mirror (builder Phase 5)

Rust crate `flighthq-video` created as part of splitting the Rust `flighthq-resources` crate to mirror this TS refactor. Layering preserved (image ← textureatlas ← tileset). cargo build/test/fmt green; clippy `-D warnings` clean for the new crates. The broader Rust port still has a large pre-existing function-level parity gap (68.8% native-core) tracked separately — see `_QUESTIONS.md` Phase 5.
