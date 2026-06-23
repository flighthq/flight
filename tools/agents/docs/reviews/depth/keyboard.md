# Depth Review: @flighthq/keyboard

**Domain**: On-screen (soft) keyboard integration — the platform-integration _event_ capability that reports the soft keyboard's visibility and height, emits show/hide/resize signals, and exposes show/hide requests over a swappable web/native backend. This is explicitly NOT a physical-key input library (per the package map, the type is `SoftKeyboard`, deliberately "avoiding the DOM `Keyboard`"); raw key events belong to `@flighthq/input`.

**Verdict**: solid — 80/100

The domain here is narrow and well-bounded. A mature "soft keyboard" capability in cross-platform UI toolkits (Capacitor `Keyboard`, Cordova ionic-keyboard, React Native `Keyboard`, Flutter `MediaQuery.viewInsets`, Tauri/Electron rarely expose it) consists of: a current snapshot (visible + height), change events (show/hide/resize), and programmatic show/hide where the host permits it. This package covers essentially that entire canonical surface. It is not a stub — it is a near-complete cell for a deliberately small domain. The remaining gap to "authoritative" is a handful of details that mature soft-keyboard APIs do carry (animation timing/easing, keyboard appearance/style and resize-mode controls, accessory bar), most of which are arguably out of scope for the web default but are real native features.

## Present capabilities

Exported surface (12 functions, all colocated-tested in `keyboard.test.ts`):

- `createSoftKeyboard()` / `disposeSoftKeyboard()` — event-entity quartet lifecycle (allocates inert signals; dispose detaches subscription, releases to GC). Matches the event-capability shape mandated by the platform suite.
- `attachSoftKeyboard()` / `detachSoftKeyboard()` — start/stop delivery; attach is idempotent (tears down a prior subscription first), detach is safe when not attached.
- `createSoftKeyboardInfo()` / `getSoftKeyboardInfo(out)` — zeroed `out` allocator + snapshot reader following the `out`-parameter convention.
- `showSoftKeyboard()` / `hideSoftKeyboard()` — command-style toggles (no-op on web, correctly documented).
- `getSoftKeyboardBackend()` / `setSoftKeyboardBackend(null)` / `createWebSoftKeyboardBackend()` — the full backend seam: lazy web default, native override, web factory.
- Signals on the entity: `onShow(height)`, `onHide()`, `onResize(height)` — the canonical three soft-keyboard events.
- Web backend derives height from `window.visualViewport` shrink vs `window.innerHeight`, guards `typeof window === 'undefined'` and absent `visualViewport`, subscribes to both `resize` and `scroll` (the two events that fire on viewport changes on mobile Safari/Chrome). This is the correct, idiomatic web technique.

The show/hide-vs-resize transition logic is correct: `onResize` fires on every change, `onShow`/`onHide` fire only on a visibility edge.

## Gaps vs an authoritative soft-keyboard library

Missing-by-omission (real features in mature native soft-keyboard APIs):

- **Animation timing.** Capacitor/iOS/Android deliver `willShow`/`didShow`/`willHide`/`didHide` plus an animation **duration** and curve so apps can animate content in sync with the keyboard slide. Here there is a single instantaneous `onShow`/`onHide` with no duration/easing, and no will/did distinction. This is the largest gap for a UI keyboard library and is partly serviceable even on web (visualViewport changes are animated).
- **Resize mode.** Native keyboards expose how the app viewport reacts (`body` / `ionic` / `native` / `none` resize, or Android `adjustResize`/`adjustPan`). No `setSoftKeyboardResizeMode` or equivalent.
- **Keyboard appearance / style.** iOS exposes light/dark keyboard appearance (`setKeyboardStyle`). Absent. Reasonably native-only, but a real capability.
- **Accessory bar / scroll-assist toggles.** iOS accessory bar visibility, scroll-assist — common in Capacitor `Keyboard`. Absent.
- **No `width`/safe-area context in the snapshot.** `SoftKeyboardInfo` is `{ visible, height }` only; mature snapshots sometimes include the keyboard frame rect. Height-only is defensible for layout.

Missing-by-design / out-of-scope (correctly excluded):

- Physical key events, key codes, modifier state, IME composition — these are `@flighthq/input`'s domain, not this package. Correct boundary.
- Programmatic show/hide being a web no-op is a platform truth, documented in source, not an omission.

## Naming / API-shape notes

- Naming is on-spec and self-identifying: every function carries the full `SoftKeyboard` type word (`attachSoftKeyboard`, `getSoftKeyboardInfo`, `setSoftKeyboardBackend`), the `Soft` qualifier deliberately disambiguates from the DOM `Keyboard`, and the package is named `keyboard` per the suite while the type is `SoftKeyboard`. Good.
- Conforms exactly to the platform suite's **event-capability** shape: entity of signals + `create*`/`attach*`/`detach*`/`dispose*`, plus the command extras (`show*`/`hide*`, `get*Backend`/`set*Backend`/`createWeb*Backend`). It is one of the cleaner exemplars of that pattern.
- `dispose*` (not `destroy*`) is the right verb — there is no non-GC resource to free, only a subscription to detach.
- `out`-parameter convention honored in `getSoftKeyboardInfo`/`createSoftKeyboardInfo`; module-level scratch + `WeakMap` subscription registry sit correctly at the bottom of the file. `"sideEffects": false` and lazy backend creation respect the no-top-level-side-effects rule.
- One minor shape note: `onShow` and `onResize` both carry `height`, but `onHide` carries none — consistent with "hidden means height 0," though an app that wants the pre-hide height must track it. Acceptable.

## Recommendation

Keep as-is for the current bar; this is a faithful, idiomatic cell for the web-default tier and a clean backend seam for native. To reach **authoritative**, the highest-value additions are animation-aware events — split `onShow`/`onHide` into will/did pairs (or add a duration argument) so apps can sync content animation with the keyboard slide, which is the single feature every mature mobile keyboard API provides and the one most missed here. Secondary, native-only additions worth specifying in `@flighthq/types` for host backends to fill: `setSoftKeyboardResizeMode`, `setSoftKeyboardStyle`, and accessory-bar visibility. These are backend-method extensions, not restructures, so they fit the existing seam without disrupting the web default. The physical-key boundary should stay where it is.
