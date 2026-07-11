---
package: '@flighthq/mediasession'
crate: null
draft: false
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# mediasession — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions (flat free functions over a swappable `*Backend`; web backend always available; `get*Backend`/`set*Backend`/`createWeb*Backend`; sentinels not throws; `sideEffects:false`).

## What it is

`@flighthq/mediasession` is the **OS media-session integration seam** — it publishes the currently-playing media's metadata and playback state to the operating system's media UI (lock-screen / notification-shade transport controls, hardware media keys, smart-watch remotes) and routes those hardware transport actions back to the app. It is the "now playing" bridge a media/audio app wires so the OS shows the track and its play/pause/next/seek controls work. Web backend wraps `navigator.mediaSession`; native hosts (`host-electron`/`host-tauri`/`host-capacitor`) can replace it.

## North star

Flat functions over a `MediaSessionBackend`:
- **Metadata**: `setMediaSessionMetadata({ title, artist, album, artwork: MediaSessionArtwork[] })` / `clearMediaSessionMetadata()` — the now-playing card.
- **Playback state**: `setMediaSessionPlaybackState('none' | 'paused' | 'playing')`.
- **Position**: `setMediaSessionPositionState({ duration, playbackRate, position })` / `clearMediaSessionPositionState()` — the scrubber.
- **Action handlers**: `setMediaSessionActionHandler(action, handler)` / `clearMediaSessionActionHandler(action)` where `MediaSessionAction = 'play'|'pause'|'stop'|'seekbackward'|'seekforward'|'seekto'|'previoustrack'|'nexttrack'|'skipad'|...` — the OS transport buttons calling back into the app.
- Seam accessors `getMediaSessionBackend`/`setMediaSessionBackend`/`createWebMediaSessionBackend`. Types (`MediaSessionBackend`, `MediaSessionMetadata`, `MediaSessionArtwork`, `MediaSessionAction`, `MediaSessionPlaybackState`, `MediaSessionPositionState`) in `@flighthq/types`.

## Boundaries

- **The OS transport/metadata seam, not a player.** It reports state to the OS and forwards OS actions; it does NOT play audio/video (that's `@flighthq/media`) or own the timeline. A media app reads its player's state and calls these; the action handlers drive the player.
- **`@flighthq/types` for the seam + data types; the package holds the functions + web backend.** Deps: `@flighthq/types` only (the web backend uses the global `navigator.mediaSession`). No dependency on `@flighthq/media` — the app wires the two.
- **Web sentinels.** On a host without `navigator.mediaSession`, the web backend no-ops / returns sentinels rather than throwing (suite rule).

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Web backend wraps `navigator.mediaSession` directly.** Metadata → `new MediaMetadata(...)`, playback/position → the corresponding setters, action handlers → `setActionHandler`. Guarded by `typeof navigator !== 'undefined' && 'mediaSession' in navigator` — absent → no-op sentinel.
- **[2026-07-11] Decoupled from `@flighthq/media`.** The seam takes plain data + callbacks; it does not import the player. This keeps a media-less app (e.g. a game using it for its own audio) able to use it, and avoids a dependency cycle.

## Open directions

1. **`media` integration helper.** A thin optional bridge (in `@flighthq/media` or an example) that mirrors a media channel's state into the session automatically — built where the player lives, not here.
2. **Richer action set.** `togglemicrophone`/`togglecamera`/`hangup` (call-app actions) as the web API grows them.
