---
package: '@flighthq/audio'
updated: 2026-07-02
basedOn: status.md
---

# audio — Assessment

Verified against the live tree (2 source files, 2 test files, 6 tests, 6 exports) and the direction session (2026-07-02). Five charter decisions blessed. No depth review exists.

## Recommended

Sweep-safe: within `@flighthq/audio`, no open design decision beyond what the charter has blessed.

1. **Remove fire-and-forget `createAudioResourceFromUrl` and `createAudioResourceFromUrls`.** Per charter Decision #2. The async `loadAudioResourceFromUrl` / `loadAudioResourceFromUrls` are the honest API. Remove the sync URL loaders, update the barrel, remove their tests.

2. **Move `getAudioContext()` out — accept `AudioContext` as parameter.** Per charter Decision #1. Remove the module-level `let context` singleton. Change `loadAudioResourceFromUrl(url, signal?)` → `loadAudioResourceFromUrl(context, url, signal?)`. Same for `loadAudioResourceFromUrls`. Remove `getAudioContext` from the barrel export. This is within-package but will break downstream callers in `@flighthq/media` — flag the cross-package impact.

3. **DRY `inferAudioType`.** Per charter Decision #3. Extract to a shared internal module or align with the font/video pattern.

## Backlog

- **Breadth review for AAA completeness.** _Parked — no review exists._ Charter Open direction #1. Audio needs expansion.
- **Rust `flighthq-audio` crate.** _Parked — global posture._ Already exists from resources split.

## Approved

- [2026-07-02 · picked] Sweep items 1–3: remove fire-and-forget URL loaders, move AudioContext out, DRY inferAudioType
