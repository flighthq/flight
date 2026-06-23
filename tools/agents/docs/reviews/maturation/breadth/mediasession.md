# New Package Spec: @flighthq/mediasession

**Represents** — The OS now-playing / lock-screen transport-control + metadata seam and audio-focus / interruption handling: tells the OS what is playing and lets the OS (lock screen, headset buttons, smart-watch, car head unit, Bluetooth remote) drive play/pause/seek, while surfacing focus loss/duck/interruption back to the app — complementing `@flighthq/media`, which owns actual playback.

**Requested by** — application-platform

## Fits

- **Tier:** Platform Integration Suite (alongside `media`, `power`, `notification`). It is _not_ a playback package — `@flighthq/media` keeps `AudioChannel`/`VideoChannel`. `mediasession` is the OS-integration layer above them.
- **Backend seam:** swappable `MediaSessionBackend` defined in `@flighthq/types`, with `getMediaSessionBackend` / `setMediaSessionBackend` / `createWebMediaSessionBackend`. The web backend wraps `navigator.mediaSession` (metadata, `setActionHandler`, `setPositionState`, `playbackState`) and approximates audio focus/interruption via page visibility + audio-output device events; every touch is guarded so it degrades to no-op / sentinel when the API is absent (jsdom, older browsers).
- **Two shapes in one cell** (mirrors the suite's dual pattern): a _command_ surface (push metadata + playback state + supported actions to the OS) and an _event_ surface (the OS-originated transport actions and audio-focus/interruption changes arrive as signals on a `MediaSession` entity, like `Power`). Both share one backend.
- **Dependencies:** `@flighthq/types` (header), `@flighthq/signals` (event surface). Does **not** depend on `@flighthq/media` — it operates on plain metadata data, not channels, so a caller can drive it from `media`, from a `<video>`, or from native audio without coupling. Examples wire `media` → `mediasession`; the package itself stays decoupled.
- **Neighbor packages:** `media` (playback it represents), `power` (keep-awake while playing), `lifecycle` (background/foreground), `notification` (distinct — transient OS toast vs. persistent now-playing). No `-formats` neighbor needed (no parsers/importers here).
- **Rust crate:** `flighthq-mediasession`. Native default backend feature-gated `native` (MPRIS on Linux via zbus, `MPNowPlayingInfoCenter`/`MPRemoteCommandCenter` on mac/iOS, `SystemMediaTransportControls` on Windows, `MediaSession` on Android); `host-web` fills the web backend. Audio-focus is native-first (`AudioManager.requestAudioFocus` / `AVAudioSession` interruption notifications); the seam stays sync where native is sync.

## Bronze

The minimum that makes background/lock-screen audio usable: tell the OS what is playing and receive play/pause/stop from hardware/lock-screen controls.

- **`@flighthq/types` first:**
  - `MediaSessionKind = 'MediaSession'` string identifier.
  - `MediaSessionMetadata` — plain data: `title`, `artist`, `album`, `artworkUrl`, `durationSeconds` (`-1` when unknown).
  - `MediaSessionPlaybackState` — string union open contract: `'none' | 'playing' | 'paused'`.
  - `MediaSessionAction` — string-kind union: `'play' | 'pause' | 'stop'` (extended in later tiers).
  - `MediaSession` — event entity: `onPlay`, `onPause`, `onStop` signals (payload `()`).
  - `MediaSessionBackend` — seam: `isSupported()`, `setMetadata(Readonly<MediaSessionMetadata>): boolean`, `setPlaybackState(MediaSessionPlaybackState): boolean`, `setSupportedActions(Readonly<MediaSessionAction[]>): boolean`, `subscribeAction(listener: (action: MediaSessionAction) => void): () => void`, `clear(): boolean`.
- **`@flighthq/mediasession`:**
  - `createMediaSession(): MediaSession` — inert signals.
  - `createMediaSessionMetadata(): MediaSessionMetadata` — zeroed/empty out-target (`durationSeconds: -1`).
  - `createWebMediaSessionBackend(): MediaSessionBackend` — over `navigator.mediaSession`.
  - `getMediaSessionBackend()` / `setMediaSessionBackend(backend | null)` — lazy web default; always a backend.
  - `isMediaSessionSupported(): boolean`.
  - `setMediaSessionMetadata(out... no — Readonly<MediaSessionMetadata>): boolean` — push metadata; `false` when unsupported.
  - `setMediaSessionPlaybackState(state): boolean`.
  - `setMediaSessionSupportedActions(Readonly<MediaSessionAction[]>): boolean`.
  - `clearMediaSession(): boolean` — remove now-playing entry.
  - `attachMediaSession(session)` / `detachMediaSession(session)` / `disposeMediaSession(session)` — subscribe/teardown of inbound actions to the entity's signals (mirrors `attachPower`).

## Silver

Competitive with a good library: full transport vocabulary, seek/position reporting, and real audio-focus / interruption handling so apps duck and resume correctly.

- **`@flighthq/types` additions:**
  - Extend `MediaSessionAction` with `'seekBackward' | 'seekForward' | 'seekTo' | 'previousTrack' | 'nextTrack' | 'skipAd'`.
  - `MediaSessionPositionState` — `durationSeconds`, `positionSeconds`, `playbackRate`.
  - `MediaSessionSeekDetail` — `seekSeconds` (for `seekTo`), `fastSeek: boolean`, `seekOffsetSeconds` (for skip-by actions).
  - `AudioFocusState` — `'gained' | 'lost' | 'lostTransient' | 'lostTransientDuck'`.
  - `AudioInterruptionReason` — open contract: `'call' | 'alarm' | 'otherApp' | 'routeChange' | 'unknown'`.
  - `MediaSessionInterruption` — `focusState`, `reason`, `shouldResume: boolean`.
  - Add to `MediaSession` entity: `onSeekBackward`, `onSeekForward`, `onSeekTo` (payload `MediaSessionSeekDetail`), `onPreviousTrack`, `onNextTrack`, `onAudioFocusChange` (payload `MediaSessionInterruption`).
  - Extend `MediaSessionBackend`: `setPositionState(Readonly<MediaSessionPositionState>): boolean`, `requestAudioFocus(): boolean`, `abandonAudioFocus(): boolean`, `subscribeAudioFocus(listener: (i: Readonly<MediaSessionInterruption>) => void): () => void`, and richer `subscribeAction` carrying a `MediaSessionSeekDetail` for seek actions.
- **`@flighthq/mediasession` additions:**
  - `createMediaSessionPositionState()` and `setMediaSessionPositionState(Readonly<MediaSessionPositionState>): boolean` — drives the lock-screen scrubber.
  - `requestMediaSessionAudioFocus(): boolean` / `abandonMediaSessionAudioFocus(): boolean`.
  - `getMediaSessionAudioFocusState(out: AudioFocusState... )` — current focus snapshot (or sentinel `'lost'`).
  - `enableMediaSessionSignals(session)` style opt-in if seek/focus signal groups carry cost beyond Bronze (per the suite's `enable*` group convention) — otherwise fold into `attachMediaSession`.
  - Web backend: `setActionHandler` for every action, `setPositionState`, visibility/`pagehide` → transient-loss approximation, audio-output `devicechange` → route-change interruption.
  - **Helper bridge example** (in `examples/`, not the package): `bindMediaSessionToAudioChannel(session, channel)` wiring `media` playback to the session — demonstrates the decoupled composition without the package importing `media`.

## Gold

Authoritative / AAA: exhaustive action set, multi-source arbitration, artwork variants, deterministic teardown, full error/edge handling, and 1:1 Rust parity.

- **`@flighthq/types` additions:**
  - Complete `MediaSessionAction`: `'togglePlayPause' | 'rate' | 'like' | 'dislike' | 'bookmark' | 'shuffle' | 'repeat' | 'enterPictureInPicture'`.
  - `MediaSessionArtwork` — `url`, `widthPixels`, `heightPixels`, `mimeType` (array of sizes, OS picks best); `MediaSessionMetadata.artwork: Readonly<MediaSessionArtwork[]>` superseding single `artworkUrl`.
  - `MediaSessionRepeatMode` (`'off' | 'one' | 'all'`), `MediaSessionMediaType` (`'audio' | 'video' | 'podcast' | 'liveStream'`), `chapterCount` / `MediaSessionChapter` for chaptered media.
  - `MediaSessionGroup` — multi-source arbitration handle so two players (e.g. game music + a video) negotiate one OS session deterministically; `AudioFocusPolicy` (`'mix' | 'duckOthers' | 'exclusive' | 'pauseOthers'`).
  - `MediaSessionLikeState`, `MediaSessionRateDetail`, and a versioned-kind registry hook so vendors namespace custom actions (`'acme.tip'`).
- **`@flighthq/mediasession` additions:**
  - Full action setters/handlers for every Gold action; `setMediaSessionRepeatMode`, `setMediaSessionShuffle`, `setMediaSessionLikeState`.
  - `createMediaSessionGroup()` / `acquireMediaSessionFocus(group)` / `releaseMediaSessionFocus(group)` — pooled `acquire`/`release` brackets for exclusive-focus arbitration across multiple sources, applying an `AudioFocusPolicy`.
  - Artwork: `setMediaSessionArtwork(Readonly<MediaSessionArtwork[]>): boolean` with multi-resolution selection.
  - Chapter / live-stream metadata setters; `MediaSessionMediaType` so video vs. podcast surfaces correctly.
  - Robust teardown: `destroyMediaSession` is _not_ needed (no GPU/native handle owned beyond the subscription) — `disposeMediaSession` is the canonical teardown; document that the OS now-playing entry is cleared on dispose.
  - **Tests:** colocated `*.test.ts` per source file; fake `MediaSessionBackend` exercising every action and focus transition; aliased-`out` tests for `createMediaSession*` out-targets; group-arbitration ordering tests.
  - **Docs + examples:** a background-audio example, a focus-ducking example, a multi-source arbitration example, all running on the web default and lifting onto a host by registration alone.
  - **Rust 1:1 parity:** `flighthq-mediasession` with MPRIS / `SystemMediaTransportControls` / `MPNowPlayingInfoCenter` / Android `MediaSession` native backends, conformance scene pairing by name, divergence map entries for any platform-specific action gaps.
  - **Host adapter wiring:** `host-electron` realizes the seam (Electron has no first-class media session — backend bridges to `setThumbarButtons` / platform SMTC where available, returning `false` cleanly elsewhere); future `host-capacitor` realizes the mobile audio-focus path.

## Boundaries

- **Playback stays in `@flighthq/media`.** This package never starts/stops sound; it reports state and relays OS commands. `bindMediaSessionToAudioChannel` lives in `examples/`, not here.
- **Transient OS toasts stay in `@flighthq/notification`.** Now-playing is a persistent system surface, not a notification — no overlap.
- **Keep-awake stays in `@flighthq/power`** (`setPowerKeepAwake`); a playing session should request it but the call belongs to `power`.
- **App background/foreground stays in `@flighthq/lifecycle`.** Audio-focus interruption (call/alarm/route-change) is media-specific and lives here; generic app pause/resume does not.
- **Picture-in-picture window management** belongs to `@flighthq/application` / video display; only the _action handler_ (`enterPictureInPicture`) is surfaced here.
- **No artwork loading/decoding** — metadata carries URLs/sizes; resource loading is `@flighthq/resources`.
- **Concrete native bindings** (MPRIS, SMTC, AVAudioSession) live in `host-*` crates / native default backends, never in the seam crate's web path.

## Open design questions

- **`enable*` group vs. `attach*`:** does the seek/focus signal set warrant a separate `enableMediaSessionSignals` opt-in (suite convention for cost-bearing groups), or is `attachMediaSession` granular enough? Lean: single `attach*` for Bronze, reassess if the focus subscription proves heavy.
- **Audio focus on web is an approximation.** There is no real `requestAudioFocus` in browsers — should the web backend report `requestMediaSessionAudioFocus()` as `true` (optimistic, focus assumed) or `false` (honest "unsupported")? Proposal: return `true` and emit only the interruptions it _can_ detect (visibility, route change), documenting the gap.
- **Single global session vs. entity-per-source.** The OS exposes one now-playing slot. Bronze treats the backend as a singleton driven by free functions; Gold adds `MediaSessionGroup` arbitration. Should the `MediaSession` _entity_ be the singleton handle from the start, or stay a pure event-receiver with metadata pushed via free functions? Lean: free functions for command surface, entity for events (matches `Power`).
- **Position-state update cadence.** Lock-screen scrubbers want periodic `setPositionState`; should the package own a ticking updater, or leave cadence to the caller's frame loop (consistent with Flight's "no hidden timers" rule)? Lean: caller-driven, document the recommended interval.
- **Metadata `artworkUrl` → `artwork[]` migration:** introduce the array in Silver or defer the single-URL field's removal to Gold? Pre-release means no migration cost — lean toward `artwork[]` from Bronze if it does not bloat the minimal type.
- **Rust audio-focus sync vs. async:** Android `requestAudioFocus` is sync, iOS interruptions are notification-driven (async). Keep the seam sync (native-clean) and bridge async internally per the host-layer async/`Send` note.
