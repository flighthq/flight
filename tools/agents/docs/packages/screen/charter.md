---
package: '@flighthq/screen'
crate: flighthq-screen
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# screen — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Display / monitor enumeration and the seam for reacting to display-configuration changes. The package answers "what screens are attached, where are they, and how are they configured" — per-screen geometry (bounds, work area), scale/DPI, primary detection, orientation/rotation, color/HDR metrics, refresh rate, and display modes — plus the coordinate converters and point/rect→screen lookups that build on that geometry, cursor-position queries, and a change-event stream (callback and opt-in signals). It runs over a swappable `ScreenBackend`: a lazily-created web default (window/screen + matchMedia + the Window Management API for multi-monitor) that a native host (Electron, Tauri, SDL3, winit) replaces via `setScreenBackend`.

Where it ends vs neighbors: `screen` owns _display_ identity and metrics; `@flighthq/device` owns _device/OS_ identity (and has its own display-metrics surface — the overlap is an open boundary question). `@flighthq/application`/`@flighthq/host-*` own _windows_ (a window lives on a screen, but window control is not here). Cursor _position_ is read here as a screen-relative query; raw pointer _input_ belongs to `@flighthq/input`/`@flighthq/interaction` — another open boundary.

## North star (proposed)

_Durable principles inferred from the design and the SDK-wide forks — proposed, not blessed._

- **Types-first, data-out, value-typed leaves.** `ScreenInfo`, `ScreenMode`, and `ScreenChangeEvent` are flat data defined in `@flighthq/types` and implemented against. Flat fields stay authoritative; rect/geometry accessors (`getScreenBounds`, `getScreenWorkArea`) and the coordinate converters are derived views, not parallel state. The pure converters and point/rect→screen lookups are value-in/value-out leaves with documented alias-safety.
- **One backend seam, sentinels not throws.** A single `ScreenBackend` trait (fork D): a guarded web default that zero-fills when `window`/`screen` are absent (jsdom/SSR-safe) and returns sentinels (`null`/`-1`/`''`/`'unknown'`/`'prompt'`) when a capability is unavailable, with native hosts swapped in via `setScreenBackend`. Side-effect-free import, `sideEffects: false`, single root `.` export, no top-level mutable state.
- **Change as explicit data, signals opt-in.** Configuration changes surface as a `ScreenChangeEvent` payload through a flat `onScreenChange` callback, with the multi-listener `enable*`/`create*`/`attach*`/`detach*`/`dispose*` signals group as an opt-in cost (the platform-suite event pattern). `dispose` releases-to-GC; nothing here is a `destroy`.
- **1:1 Rust conformance.** A `flighthq-screen` crate mirrors the TS surface (matching enums, structs, `ScreenBackend` trait, converters using `[f32; N]` to avoid a geometry dep), so the port stays a drop-in.

## Boundaries (proposed)

_Proposed in-scope / non-goals — drawn from the review and neighbors._

In scope:

- Screen enumeration, primary detection, and per-screen metrics (geometry, work area, scale/DPI, orientation/rotation, color depth/space, HDR, refresh rate, physical size, touch support).
- Coordinate conversion (screen↔DIP point/rect) and spatial lookup (nearest/containing screen for a point or rect).
- Cursor-position queries expressed against screens.
- Display-mode enumeration and current-mode reporting.
- Change detection as data (callback + opt-in signals) over single- and multi-monitor web paths and the Window Management permission flow.

Non-goals (proposed):

- Window creation / control / positioning — `@flighthq/application` + `@flighthq/host-*`.
- Device/OS identity — `@flighthq/device`.
- Raw pointer input and hit-testing — `@flighthq/input` / `@flighthq/interaction`.
- Rendering of anything; `screen` is a query/eventing capability, not a render package.
- Concrete native host adapters live in `host-*`, not here (this package defines the seam and ships only the web default).

## Decisions

None blessed yet.

## Open directions

_Every candidate question from the review, plus the structural forks that touch this package. These need your settling; an agent should ask, not assume._

1. **North star / the bar.** Is the target the union of Electron `screen` + Tauri + SDL3 + browser Window Management (the implicit bar this builder pass built toward), or a deliberately thinner web-first surface? This decides whether the native-only fields are obligations or aspirations. (Relates to fork F: is any thinness here intentional-minimal or under-built?)
2. **Cheap web-populatable fields.** Several declared fields sentinel out even though the web can answer them: `monochrome` (`matchMedia('(monochrome)')`), `dpi` (`96 * devicePixelRatio`), `depthPerComponent` (inferable from `colorDepth`). Populate on web where derivable, or intentionally leave sentinel until a native host fills them? This is the "what does the web backend promise to fill" boundary question.
3. **`getScreenNearestRect` vs `getScreenContainingRect` redundancy.** They share one body (both overlap-largest, nearest-center fallback) — two names, identical semantics. Keep both as intent-revealing aliases, give them distinct semantics (e.g. nearest-rect = center-distance, containing = overlap, mirroring Electron's `getDisplayNearestPoint` vs `getDisplayMatching`), or collapse to one?
4. **Late-subscribe + upgrade ordering bug.** `subscribe` captures `_screenDetails` at subscription time, so a consumer that calls `onScreenChange` before `requestScreenDetails()` never receives post-upgrade `screenschange` events. Bless "call `requestScreenDetails` before subscribing" as a documented usage rule, or fix `subscribe` to re-bind on `_upgrade`? A behavior decision, not a sweep-safe cleanup.
5. **`getScreenDetailPermission` watch.** The permission read is one-shot; there is no `PermissionStatus.onchange`-backed variant to react to a later grant/revoke. Add a watch, or leave it one-shot?
6. **Real display-mode enumeration.** `getScreenModes` returns a synthetic single current mode on web (correct — the web cannot enumerate). Is a `getScreenNativeMode` (or a real native mode-list contract) part of the charter, and what must the first native backend honor?
7. **Stable-id contract.** `ScreenInfo.id` is `0` / array-index on web and documented as "reconfiguration-stable," but the web path cannot honor that across hot-plug. Numeric vs string, and what stability guarantee must a native host honor across hot-plug? A seam decision that must precede the first conforming native backend; no test asserts the contract today.
8. **Cross-package boundaries (each wants a one-line Package Map ruling).**
   - Cursor-position ownership vs `@flighthq/input` / `@flighthq/interaction`.
   - Display-metrics overlap with `@flighthq/device` (`getDeviceDisplayMetrics`) — who owns what.
   - Whether the Window Management granted state persists via `@flighthq/storage`. (Fork A — where source/query data lives vs participation in another package's domain.)
9. **TS↔Rust signal-shape divergence (note, likely not a fix).** `ScreenSignals` types signals as `Signal<(screen) => void>` (parameterized by a function type), matching the TS signals convention; the Rust port's locked decision is `Signal<T>` parameterized by _payload_. The Rust mirror will not be a literal transcription here. Likely a one-line entry in the conformance/divergence map rather than a code change — confirm.
10. **Rust compile verification (standing follow-up, not a design question).** `cargo build -p flighthq-screen -p flighthq-host-winit` must be run in a Rust-capable environment before the parity claim is trusted; the builder sandbox had no cargo.
11. **Package Map line is understated.** The map still reads "display enumeration, work area, scale factor," but the package now also owns coordinate conversion, cursor queries, change events, display modes, and a signals group — a candidate one-line expansion.

### Structural forks touching this package

- **Fork D — backend seam (decided, textbook here):** `ScreenBackend` in `@flighthq/types`, web default, `setScreenBackend` for native; the `_upgrade` hook mutates the same backend object in place (so a held reference stays valid) rather than swapping. No drift. Fork D axis-2 (Wasm mixing): the converters/lookups are value-typed mixable leaves; live enumeration/events are correctly all-or-nothing.
- **Fork B — closed union vs registry (no pressure):** the only `kind` dispatch is `attachScreenSignals`'s 3-way branch over `ScreenChangeKind` — a fixed, exhaustive closed system in signal fan-out, not a hot loop. Keep closed unless the change-kind family grows.
- **Fork C — hot function bundling (none found):** the two web populators are parallel, not one config-gated mega-function. No within-unit smell to decompose.
