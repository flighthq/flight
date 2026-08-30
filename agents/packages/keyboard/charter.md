---
package: '@flighthq/keyboard'
role: package
crate: flighthq-keyboard
draft: false
lastDirection: 2026-08-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# keyboard — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

On-screen (soft) keyboard integration — the platform-integration event capability that reports the soft keyboard's visibility, height, and frame rect, emits three signals (`onShow`/`onHide`/`onResize`) over the lifecycle quartet (`create`/`attach`/`detach`/`dispose`), and exposes show/hide requests plus native-control extensions (resize mode, style, accessory bar, scroll assist). Every operation takes a `Has*` host witness (`HasSoftKeyboardInfo`, `HasSoftKeyboardChange`, `HasSoftKeyboardVisibility`, etc.) and dispatches directly through `host.input.slot.operation()` — no ambient get/set backend, no global singleton. Seven decomposed `SoftKeyboard*Backend` entity interfaces (`Info`, `Change`, `Visibility`, `ResizeModeWrite`, `Style`, `AccessoryBar`, `ScrollAssist`) are composed into `Has*` witness types. Web factory functions (`createWebSoftKeyboard*Backend`) are in `@flighthq/host-web/contract`; Capacitor factories in `@flighthq/host-capacitor/contract`. Neither host package depends on `@flighthq/keyboard`. The Chromium VirtualKeyboard API is used when present, with a `visualViewport` fallback. This is explicitly not a physical-key input library — raw key codes, modifiers, and IME composition belong to `@flighthq/input`.

## Decisions

- **[2026-08-30] Direct host witness dispatch (v3).** Every operation takes a `Has*` witness; no ambient `get/setSoftKeyboardBackend`. Will/did signal pairs, `SoftKeyboardTransition`, `SoftKeyboardEasingKind`, and `createSoftKeyboardTransition` all deleted. Subscribe returns typed `SoftKeyboardChangeSubscription` (result + unsubscribe) instead of nullable cleanup. Host packages (`host-web`, `host-capacitor`) export factory functions and do not depend on `@flighthq/keyboard`.
- **[2026-07-02] ~~Latent bug: `transition.height` frozen at 0 before fire.~~** Resolved by deletion: the will/did signal split and `SoftKeyboardTransition` no longer exist. The three current signals (`onShow`/`onHide`/`onResize`) fire after the change with the measured height, so the freeze-at-0 scenario is eliminated.

## Open directions

- Where the keyboard/textinput boundary falls: this package owns the global keyboard; per-field input traits (`setSoftKeyboardType`, `setSoftKeyboardReturnKey`, etc.) lean toward `@flighthq/textinput`.
- Open vs closed kinds for `SoftKeyboardResizeMode`, `SoftKeyboardStyleKind` — the types are bare `string` aliases with only two constants each. Resolve per fork B.
- Safe-area/`@flighthq/device` coordination for keyboard-aware inset adjustment.
