---
id: screen
title: '@flighthq/screen'
type: depth
target: screen
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/screen.md
  - tools/agents/docs/reviews/depth/screen.md
depends_on: []
updated: 2026-06-23
---

## Summary

partial — 55/100. A clean, correct, idiomatic core of a screen-enumeration capability (geometry, work area, scale factor, primary detection, change subscription over a swappable web/native backend), but it stops at the minimal viable surface — missing coordinate converters, point/rect→screen lookup, cursor position, richer change events, and the descriptive fields (rotation, refresh rate, color/HDR, label, internal, native size) that an authoritative display library exposes.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum genuinely-useful version: add the pure-logic queries every multi-monitor consumer reimplements by hand, plus the single most-requested live read (cursor position). No `ScreenInfo` field changes required for the converters/lookups — they derive from the existing `scaleFactor` + origin. The 20% that delivers 80% of the value.

- **Coordinate converters (pure free functions, no host).** Add `screenToDipPoint(screen, point, out)`, `dipToScreenPoint(screen, point, out)`, `screenToDipRect(screen, rect, out)`, `dipToScreenRect(screen, rect, out)` over `ScreenInfo.scaleFactor` + origin (`x`/`y`). Use `Vector2` and `Rectangle` from `@flighthq/types`/`@flighthq/geometry`. Alias-safe (`out` may equal an input). These close the central multi-monitor pain point — physical↔logical pixel math — that today every consumer must reimplement.
- **Point/rect → screen lookup (pure, derivable from `getScreens`).** Add `getScreenNearestPoint(point, out): ScreenInfo` (Electron `getDisplayNearestPoint`) and `getScreenNearestRect(rect, out): ScreenInfo` (Electron `getDisplayMatching` — largest-overlap, falling back to nearest). The most-used query after enumeration ("which monitor is this window/cursor on"). Implemented in `@flighthq/screen` over `getScreens`; no backend method needed.
- **Cursor position (new backend method).** Add `getScreenCursorPosition(out: Vector2): Vector2` backed by `ScreenBackend.getCursorPosition(out)` (Electron `getCursorScreenPoint`). Web default: track the last pointermove in virtual-desktop coords (or `''`/zero sentinel before the first event); native: OS query. Reported in the same virtual-desktop space as `ScreenInfo` bounds, so it composes with `getScreenNearestPoint`.
- **`getScreenById(id, out): ScreenInfo | null`** convenience over `getScreens` — sentinel `null` when no screen matches. Cheap, fills the obvious lookup-by-id gap.
- **Tests**: extend `screen.test.ts` for all four converters (distinct-out and aliased-out cases per project rule), `getScreenNearestPoint`/`getScreenNearestRect` (inside-one, between-two, overlap-tiebreak), `getScreenCursorPosition` (registered backend + web-before-first-event sentinel), `getScreenById` (hit + miss `null`).

### Silver

Competitive and solid — matches a good display library (Electron `screen`, Tauri monitor API, SDL3 display API): richer change events that say _what_ changed, and the descriptive `ScreenInfo` fields web can populate plus the seam for the rest.

- **Change events carry data.** Replace the bare `onScreenChange(listener: () => void)` with a payload: define `ScreenChangeEvent` and a `ScreenChangeKind` string identifier (`'ScreenAdded' | 'ScreenRemoved' | 'ScreenMetricsChanged'`) in `@flighthq/types`; the event carries the affected `ScreenInfo` and, for metrics-changed, a changed-metrics set (`'bounds' | 'workArea' | 'scaleFactor' | 'rotation'`). `onScreenChange(listener: (event: Readonly<ScreenChangeEvent>) => void)`. Web default diffs a cached enumeration on `resize`/`orientationchange` to synthesize the kind; native hosts deliver real add/remove/metrics events. This removes the manual re-enumerate-and-diff every consumer does today.
- **Rotation / orientation as data.** Add `rotation: number` (0/90/180/270 degrees) and `orientation` (a `ScreenOrientation` string identifier: `'Portrait' | 'PortraitFlipped' | 'Landscape' | 'LandscapeFlipped'`) to `ScreenInfo`. Web populates from `screen.orientation.angle`/`.type`; the backend already listens to orientation change.
- **Refresh rate.** Add `refreshRate: number` (Hz, `-1` sentinel) to `ScreenInfo` (SDL `SDL_DisplayMode`, browser `ScreenDetailed.refreshRate` behind Window Management). Relevant for an SDK choosing present cadence. Web: best-effort from `ScreenDetailed` when permission granted, else `-1`.
- **Color descriptors.** Add `colorDepth: number` (bits, web `screen.colorDepth`) and `pixelDepth: number` to `ScreenInfo`. Cheap, universally web-available.
- **Native pixel size.** Add `physicalWidth`/`physicalHeight` (native/pre-scale resolution; web derives as `width * scaleFactor` as a fallback) so consumers can distinguish logical bounds from device resolution. Document the web fallback vs native-real distinction in the type comment.
- **Stable id contract.** Document `ScreenInfo.id` as an opaque, reconfiguration-stable identifier (Electron's model). Web returns `0` for its single screen; native hosts must mint stable ids. Add the contract to `Screen.ts` so native backends conform.
- **Window Management permission seam (web).** Add `getScreenDetailPermission(): 'granted' | 'denied' | 'prompt'` (or sentinel) and an opt-in `requestScreenDetails(): Promise<boolean>` so the web backend can upgrade from the single-`window.screen` view to the multi-monitor `Screen Details` API when the user grants it. Without the grant, web still returns the one logical screen (current behavior). This is what makes the web backend genuinely multi-monitor instead of single-screen.
- **Backend completeness test.** An `exports:check`-covered test asserting every `ScreenBackend` method has a web default and a documented sentinel path (no `window`, no `screen`, permission denied).

### Gold

Authoritative / AAA — the canonical display reference: exhaustive descriptors, display-mode enumeration, HDR/color-space, full edge-case handling, signals for multi-listener change, and 1:1 Rust parity with conformance tests.

- **Display-mode enumeration.** Add `ScreenMode` to `@flighthq/types` (`width`, `height`, `refreshRate`, `colorDepth`, `pixelFormat`) and `getScreenModes(screen, out: ScreenMode[]): ScreenMode[]` + `createScreenMode()` allocator + `ScreenBackend.getModes`. SDL's entire display API is built around mode lists; native hosts enumerate, web returns the single current mode. Add `getScreenCurrentMode(screen, out)` and (where the host permits) `getScreenNativeMode`.
- **HDR / color space.** Add `isHdr: boolean`, `colorSpace: string` (`'srgb' | 'display-p3' | 'rec2020'` …), `depthPerComponent: number`, and `maxLuminance: number` to `ScreenInfo`. Web: `matchMedia('(dynamic-range: high)')`, `(color-gamut: p3)`; native: real descriptors. Increasingly canonical for a graphics SDK.
- **Full descriptor set to match the union of competitors.** Add `label: string` (human monitor name, Electron `Display.label`), `internal: boolean` (built-in vs external), `touchSupport` (`'available' | 'unavailable' | 'unknown'`), `monochrome: boolean`, `accelerometerSupport`, and `dpi: number` (physical DPI, distinct from `scaleFactor`). Populate what web can; native fills the rest. Sentinels (`''`/`false`/`-1`) where unavailable.
- **Geometry-rect accessors (deliberate, additive).** Keep the flat fields (C/C++-portable) but add `getScreenBounds(screen, out: Rectangle)` and `getScreenWorkArea(screen, out: Rectangle)` so converters and `getScreenNearestRect` compose cleanly with `@flighthq/geometry`. A deliberate decision, not drift — flat fields stay authoritative, rects are derived views.
- **Signals group for change events (multi-listener / priority).** Add `enableScreenSignals()` exposing a `screenAddedSignal` / `screenRemovedSignal` / `screenMetricsChangedSignal` group via `@flighthq/signals` for consumers that need priority/cancellation/multi-listener, layered over the direct `onScreenChange` callback. Opt-in per the platform-suite convention; the cost is only paid when enabled.
- **Cursor as full screen-point.** Promote cursor position to also report the containing screen: `getScreenCursorScreen(out: ScreenInfo)` (cursor's current monitor) layered over `getScreenCursorPosition` + `getScreenNearestPoint`.
- **Performance + hot-path guarantees.** Document and test that all `get*(out)` reads are allocation-free in steady state (backend caches the enumeration, re-fills `out`); `getScreens` reuses array slots (already does) and never shrinks-then-grows. Add `refreshScreens()` to invalidate the cache after a known reconfiguration.
- **Full edge-case + error handling.** Every backend method returns a documented sentinel on every failure mode (no `window`, no `screen`, SSR/no-DOM, permission denied, zero displays). A test matrix exercises each; no throws except genuine API misuse.
- **1:1 Rust parity.** `flighthq-screen` mirrors the final type surface as value types: `ScreenInfo`, `ScreenMode`, `ScreenChangeEvent`, `ScreenChangeKind`, `ScreenOrientation`; `ScreenBackend` trait + `set_screen_backend`; a `native`-feature default backend over winit/SDL display enumeration; `get_screens(&mut out)`, `get_primary_screen(&mut out)`, the converters (`screen_to_dip_point` …), `get_screen_nearest_point`/`get_screen_nearest_rect`, `get_screen_cursor_position`, `get_screen_modes`. Register the value-typed converters/lookups as **mixable** leaves in the conformance map and add a parity cell so Rust↔TS converter/lookup math is fingerprint-compared. The live enumeration/events stay host-coupled (all-or-nothing).
- **Docs**: a package doc enumerating every `ScreenInfo` field, its unit, its sentinel, its web vs native source, and the change-event semantics — the canonical reference the verdict asks for.

## Sequencing & effort

Recommended order (cumulative; the Bronze pure-logic items have zero host dependency and should land first since they close the highest-value gaps immediately):

1. **Bronze (small, ~1 day).** Converters and nearest-point/rect are pure functions over existing fields — write them and their alias-safe tests first; they need no type-seam change and no backend change. Then `getScreenCursorPosition` (the one new backend method) and `getScreenById`. Land, run `npm run check` + `npm run api screen` + `npm run exports:check`.
2. **Silver (medium, ~2–3 days).** Do the change-event payload upgrade first (it is the biggest behavioral improvement and reshapes `ScreenBackend.subscribe`/`onScreenChange` — get it done before the descriptive fields pile on). Then the web-populatable fields (`rotation`/`orientation`, `colorDepth`, `physicalWidth/Height`). `refreshRate` and the Window Management permission seam are the browser-fiddly items — budget extra; they unlock real multi-monitor on web.
3. **Gold (large, ongoing).** Display-mode enumeration and HDR/color-space are mostly native-host work — define the type seam now, but the payload only becomes real when a native host exists. The signals group and rect accessors are TS-local and can land any time after Silver. Rust parity should track the _final_ TS shape — do it after the type surface stabilizes, not mid-flux.

**Cross-package / design-decision items to surface (do not decide autonomously):**

- **Geometry types vs flat fields.** Converters and nearest-rect want `Vector2`/`Rectangle`. Confirm `@flighthq/screen` may depend on `@flighthq/geometry`/`@flighthq/types` for these (it already depends on `@flighthq/types`). Recommend keeping `ScreenInfo` flat (C/C++-portable) and exposing rects as _derived_ `getScreenBounds`/`getScreenWorkArea` views (Gold) rather than nesting `bounds`/`workArea` into the entity — a deliberate ruling worth a one-line note in the Package Map.
- **`ScreenInfo.id` stable-id contract.** The numeric web id is always `0`; native hosts need a reconfiguration-stable opaque id. Decide and document the contract (numeric vs string) in `Screen.ts` before any native host conforms — this is a seam decision, not an implementation detail.
- **Window Management API permission + storage.** Multi-monitor on web requires the `window-management` permission and (`requestScreenDetails`) a user gesture; this is async and stateful. Confirm whether `@flighthq/screen` owns the permission seam directly or delegates to a shared permission helper, and whether the granted state persists (would touch `@flighthq/storage`).
- **Cursor-position ownership vs `@flighthq/input`/`@flighthq/interaction`.** Cursor position is also tracked by the input/pointer subsystem. Confirm `getScreenCursorPosition` (virtual-desktop coords, OS-level) is the screen module's concern (Electron groups it here) and does not duplicate/conflict with `@flighthq/input`'s pointer state. Default: screen owns the OS-level virtual-desktop cursor; input owns in-window pointer events.
- **Display metrics overlap with `@flighthq/device`.** `@flighthq/device`'s roadmap proposes `getDeviceDisplayMetrics` (static built-in-display characteristics). Confirm the boundary: device = the built-in display's static class data; screen = live multi-display enumeration + geometry + events. Needs the same one-line Package Map ruling noted in `device.md`.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/screen` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
