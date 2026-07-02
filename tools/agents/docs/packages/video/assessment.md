---
package: '@flighthq/video'
updated: 2026-07-02
basedOn: status.md
---

# video — Assessment

Verified against the live tree (2 source files, 2 test files, 7 tests, 5 exports) and the direction session (2026-07-02). Four charter decisions blessed. No depth review exists.

## Recommended

Sweep-safe: within `@flighthq/video`, no open design decision beyond what the charter has blessed.

1. **Remove `createVideoResourceFromUrl` and `createVideoResourceFromUrls`.** Per charter Decision #1. These fire-and-forget functions silently swallow errors. The async `loadVideoResourceFromUrl` / `loadVideoResourceFromUrls` are the honest API. Remove the sync URL loaders, update the barrel, remove their tests. The sync `createVideoResource(element?)` stays (wrapping an already-available element is valid).

2. **DRY `inferVideoType`.** Per charter Decision #2. Extract to a shared internal module or align with the pattern used for font/audio once that pattern is established.

## Backlog

- **Breadth review for AAA completeness.** _Parked — no review exists._ Charter Open direction #1.
- **Rust `flighthq-video` crate.** _Parked — global posture._ Already exists from resources split.

## Approved

- [2026-07-02 · picked] Sweep items 1–2: remove fire-and-forget URL loaders, DRY inferVideoType
