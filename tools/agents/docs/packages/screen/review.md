---
package: '@flighthq/screen'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/screen.md
  - reviews/maturation/depth/screen.md
  - source
---

# Review: @flighthq/screen

## Verdict

solid — 90/100. The package went from the prior depth review's 55/100 "correct core, minimal surface" to a near-authoritative display-enumeration library in a single builder pass (`builder-67dc46d64`). The base had 7 exported functions over a 9-field `ScreenInfo`; head has 31 over a 25-field `ScreenInfo`, with coordinate converters, point/rect→screen lookup, cursor queries, a real change-event payload, a multi-monitor Screen Details upgrade path, display-mode enumeration, an opt-in signals group, and a mirrored Rust crate. The maturation roadmap's Bronze + Silver are fully landed and most of Gold; what holds it short of `authoritative` is a handful of fields that are declared-but-never-populated, one documented late-subscribe event bug, an unverified Rust compile, and two genuinely-native capabilities (real mode lists, stable ids) that only a host can fill.

The status doc's claims were verified against the diff and the realized `dist/*.d.ts`. They hold: 31 exported functions (status says "30"; the count omits the async `requestScreenDetails`/`getScreenDetailPermission` framing but the surface matches), 25-field `ScreenInfo`, 57 tests with one `describe` per export, alphabetized and mirroring source.

## Present capabilities

Grounded in `67dc46d64:packages/screen/src/screen.ts` and `67dc46d64:packages/types/src/Screen.ts`:

- **Enumeration & backend seam.** `getScreens(out)`, `getPrimaryScreen(out)` delegate to the active `ScreenBackend`; `getScreenBackend()` lazily creates the web default, `setScreenBackend(backend|null)` installs/clears a native host, `createWebScreenBackend()` builds the web backend. Standard platform-suite command shape, side-effect-free, jsdom/SSR-guarded (every read zero-fills via `fillDefaultScreenInfo` when `window`/`screen` are absent).
- **Coordinate converters** (pure, alias-safe, read-inputs-into-locals-first): `screenToDipPoint`, `dipToScreenPoint`, `screenToDipRect`, `dipToScreenRect` over `scaleFactor` + origin.
- **Point/rect → screen lookup** (pure, over `getScreens`): `getScreenNearestPoint` (contains-or-nearest-by-center), `getScreenContainingRect` (largest-overlap, nearest-center fallback), `getScreenNearestRect`, `getScreenById(id, out): ScreenInfo | null` (sentinel `null` on miss).
- **Cursor queries:** `getScreenCursorPosition(out)` over the backend's `getCursorPosition` (web tracks `pointermove`); `getScreenCursorScreen(out)` composes cursor + `getScreenNearestPoint`.
- **Geometry-rect accessors** (derived views over flat fields, as the roadmap prescribed — flat fields stay authoritative): `getScreenBounds`, `getScreenWorkArea`.
- **Display modes:** `ScreenMode` type, `createScreenMode()` allocator, `getScreenModes(screen, out)` (backend enumerate or synthetic single-mode fallback), `getScreenCurrentMode(screen, out)`.
- **Change events as data:** `onScreenChange(listener: (event: Readonly<ScreenChangeEvent>) => void)`. The web backend diffs a cached `ScreenInfo` snapshot on `resize`/`orientationchange` (single-monitor) or `screenschange` (multi-monitor) and synthesizes `ScreenAdded`/`ScreenRemoved`/`ScreenMetricsChanged` with a `ScreenChangedMetrics` set (`bounds`/`workArea`/`scaleFactor`/`orientation`). `diffScreenInfo` is the shared diff.
- **Signals group** (opt-in, multi-listener): `enableScreenSignals`/`createScreenSignals`/`attachScreenSignals`/`detachScreenSignals`/`disposeScreenSignals`, fanning the backend subscription into `onScreenAdded`/`onScreenMetricsChanged`/`onScreenRemoved`. `attach` is idempotent (tears down first); `dispose` correctly delegates to `detach` (release-to-GC, the right verb here — nothing non-GC to free).
- **Web multi-monitor:** `requestScreenDetails()` calls `window.getScreenDetails()` and upgrades the live backend in place via an internal `_upgrade` hook; `getScreenDetailPermission()` queries the `window-management` permission (sentinel `'prompt'` when the Permissions API is absent). After upgrade, `getScreens` enumerates `ScreenDetails.screens`, populating `label`, `internal`, `refreshRate`, and per-screen offsets.
- **Rich `ScreenInfo`** (25 fields): bounds, work area, `scaleFactor`, `isPrimary`, `rotation`, `orientation`, `refreshRate`, `colorDepth`, `pixelDepth`, `physicalWidth/Height`, `isHdr`, `colorSpace`, `maxLuminance`, `depthPerComponent`, `dpi`, `label`, `internal`, `touchSupport`, `monochrome`. Every field carries a sentinel + unit in the `Screen.ts` comment block. Web populates orientation/rotation/colorDepth/colorSpace/isHdr/physical from `window.screen` + `matchMedia`; the rest sentinel out for a native host.
- **`refreshScreens()`** cache-invalidation hook (no-op for the re-reading web backend; documented for caching native hosts).
- **Rust mirror:** `flighthq-screen` + `flighthq-types/src/platform.rs` add the matching enums (`ScreenOrientation`, `ScreenColorSpace`, `ScreenTouchSupport`, `ScreenChangeKind`), `ScreenChangedMetrics`/`ScreenMode`/`ScreenChangeEvent` structs, a 25-field `ScreenInfo`, the updated `ScreenBackend` trait (`subscribe(Box<dyn Fn(&ScreenChangeEvent)...>)`, required `get_cursor_position`, optional `get_modes`), 24 functions in `screen.rs`, and an updated `WinitScreenBackend`. Converter out-params use `[f32; 2]`/`[f32; 4]` to avoid a `flighthq-geometry` dependency.

Naming is fully self-identifying (every function carries the `Screen` type word), exports are alphabetized, no top-level side effects, `sideEffects: false`, single root `.` export. Tests cover all 31 exports including aliased-out cases for the converters and the multi-monitor `_upgrade`/`requestScreenDetails` resolve+reject paths.

## Gaps vs an authoritative display library

- **Declared-but-never-populated fields.** `monochrome` is `false` everywhere (never read from `matchMedia('(monochrome)')`, which the web _can_ answer). `maxLuminance`, `depthPerComponent`, and `dpi` are always `-1` even on web — `dpi` is derivable (`96 * devicePixelRatio` is the conventional web approximation), and `depthPerComponent` is inferable from `colorDepth`. These read as type-seam-ready-for-native, but several have a cheap web population the pass left on the table.
- **`getScreenNearestRect` is a pure alias for `getScreenContainingRect`** — same body, two exported names. Electron has both `getDisplayMatching` (overlap) and `getDisplayNearestPoint`; here the two rect functions are identical, so one name is redundant surface. Worth a deliberate keep-or-collapse ruling (the charter is silent).
- **Late-subscribe + upgrade event bug (documented).** `subscribe` captures `const detailsRef = _screenDetails` at subscription time (`screen.ts:331`). A consumer that calls `onScreenChange` _before_ `requestScreenDetails()` will never receive `screenschange` events from the post-upgrade `ScreenDetails` object — only `resize`/`orientationchange`. Status flags this; it is a real ordering hazard, not just a doc note.
- **No `getScreenDetailPermission` watch.** The permission read is a one-shot; there is no `PermissionStatus.onchange`-backed variant to react to a later grant/revoke. Status lists this as the gap to 95+.
- **Real display-mode enumeration is web-synthetic only.** `getScreenModes` returns the single current mode on web (correct — the web cannot enumerate), but there is no `getScreenNativeMode` and no native host yet exercises a real mode list. Type seam is ready; payload awaits a host.
- **Stable-id contract is convention-only.** `ScreenInfo.id` is `0` (single web) or array index (multi-monitor web); the comment documents it as "reconfiguration-stable" but the web path cannot honor that across hot-plug. Only a native host can mint a truly stable id, and no test asserts the contract.
- **Rust compile unverified.** The status doc is explicit: cargo was unavailable in the builder sandbox, so the Rust changes are structurally consistent but not compiled. This is the single largest confidence gap in the Rust-parity claim.

## Charter contradictions

None — the charter (`charter.md`) is a stub: `What it is` is seeded from the depth review, and `North star`, `Boundaries`, `Decisions`, and `Open directions` are all `TODO`. There is no stated principle, boundary, or decision for the code to contradict. Every judgement above falls back to the codebase-map AAA standard per the rubric rule, and the silences are surfaced under _Candidate open directions_ below.

## Contract & docs fit

**Lives up to the contract — strongly.** Types-first (`Screen.ts` + `ScreenSignals.ts` in `@flighthq/types`, implemented against), full unabbreviated names, `out`-params with documented alias-safety, sentinels (`null`/`-1`/`''`/`'unknown'`) over throws, single root `.` export, `sideEffects: false`, no top-level mutable state (`_backend`/`_signalSubscriptions`/`_scratchPoint` are module-bottom and lazily initialized), and a `flighthq-screen` crate mirror. The `dispose`/`detach` verb split is correct. The signals group follows the opt-in `enable*` platform-suite pattern exactly.

**One convention-fit note to verify (not a violation):** `ScreenSignals` types its signals as `Signal<(screen: Readonly<ScreenInfo>) => void>` (parameterized by a _function type_) in `@flighthq/types/src/ScreenSignals.ts`. The Rust port's locked decision is `Signal<T>` parameterized by _payload_ (`flighthq-types` re-export). The TS `Signal<Fn>` shape matches the existing TS signals convention, so this is consistent within TS — but it is the seam where TS-signal-shape and Rust-signal-shape visibly diverge, and the Rust mirror will not be a literal transcription here. Worth a one-line note in the conformance/divergence map rather than a fix.

**Structural forks (`structural-forks.md`).** No contract-fit drift:

- _Fork B (closed union vs registry):_ the only `kind` dispatch is `attachScreenSignals`'s 3-way `if/else` over `ScreenChangeKind` — signal fan-out, not a hot loop, and a fixed closed system (the 3 change kinds are exhaustive by nature). No registry pressure.
- _Fork C (hot function bundling features):_ none. The web backend's `buildScreenInfoFromDetailed`/`buildCurrentScreenInfo` are two parallel populators, not one config-gated mega-function; the `subscribe` diff is O(screens), allocation-light. No within-unit smell.
- _Fork D (backend seam):_ textbook — `ScreenBackend` trait in types, web default, `setScreenBackend` for native. The `_upgrade` hook is an in-place mutation of the _same_ backend object rather than a swap, deliberately so a held reference stays valid; it is internal (not on the trait) and native backends simply lack it.
- _Mixing (fork D axis 2):_ the converters/lookups are value-typed leaves and the roadmap already flags them as mixable; live enumeration/events are correctly all-or-nothing.

**Candidate doc revisions.** The Package Map line for `@flighthq/screen` still reads "display enumeration, work area, scale factor" — accurate for the base, but the package now also owns coordinate conversion, cursor queries, change events, display modes, and a signals group. The line understates the realized scope and is a candidate for a one-line expansion. The depth and maturation reviews under `reviews/` are now superseded by this cell and are migration candidates per `index.md`.

## Candidate open directions

The charter is a stub; each item below is something this review had to assume against the AAA fallback and should feed the charter's _Open directions_ for the user to settle:

1. **North star / bar.** Is the target the union of Electron `screen` + Tauri + SDL3 + browser Window Management (the implicit bar this pass built toward), or a deliberately thinner web-first surface? This decides whether the native-only fields are obligations or aspirations.
2. **Cheap web-populatable fields.** Should `monochrome`, `dpi`, and `depthPerComponent` be populated on web where derivable, or intentionally left sentinel until a native host? (Boundary question: "what does the web backend promise to fill.")
3. **`getScreenNearestRect` vs `getScreenContainingRect` redundancy.** Keep both names as intent-revealing aliases, give them distinct semantics (e.g. nearest-rect = center-distance, containing = overlap), or collapse to one?
4. **Late-subscribe + upgrade ordering.** Bless "call `requestScreenDetails` before subscribing" as a usage rule, or fix `subscribe` to re-bind on `_upgrade` (status's options a/b/c)? This is a behavior decision, not a sweep-safe cleanup.
5. **Stable-id contract.** Numeric vs string, and what guarantee a native host must honor across hot-plug — a seam decision that must precede the first conforming native backend.
6. **Cross-package boundaries** (raised by the maturation roadmap, undecided): cursor-position ownership vs `@flighthq/input`/`@flighthq/interaction`; display-metrics overlap with `@flighthq/device` (`getDeviceDisplayMetrics`); whether the Window Management granted state persists via `@flighthq/storage`. Each wants a one-line Package Map ruling.
7. **Rust compile verification.** Not a design question but a standing follow-up: `cargo build -p flighthq-screen -p flighthq-host-winit` must be run in a Rust-capable environment before the parity claim is trusted.
