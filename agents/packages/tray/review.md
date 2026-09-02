---
package: '@flighthq/tray'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - '@flighthq/types/src/Tray.ts'
  - '@flighthq/types/src/Host.ts (tray section)'
  - '@flighthq/types/src/ElectronTrayCapabilitiesFor.ts'
  - '@flighthq/types/src/TauriTrayCapabilitiesFor.ts'
  - platform-integration.md
---

# tray — Review

## Verdict

`solid — 82/100`. The package was completely rewritten since the last review (2026-06-25, score 38)
and now implements the ratified explicit-dependency model with capability-refined Entities, 15
independently optional host facets, origin-pinned operations, and generation-checked animation. The
type surface in `@flighthq/types` is comprehensive and well-structured. All 27 tests pass, the API
is clean and alphabetized, and both Electron and Tauri host backends exist with profile-honest slot
coverage. The score is not higher because testing depth is shallow for several operations (outcome
assertions only, no behavioral verification) and the guard layer covers only one case.

## Present capabilities

### Core API (26 public exports + 1 contract-only)

Source is in two files: `tray.ts` (384 lines) and `enableTrayGuards.ts` (41 lines), with colocated
tests in `tray.test.ts` (473 lines, 25 tests) and `enableTrayGuards.test.ts` (80 lines, 2 tests).

**Lifecycle:**
- `createTrayIcon(host, options?)` — async Entity acquisition from an explicit `HasTrayLifecycle`
  host; returns `TrayCreateResult<TrayIconForHost<HostType>>` with capability-refined type. The
  returned Entity carries exactly the facets present on the Host type supplied at creation via the
  `TrayFacetFor` conditional type.
- `destroyTrayIcon(tray)` — attempt-all teardown: stops animation, releases all subscriptions, then
  calls the provider's `destroy`. Handles partial failure via `'partially-destroyed'` state and is
  idempotent after success (`'already-destroyed'`). Deduplicates concurrent destroy calls through a
  cached promise.
- `getTrayIcons(host)` — returns the provider's live list, preserving acquisition order.
- `isTrayDestroyed(tray)` — queries the pinned lifecycle.

**Image & appearance (5 functions):**
- `setTrayIcon`, `setTrayPressedIcon` — update image via origin-pinned `image`/`pressedImage` facets.
- `setTrayIconTemplate` — macOS template image treatment.
- `setTrayIconTitle`, `setTrayIconTooltip` — with paired `getTrayIconTitle`, `getTrayIconTooltip` readers.

**Menu (2 functions):**
- `setTrayIconContextMenu` — installs a `MenuItemTemplate[]` descriptor.
- `popupTrayContextMenu` — shows the menu at an optional `Vector2Like` position.

**Balloon (Windows) (2 functions):**
- `displayTrayBalloon`, `removeTrayBalloon` — display/remove with `TrayBalloonOptions`.

**Events (4 functions):**
- `onTrayInteraction`, `onTrayMenuSelection`, `onTrayBalloonEvent`, `onTrayDrop` — each returns a
  `TrayEventAttachResult` with a once-guarded `release` closure. Subscriptions are tracked in the
  runtime's `releases` set and auto-released on destroy.

**Animation (3 functions):**
- `startTrayIconAnimation` — writes frames through the origin-pinned image facet with serialized
  writes (`animationWriteTail` promise chain). Replaces any running animation (generation-checked).
  Returns a release closure that stops only the animation it started.
- `stopTrayIconAnimation` — synchronous generation-bump + `clearInterval`.
- `isTrayIconAnimating` — queries the current timer state.

**Policy (1 function):**
- `setTrayIgnoreDoubleClickEvents` — macOS-only double-click suppression.

**Guard layer (3 functions):**
- `enableTrayGuards` / `disableTrayGuards` — opt-in dev-time warning for non-positive animation
  interval, through the `setTrayAnimationGuard` seam (contract-only).
- `setTrayAnimationGuard` — the injection point; contract-only, not on the public lane.

### Type surface (`@flighthq/types`)

All types live in `@flighthq/types` as required. `Tray.ts` (320 lines) defines:

- `TrayIcon` (extends Entity), 14 `TrayWith*` capability marker interfaces using unique symbols
- `TrayIconForHost<HostType>` — conditional mapped type composing facets from the host
- `DesktopOsProfile`, `TrayIconSource`, `TrayIconOptions`, `TrayBalloonOptions`
- 4 event types: `TrayInteractionEvent`, `TrayMenuSelectionEvent`, `TrayBalloonEvent`, `TrayDropEvent`
- 15 result types covering every operation outcome
- 15 backend interfaces (one per facet), each extending `Entity`
- `TrayEventRelease` and `TrayEventAttachResult`

`Host.ts` defines `HostTrayCapabilities` (15 optional slots) and 15 `HasTray*` narrow constraint
interfaces.

`ElectronTrayCapabilitiesFor.ts` and `TauriTrayCapabilitiesFor.ts` provide profile-conditional
capability maps covering Linux/macOS/Windows slot availability.

### Host backends

- **host-electron:** `createElectronTrayCapabilities(electron, profile)` — profile-honest slots
  for Linux (8 slots), macOS (+5), Windows (+2 balloon). Has a dedicated test file
  (`electronTray.test.ts`).
- **host-tauri:** `createTauriTrayCapabilities(tauri, profile)` — profile-honest slots for Linux
  (4+title), macOS (+interaction/template/tooltip), Windows (+interaction/tooltip). Has a dedicated
  test file (`tauriTray.test.ts`).
- **host-web / host-capacitor:** Empty `tray: {}` group — the required empty group per charter.

### Package shape

- `package.json`: correct two-lane exports (`.` and `./contract`), `"sideEffects": false`,
  dependencies only on `@flighthq/entity`, `@flighthq/log`, `@flighthq/signals`, `@flighthq/types`.
- No top-level side effects; no `set*Backend` singletons.
- `index.ts` curates 26 public exports; `contract.ts` re-exports everything (adds `setTrayAnimationGuard`).
- Exported functions are alphabetized in `index.ts`.

## Gaps

1. **Guard layer is minimal.** Only one guard exists (non-positive animation interval). Missing
   guards for common misuse patterns:
   - Operating on a destroyed tray (all `invokeUpdate`/`invokeRead` calls silently return
     `'tray-destroyed'` — no dev warning).
   - Starting animation with a single frame (functionally a no-op cycle).
   - Calling `destroyTrayIcon` while animation writes are in-flight (the serialized write queue is
     not awaited in `destroyTrayRuntime`; the `for...of` loop releases subscriptions sequentially
     but does not wait for `animationWriteTail`).

2. **Test depth is uneven.** All 25 `describe` blocks in `tray.test.ts` and 2 in
   `enableTrayGuards.test.ts` mirror source exports (alphabetized, matching). However:
   - Most operation tests verify only the `outcome` string, not behavioral side effects (e.g.,
     `setTrayIconContextMenu`, `setTrayIconTemplate`, `setTrayPressedIcon`, `setTrayIgnoreDoubleClickEvents`
     test only that `outcome === 'updated'` without verifying the mock received the arguments).
   - `displayTrayBalloon` test does not verify balloon options were forwarded.
   - No test for `createTrayIcon` with a failing provider (e.g., `'tray-create-failed'` outcome).
   - No test for `createTrayIcon` with `options` populated (icon, title, tooltip, signal).
   - No test for concurrent `destroyTrayIcon` calls (the deduplication via `destroyPromise`).
   - No test for `destroyTrayIcon` stopping a running animation.
   - No test for animation write serialization (two rapid `startTrayIconAnimation` calls).
   - `onTrayInteraction` tests release behavior well, including destroy-releases-subscription.
     Other event functions (`onTrayBalloonEvent`, `onTrayDrop`, `onTrayMenuSelection`) test only
     the `'attached'` outcome and delivery, not release or destroy cleanup.
   - No test for operating on a destroyed tray returning `'tray-destroyed'`.

3. **`invokeRead` is just `invokeUpdate`.** The `invokeRead` helper at line 373 calls `invokeUpdate`
   directly — they share the same implementation. The distinction exists for naming clarity, which is
   fine, but the `invokeRead` function signature uses the same generic constraints as `invokeUpdate`
   and does not enforce read-only semantics at the type level.

4. **Animation write serialization does not surface failures.** In `queueAnimationWrite`, if
   `setTrayIcon` returns an error outcome during an interval tick, the error is silently dropped —
   the `result` variable inside the interval callback's `queueAnimationWrite` call is never read by
   the caller (the interval callback `void`s the promise). Only the initial frame's write result is
   surfaced to the caller.

5. **No `AbortSignal` integration in `createTrayIcon`.** `TrayIconOptions` declares an optional
   `signal?: AbortSignal`, but `createTrayIcon` does not check it — the signal is forwarded to the
   provider's `create` and the provider decides whether to honor it. The package does not cancel the
   creation promise if the signal fires during provider acquisition.

## Charter contradictions

None. The implementation faithfully implements every stated charter decision:

- **[2026-07-02] `getTrayIconBounds` return type** uses `RectangleLike` from `@flighthq/types` via
  `TrayBoundsResult`. Done.
- **[2026-07-30] One animation per tray** — `startTrayIconAnimation` bumps the generation and stops
  the prior animation before starting a new one. `destroyTrayIcon` stops animation. The returned
  closure stops only its own generation. All correct.
- **[2026-07-30] `stopTrayIconAnimation` and `isTrayIconAnimating`** — both exist and work as
  documented.
- **[2026-08-30] Explicit, origin-pinned Entity** — `createTrayIcon` returns a capability-refined
  Entity with no public id, operations use captured facet values, animation is Entity-keyed and
  origin-pinned, menus are generation-checked, releases are once-guarded, and teardown attempts all
  still-owned resources. All correct.
- **[2026-08-30] Provider coverage is Host x injected OS profile** — Web and Capacitor expose
  the required empty group. Electron and Tauri constructors receive `DesktopOsProfile` and expose
  only the documented slots per profile. No constructor reaches `process.platform`. All correct.

## Contract & docs fit

**(a) Package adherence to the contract:**

- Types-first: all types in `@flighthq/types`. Pass.
- Full unabbreviated names: all exported functions use `Tray`/`TrayIcon`/`TrayBalloon` in full. Pass.
- Sentinels, not throws: every operation returns discriminated outcome unions. `catch` blocks in
  `invokeUpdate` and `createTrayIcon` convert thrown errors to outcome objects. Pass.
- Two-lane exports with `sideEffects: false`. Pass.
- Entity-based: `TrayIcon extends Entity`, `createTrayIcon` returns Entity, backend interfaces
  extend Entity. Pass.
- `Readonly<>` on parameters: applied on `TrayIconOptions`, `TrayBalloonOptions`, `Vector2Like`,
  event payloads. Pass.
- Diagnostics inversion: `enableTrayGuards` lives in a separate file, uses `@flighthq/log`, and
  the seam (`setTrayAnimationGuard`) is contract-only. Pass.
- No module-scoped mutable state beyond `_animationGuard` (the guard seam, which is the
  deliberate injection point for the diagnostics layer). Pass.

**(b) Candidate contract/doc revisions:**

- The Package Map in `AGENTS.md` lists tray in the Platform group, which is correct.
- The platform-integration shared principles document (`platform-integration.md`) still references
  the old pattern: "Flat free functions over a swappable `*Backend`. Web backends are installed
  explicitly via `enableHostWeb()` ... `get*Backend` / `set*Backend`." Tray has moved beyond this
  pattern to the explicit-dependency model with no `get*Backend`/`set*Backend`. The shared
  principles document may need updating to reflect the new model, or a note that tray (and
  potentially other packages) have been migrated.

## Candidate open directions

The charter's Open directions already cover additional pointer events and theme-aware icon pairing.
Additional candidates surfaced by this review:

1. **Animation error handling policy.** When an interval-driven frame write fails (e.g., the native
   icon handle becomes invalid), the error is silently dropped. Should the animation auto-stop on
   error? Should there be an error callback? This is a design question the charter does not address.

2. **`AbortSignal` semantics in `createTrayIcon`.** The `TrayIconOptions` type accepts `signal` but
   the package-level function does not act on it. Whether the package should enforce cancellation or
   delegate entirely to the provider is unspecified.

3. **Guard coverage breadth.** The guard layer has one guard. The diagnostics convention says "a
   comment that warns the caller about misuse is a missing guard" — the silent `'tray-destroyed'`
   return from every operation after destroy is a candidate for a dev-time warning.
