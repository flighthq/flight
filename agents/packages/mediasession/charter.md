---
package: '@flighthq/mediasession'
role: package
crate: null
draft: false
lastDirection: 2026-08-29
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# mediasession — Charter

## What it is

`@flighthq/mediasession` is the explicit-Host OS media-session bridge. It publishes now-playing
metadata, playback state and position, and turns provider-emitted transport actions into per-action
signal entities. It does not play media or own a timeline.

The capability is Web-only today. `webHost.media` supplies `session` and `sessionAction`;
Electron, Tauri and Capacitor truthfully publish an empty media group.

## North star

- Commands take a `HasMediaSession` witness and return a method-tight, reason-only outcome:
  `setMediaSessionMetadata`, `clearMediaSessionMetadata`, `setMediaSessionPlaybackState`,
  `setMediaSessionPositionState`, and `clearMediaSessionPositionState`.
- Events use a `MediaSessionActionSignal` Entity created for one action and managed through
  `createMediaSessionActionSignal`, `attachMediaSessionAction`, `detachMediaSessionAction`, and
  `disposeMediaSessionActionSignal`.
- Commands and actions occupy separate Host slots because their shapes and lifetimes differ.
- Web providers live in `@flighthq/host-web`: `createWebMediaSessionBackend` owns command publications;
  `createWebMediaSessionActionBackend` owns native action registrations.

## Boundaries

- No ambient resolver, custom/host precedence, sentinel, support observer, diagnostic probe, or enabler.
  Capability absence is an omitted Host slot; runtime browser failure is a command outcome.
- `@flighthq/mediasession` depends only on Entity, Signals, and Types. It remains independent of
  `@flighthq/media`; applications wire player state to the session.
- Position validation is local. An invalid playback-state union value is programmer misuse and throws
  before provider dispatch. Platform method/assignment failures return `operation-failed`.
- A subscription is established only for the requested action. Attach returns `false` when the provider
  cannot subscribe; a successful attach retains the exact returned unsubscribe until release succeeds.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Web backend wraps `navigator.mediaSession` directly.** Metadata → `new MediaMetadata(...)`, playback/position → the corresponding setters, action handlers → `setActionHandler`. Guarded by `typeof navigator !== 'undefined' && 'mediaSession' in navigator` — absent → no-op sentinel.
- **[2026-07-11] Decoupled from `@flighthq/media`.** The seam takes plain data + callbacks; it does not import the player. This keeps a media-less app (e.g. a game using it for its own audio) able to use it, and avoids a dependency cycle.
- **[2026-08-29] R3 explicit Host split.** `Host.media.session` is the Web-only command slot and
  `Host.media.sessionAction` the Web-only event slot. Both backends are Entities with independent
  teardown. This supersedes the 2026-07-11 sentinel/location portion of the first ruling: the provider
  moved to `@flighthq/host-web`, and ambient absence became Host slot absence.
- **[2026-08-29] Reason-only outcomes.** Each command exposes only the reasons it can reach. Metadata
  construction isolates artwork-source `TypeError`; later browser artwork loading is unobservable.
- **[2026-08-29] Provenance-pinned cleanup.** Web ownership includes provider, exact session, lane/action,
  and token. Successors and foreign publications survive; failed detach/destroy remains retryable.

## Open directions

1. An optional player integration helper belongs with `@flighthq/media` or an example, not here.
2. Action-vocabulary growth requires a separate ruling; R3 deliberately preserves the existing set.
