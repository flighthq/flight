---
package: '@flighthq/keyboard'
crate: flighthq-keyboard
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# keyboard — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

On-screen (soft) keyboard integration — the platform-integration event capability that reports the soft keyboard's visibility, height, and frame rect, emits will/did show/hide/resize signals over the lifecycle quartet (`create`/`attach`/`detach`/`dispose`), and exposes show/hide requests plus native-control extensions (resize mode, style, accessory bar, scroll assist) over a swappable web/native `SoftKeyboardBackend`. The web default integrates the Chromium VirtualKeyboard API with a `visualViewport` fallback. This is explicitly not a physical-key input library — raw key codes, modifiers, and IME composition belong to `@flighthq/input`.

## Decisions

- **[2026-07-02] Latent bug: `transition.height` frozen at 0 before fire.** The will-phase `SoftKeyboardTransition` carries `height` but it is frozen at 0 at the point the signal fires, before the browser has computed the final geometry. Noted as a latent bug that will manifest on native hosts where the will-phase height prediction is meaningful. Not web-fixable (the browser does not expose the target height before animation); document the limitation and fix when native backends land.

## Open directions

- Where the keyboard/textinput boundary falls: this package owns the global keyboard; per-field input traits (`setSoftKeyboardType`, `setSoftKeyboardReturnKey`, etc.) lean toward `@flighthq/textinput`.
- Whether `SoftKeyboardEasingKind` should be wired (adds an `easing` dependency) or left as a type-only placeholder.
- Open vs closed kinds for `SoftKeyboardResizeMode`, `SoftKeyboardStyleKind` — the types promise vendor-prefix extensibility but are closed unions. Resolve per fork B.
- Safe-area/`@flighthq/device` coordination for keyboard-aware inset adjustment.
