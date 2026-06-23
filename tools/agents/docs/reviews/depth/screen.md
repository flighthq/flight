# Depth Review: @flighthq/screen

**Domain**: Display / monitor enumeration — querying attached screens (geometry, work area, scale/DPI, primary detection) and reacting to display configuration changes, over a swappable web/native backend seam.

**Verdict**: partial — 55/100

The package is a clean, correct, well-shaped implementation of the _core_ of a screen-enumeration capability, but it stops at the minimal viable surface. It covers the four headline features in its own description (geometry, work area, scale factor, primary detection) plus a change subscription, and nothing beyond. Measured against what Electron's `screen` module, Tauri's monitor API, SDL's display API, or the browser's `Screen`/`Screen Details` APIs expose, several canonical capabilities are absent. It is more than a stub (the backend seam, the change event, and the out-parameter discipline are real and complete for what they model), but it is not the exhaustive, authoritative screen library the project's AAA bar calls for.

## Present capabilities

- `ScreenInfo` entity: `id`, `x`, `y`, `width`, `height`, `workWidth`, `workHeight`, `scaleFactor`, `isPrimary`. Covers bounds in virtual-desktop coordinates, work area (chrome-excluded), DPI ratio, and primary flag.
- `createScreenInfo()` — allocates a zeroed/defaulted `ScreenInfo` for use as an `out` slot. Correct allocation discipline (`scaleFactor` defaults to 1, `isPrimary` false).
- `getScreens(out)` — enumerate all attached displays into a caller-owned array, setting `out.length`. Hot-path-allocation-free.
- `getPrimaryScreen(out)` — fill the OS-designated primary into a caller-owned object.
- `onScreenChange(listener)` — subscribe to display/work-area/orientation changes; returns an unsubscribe. The web backend wires `window resize` + `screen.orientation change`.
- `createWebScreenBackend()` — default web backend over `window.screen`/`devicePixelRatio`, jsdom-safe (zero-fills, no throws).
- `getScreenBackend()` / `setScreenBackend()` — the standard platform-suite backend seam with a lazily-created web default and native-host override.

The backend-seam shape, jsdom guards, out-parameter alias-safety, sentinel-over-throw behavior, and tree-shakable side-effect-free module structure all match the project's platform-suite conventions exactly. For the subset of the domain it models, it is genuinely complete and idiomatic.

## Gaps vs an authoritative screen / display library

Canonical capabilities a mature display library (Electron `screen`, Tauri, SDL3, browser Window Management API) provides that are missing here:

- **Coordinate-space conversion.** No `screenToDipPoint` / `dipToScreenPoint` / `screenToDipRect` / `dipToScreenRect`. Electron's `screen` exposes exactly these because DPI-scaled vs physical pixel conversion is the central pain point of multi-monitor work. With only a `scaleFactor` field and no converters, every consumer must reimplement the math.
- **Point/rect → screen lookup.** No `getScreenNearestPoint(point, out)` or `getScreenNearestRect(rect, out)` (Electron's `getDisplayNearestPoint` / `getDisplayMatching`). This is the standard way to find "which monitor is this window/cursor on," and it is the most-used query after enumeration.
- **Cursor position.** No `getScreenCursorPosition` (Electron `getCursorScreenPoint`). Commonly grouped with the screen module since cursor position is reported in virtual-desktop coordinates.
- **Display add/remove events as data.** `onScreenChange` is a bare zero-arg notification. Authoritative libraries distinguish `display-added` / `display-removed` / `display-metrics-changed` and pass the affected `ScreenInfo` plus the changed-metrics set. As written, a consumer must re-enumerate and diff manually to learn _what_ changed.
- **Rotation / orientation as data.** The web backend listens to `orientation change` but `ScreenInfo` carries no `rotation` (0/90/180/270) or `orientation` (portrait/landscape) field. SDL, Electron, and the browser all surface this.
- **Refresh rate.** No `refreshRate` / `frequency` field (SDL `SDL_DisplayMode`, browser `ScreenDetailed`). Relevant for a graphics SDK choosing a present cadence.
- **Color / HDR descriptors.** No `colorDepth` / `colorSpace` / `isHDR` / `depthPerComponent`. Electron's `Display` and SDL expose color depth; HDR awareness is increasingly canonical.
- **Display modes / native resolution.** No notion of available `DisplayMode`s or the physical (native, pre-scale) pixel size vs the logical size. SDL's whole display API is built around mode enumeration; Electron exposes `size` vs `workArea` but also `internal`, `touchSupport`, `monochrome`, `accelerometerSupport`, `label`.
- **Human-readable label / internal flag.** No `label` (monitor name) or `internal` (built-in vs external) on `ScreenInfo` — both standard in Electron's `Display`.
- **Touch / accessibility hints.** No `touchSupport` or `accessibilityActive`-style fields the platform layer would benefit from.

Some of these (HDR, color space, native display-mode lists) are arguably beyond a thin web default and are reasonably _backend-dependent_, but the **type seam** (`ScreenInfo`) should still carry the fields so a native host can populate them — defining them in `@flighthq/types` is the design surface per project rules. The coordinate converters, nearest-point/rect lookup, cursor position, and richer change events are pure-omission gaps, not missing-by-design: they need no host capability the seam lacks (they are derivable from enumerated data) and are the most-used parts of every comparable library.

## Naming / API-shape notes

- Naming is consistent and self-identifying: every function carries the full `Screen` type word (`getPrimaryScreen`, `createScreenInfo`, `getScreenBackend`), matching the design rule. Good.
- The `getScreens` / `getPrimaryScreen` out-parameter pair is correct and alias-safe, and returning the same `out` for chaining matches the convention.
- `onScreenChange` follows the platform-suite event-capability shape (`on*(listener): () => void`) — consistent, but the zero-payload signature is the weak point noted above; an authoritative version would pass change details.
- `ScreenInfo` uses `width`/`height`/`workWidth`/`workHeight` flat fields rather than nested `bounds`/`workArea` rects. This is fine and arguably more C/C++-portable, but it forgoes reuse of `@flighthq/geometry` `Rectangle` and the converters that would pair naturally with it. Worth a deliberate decision rather than drift.
- The `id` field is a `number`; Electron uses an opaque display id that survives reconfiguration. The numeric web id is always 0, which is fine for one screen but means native backends must define a stable-id contract that isn't documented in the type.

## Recommendation

Treat this as a correct foundation that needs to grow to the AAA bar, not a finished capability. Concretely, within scope:

1. Add coordinate converters: `screenToDipPoint`/`dipToScreenPoint`/`screenToDipRect`/`dipToScreenRect` (pure functions over `ScreenInfo.scaleFactor` + origin).
2. Add `getScreenNearestPoint(point, out)` and `getScreenNearestRect(rect, out)` (derivable from `getScreens`, no host dependency).
3. Add `getScreenCursorPosition(out)` to the backend seam (web: pointer-tracked; native: OS query).
4. Enrich `ScreenInfo` in `@flighthq/types` with `rotation`/`orientation`, `refreshRate`, `colorDepth`, `label`, `internal`, and physical/native size — populate what the web backend can, leave the rest for native hosts to fill.
5. Upgrade the change event to carry which display changed and which metrics, distinguishing add/remove/metrics-changed.

Items 1-3 are pure logic with no new host capability and should land first; they close the highest-value gaps. Item 4 is a type-seam expansion (header-first per project rules). The current state is a solid, idiomatic core but reads as ~half of an authoritative screen library.
