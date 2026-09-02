---
package: '@flighthq/mediasession'
status: solid
score: 94
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - types
  - host-web provider
---

# mediasession — Review

## Verdict

`solid` — **94/100**. The package is a clean, narrowly scoped bridge between application code and the
OS media-session capability. It exposes 10 exports across one source file, all taking an explicit Host
witness and returning reason-only outcomes. The Web provider lives in `host-web`; native hosts publish
empty media groups. Source alphabetization, test alignment, export lanes, type placement, dependency
hygiene, and teardown semantics all satisfy the codebase contract. The remaining directions are product
choices (action vocabulary growth, metadata optionality, player helper) rather than correctness gaps in
the commissioned scope.

## Present capabilities

Verified against `packages/mediasession/src/mediasession.ts` (10 exports, 119 lines), the type surface
in `packages/types/src/MediaSession.ts`, and the Web providers in `packages/host-web/src/webMediasession.ts`.

### Command surface (5 exports)

- `setMediaSessionMetadata(host, metadata)` — delegates to `host.media.session.setMetadata`; returns the
  provider's method-tight outcome (`ok | media-session-unavailable | media-metadata-unavailable |
  invalid-artwork-source | operation-failed`).
- `clearMediaSessionMetadata(host)` — delegates to `host.media.session.clearMetadata`.
- `setMediaSessionPlaybackState(host, state)` — validates the `'none' | 'paused' | 'playing'` union
  locally and throws `TypeError` for out-of-union values (programmer misuse) before provider dispatch.
- `setMediaSessionPositionState(host, state)` — validates duration (finite, positive), position (finite,
  non-negative, within duration), and playback rate (finite, non-zero) against the W3C algorithm locally.
  Invalid input returns the specific local reason without invoking the provider.
- `clearMediaSessionPositionState(host)` — delegates to `host.media.session.clearPositionState`.

All five accept a `HasMediaSession` witness (narrowed from full Host to the `media.session` slot) and
return the provider's `MediaSessionOperationOutcome` narrowed to only the reasons that method can reach.

### Action surface (4 exports)

- `createMediaSessionActionSignal(action)` — allocates an Entity carrying the requested
  `MediaSessionAction` and a `Signal` (`onAction`). Per-action granularity is intentional: blanket
  registration is impossible by design, preventing advertisement of transport controls the app has not
  wired.
- `attachMediaSessionAction(host, signal)` — subscribes via `host.media.sessionAction.subscribe`; stores
  the returned unsubscribe in a `WeakMap` keyed by the signal Entity. Returns `false` when the provider
  returns `null` (truthful runtime refusal). Reattaching first releases the prior exact origin.
- `detachMediaSessionAction(signal)` — invokes the stored unsubscribe. On throw, the map entry is
  retained so a subsequent detach retries the same origin.
- `disposeMediaSessionActionSignal(signal)` — wraps detach in `try/finally` with `clearSignal`, ensuring
  signal listeners are released even when the provider unsubscribe throws.

### Teardown (1 export)

- `destroyMediaSession(host)` — accepts `HasMediaSession & HasMediaSessionAction`, collects the two
  providers into a `Set` (deduplicating an aliased identity), and destroys each once. A throwing provider
  does not prevent the distinct sibling from being attempted; the first error is rethrown after all
  providers are visited.

### Type surface (`@flighthq/types/contract`)

All types reside in `MediaSession.ts` within `@flighthq/types`:
- Data: `MediaSessionMetadata`, `MediaSessionArtwork`, `MediaSessionPositionState`,
  `MediaSessionPlaybackState`, `MediaSessionAction`, `MediaSessionActionDetails`.
- Outcomes: `MediaSessionOperationOutcome<BlockReason>` with five method-tight narrowings
  (`Set*Outcome`, `Clear*Outcome`). `MediaSessionOperationBlockReason` is the closed union of all
  possible block reasons.
- Backends: `MediaSessionBackend` (Entity, 5 command methods + `destroy`) and
  `MediaSessionActionBackend` (Entity, `subscribe` + `destroy`), split because their shapes and
  teardown obligations differ.
- Signal: `MediaSessionActionSignal` (Entity with `action` and `onAction` signal).

### Host integration

- `Host.media.session` (`MediaSessionBackend`) and `Host.media.sessionAction`
  (`MediaSessionActionBackend`) are optional slots on `HostMediaCapabilities`. Both are Web-only today.
- `HasMediaSession` and `HasMediaSessionAction` are narrow witness interfaces extracting one slot each.
- Web: `host-web` supplies `webMediaSessionBackend` and `webMediaSessionActionBackend` (pre-created
  singletons from `createWebMediaSessionBackend()` / `createWebMediaSessionActionBackend()`). Wired
  into `webHost.media.session` and `.sessionAction`.
- Native: Electron, Tauri, and Capacitor all publish `media: {}` — no session or sessionAction slots,
  making `HasMediaSession` / `HasMediaSessionAction` a compile-time capability gate.

## Gaps

No correctness gaps in the commissioned scope. The package implements every charter north-star function
and respects every stated boundary. Specific observations:

- **No ambient state, no singleton, no module-level resolver.** The `_actionSubscriptions` WeakMap is
  private implementation state (underscore-prefixed, not exported), keyed by Entity identity, and
  garbage-collectable — it is not the kind of module-level mutable state the explicit-dependency rule
  prohibits.
- **`assertSyncVoid` is duplicated** between `mediasession.ts` and `host-web/webMediasession.ts`. It is
  a 3-line compile-time guard (ensures `destroy()` is not accidentally `async`), and the two copies live
  in separate packages with no shared utility dependency. Not a correctness issue; extracting it would
  require a shared utility home that does not yet exist and would add a dependency for a trivial helper.

## Charter contradictions

None. Each charter decision is verified executed:

- **[2026-07-11] Web backend wraps `navigator.mediaSession` directly** — verified in
  `host-web/webMediasession.ts`: `MetaMetadata(...)`, property setters, `setActionHandler`, guarded
  by `typeof navigator !== 'undefined'`.
- **[2026-07-11] Decoupled from `@flighthq/media`** — verified: `package.json` dependencies are
  `entity`, `signals`, `types` only. No `media` import anywhere.
- **[2026-08-29] R3 explicit Host split** — verified: two distinct backend types, two Host slots, two
  witness interfaces. No ambient resolver, no sentinel, no diagnostic probe, no enabler in this package.
- **[2026-08-29] Reason-only outcomes** — verified: each command function returns a
  `MediaSessionOperationOutcome` narrowed to its reachable reasons. No generic success flag.
- **[2026-08-29] Provenance-pinned cleanup** — verified in host-web: command publications track
  provider/session/lane token with exact-value comparison for readable lanes; action subscriptions
  pin session/action/token with the exact returned unsubscribe retained until successful release.

## Contract & docs fit

**Export lanes.** `index.ts` re-exports all 10 functions from `./contract`; `contract.ts` re-exports
from `mediasession.ts`. The two lanes expose the same set (no contract-only exports), which is
appropriate for a small package with no intra-SDK-only functions.

**Types-first.** All types in `@flighthq/types`. The package exports functions only.

**`sideEffects: false`.** No top-level side effects; no registration, no listeners, no global mutation.

**Naming.** All 10 exported functions include the full unabbreviated `MediaSession` or
`MediaSessionAction` in their name. Verb discipline is correct: `create*` allocates, `attach/detach`
manage subscriptions, `dispose*` releases to GC, `destroy*` tears down provider resources, `set*/clear*`
publish state.

**`Readonly<T>`.** Applied to `metadata` and `state` parameters on `setMediaSessionMetadata` and
`setMediaSessionPositionState`.

**Sentinel vs throw.** `attachMediaSessionAction` returns `false` for expected runtime refusal (provider
returns `null`). `setMediaSessionPlaybackState` throws `TypeError` for programmer misuse (out-of-union
value). `setMediaSessionPositionState` returns local validation reasons as outcome objects. Correct split.

**Source order.** Exported functions are alphabetized. Module-level constants and the WeakMap sit after
all exports. `IsAny` type and `assertSyncVoid` helper are at the bottom.

**Test alignment.** 10 `describe` blocks match 1:1 with the 10 exported functions in alphabetical order.
16 test cases cover: explicit routing, local validation (8 parameterized position-state cases), programmer
misuse rejection, Entity identity, attach/null refusal, origin pinning, retry semantics, reattach
ordering, disposal with detach failure, and distinct/aliased provider destruction (including
`undefined` throw preservation).

**SDK barrel.** `@flighthq/sdk` re-exports all 10 functions from both `.` and `./contract` lanes.

**Dependencies.** `entity`, `signals`, `types` — minimal and correct. Intra-SDK imports resolve to
`@flighthq/entity/contract` and `@flighthq/signals/contract`.

## Candidate open directions

1. **Action vocabulary growth.** The current `MediaSessionAction` union covers the 9 W3C actions. As
   browser standards add new actions, a separate ruling determines whether the union expands or an open
   registry replaces it.
2. **Metadata field optionality.** All four metadata fields (`title`, `artist`, `album`, `artwork`) are
   required. Whether to make some optional (e.g. `artwork` for audio-only apps) is a product decision.
3. **Player integration helper.** A convenience bridge that wires `@flighthq/media` playback state to
   the media session belongs in `media`, an example, or a dedicated utility — not here.
4. **Native host implementations.** Electron, Tauri, and Capacitor currently publish empty media groups.
   When native media-session APIs are wired, new backends will implement `MediaSessionBackend` and
   `MediaSessionActionBackend` in their respective `host-*` packages with no changes needed here.
