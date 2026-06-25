# @flighthq/keyboard

On-screen (soft) keyboard visibility, height, and frame over a swappable web/native backend.

`keyboard` is an **event** cell in the platform-integration suite. A `SoftKeyboard` is a plain entity of signals; you allocate it with `createSoftKeyboard()`, start delivery with `attachSoftKeyboard()`, and release it with `disposeSoftKeyboard()`. Snapshot reads (`getSoftKeyboardInfo`, `getSoftKeyboardHeight`) and the control functions (`showSoftKeyboard`, `hideSoftKeyboard`, resize-mode / accessory-bar / scroll-assist / style) are free functions that delegate to the active `SoftKeyboardBackend`. A web/DOM backend is lazily available, so every function works on the web; a native host (Electron, Tauri, Capacitor, a C/C++ shell) replaces it via `setSoftKeyboardBackend`.

Per-field input traits (input type, return-key label, auto-capitalize/correct, spell-check) are **not** here — they associate with a focused field and belong to `@flighthq/textinput`; this package owns the _global_ keyboard. Safe-area insets are owned by `@flighthq/device`.

## Functions

| Function | Purpose |
| --- | --- |
| `attachSoftKeyboard(keyboard)` | Start delivering backend changes to the entity's signals. Idempotent — a prior subscription is torn down first. |
| `createSoftKeyboard()` | Allocate a `SoftKeyboard` with inert signals. |
| `createSoftKeyboardInfo()` | Allocate a zeroed `SoftKeyboardInfo` to pass as `out`. |
| `createSoftKeyboardTransition()` | Allocate a zeroed `SoftKeyboardTransition` (`durationSeconds: 0`, `height: 0`). |
| `createWebSoftKeyboardBackend()` | Build the default web backend. |
| `detachSoftKeyboard(keyboard)` | Stop delivery and forget the subscription. Safe when not attached. |
| `disposeSoftKeyboard(keyboard)` | Detach the subscription so the entity is GC-eligible. |
| `getSoftKeyboardBackend()` | Return the active backend, lazily creating the web default. There is always a backend. |
| `getSoftKeyboardHeight()` | Return the current keyboard height in CSS pixels (`0` when hidden), no allocation. |
| `getSoftKeyboardInfo(out)` | Fill `out` with the current keyboard snapshot and return it. |
| `getSoftKeyboardResizeMode()` | Return the backend resize mode, or `SoftKeyboardResizeNoneKind` when unsupported. |
| `hideSoftKeyboard()` | Request dismissal. No-op on web unless the Chromium VirtualKeyboard API is available. |
| `isSoftKeyboardAccessoryBarVisible()` | Whether the iOS accessory bar is visible. `false` when unsupported. |
| `isSoftKeyboardScrollAssistEnabled()` | Whether scroll-assist is enabled. `false` when unsupported. |
| `setSoftKeyboardAccessoryBarVisible(visible)` | Show/hide the iOS accessory bar. No-op when unsupported. |
| `setSoftKeyboardBackend(backend)` | Install a native host backend; pass `null` to fall back to the web default. |
| `setSoftKeyboardResizeMode(mode)` | Set how the viewport reacts to the keyboard. No-op when unsupported. |
| `setSoftKeyboardScrollAssistEnabled(enabled)` | Enable/disable scroll-assist. No-op when unsupported. |
| `setSoftKeyboardStyle(style)` | Set the keyboard's light/dark appearance. No-op when unsupported. |
| `showSoftKeyboard()` | Request presentation. No-op on web unless the Chromium VirtualKeyboard API is available. |

## Signals

`attachSoftKeyboard` drives nine signals on a `SoftKeyboard`. The **will** signals fire before the animation begins and carry a `SoftKeyboardTransition` (timing + target height); the **did** signals fire after it settles and carry the settled height. The simple-path aliases (`onShow` / `onHide` / `onResize`) fire alongside their did-phase counterparts.

| Signal         | Phase | Payload                  | Fires on                                                   |
| -------------- | ----- | ------------------------ | ---------------------------------------------------------- |
| `onWillShow`   | will  | `SoftKeyboardTransition` | keyboard about to appear (hidden → visible)                |
| `onWillHide`   | will  | `SoftKeyboardTransition` | keyboard about to disappear (visible → hidden)             |
| `onWillResize` | will  | `SoftKeyboardTransition` | height about to change while staying visible               |
| `onDidShow`    | did   | `height: number`         | keyboard finished appearing                                |
| `onDidHide`    | did   | _(none)_                 | keyboard finished disappearing                             |
| `onDidResize`  | did   | `height: number`         | keyboard settled at a new height (fires on every did edge) |
| `onShow`       | did   | `height: number`         | alias firing with `onDidShow`                              |
| `onHide`       | did   | _(none)_                 | alias firing with `onDidHide`                              |
| `onResize`     | did   | `height: number`         | alias firing with `onDidResize`                            |

The web default reports only the settled **did** phase (`durationSeconds: 0`); a native host that knows its animation timing emits the **will** phase first, so an app can animate in lockstep with the slide.

## `SoftKeyboardInfo` fields

| Field     | Type      | Unit                      | Hidden value |
| --------- | --------- | ------------------------- | ------------ |
| `visible` | `boolean` | —                         | `false`      |
| `height`  | `number`  | CSS pixels                | `0`          |
| `x`       | `number`  | CSS pixels (frame origin) | `0`          |
| `y`       | `number`  | CSS pixels (frame origin) | `0`          |
| `width`   | `number`  | CSS pixels (frame width)  | `0`          |

The web backend prefers the Chromium VirtualKeyboard API's `boundingRect` for a precise frame; it otherwise infers `height` from the `window.visualViewport` shrink relative to `window.innerHeight`, reporting `y` as the viewport height and `width` as `window.innerWidth`. Where neither is present (no `window`, no `visualViewport`, no `navigator.virtualKeyboard`) it degrades to a hidden snapshot.

## Resize-mode / style matrix

These are optional backend capabilities. Each kind is an **open** string contract — a native host may register its own vendor-prefixed value (`'acme.custom'`).

| Concern | Kind constants | Web default |
| --- | --- | --- |
| Resize mode | `SoftKeyboardResizeNoneKind` (`'None'`), `SoftKeyboardResizeBodyKind` (`'Body'`) | unsupported — `getSoftKeyboardResizeMode()` returns `None`, `setSoftKeyboardResizeMode` is a no-op |
| Style | `SoftKeyboardStyleDefaultKind` (`'Default'`), `SoftKeyboardStyleDarkKind` (`'Dark'`) | unsupported — `setSoftKeyboardStyle` is a no-op |
| Accessory bar (iOS) | — | unsupported — query returns `false`, setter is a no-op |
| Scroll-assist | — | unsupported — query returns `false`, setter is a no-op |

## Keyboard-aware layout recipe

Animate your content in sync with the keyboard slide by listening on the **will** phase and using the transition's `durationSeconds` and target `height`. Fall back to the **did** phase for backends (the web default) that report only the settled state.

```ts
import { attachSoftKeyboard, createSoftKeyboard, disposeSoftKeyboard } from '@flighthq/keyboard';
import { connectSignal } from '@flighthq/signals';

const keyboard = createSoftKeyboard();

// Will phase: a native host that knows its timing lets you start the matching animation early.
connectSignal(keyboard.onWillShow, (transition) => {
  // transition.height is the settled keyboard height; transition.durationSeconds is the slide time.
  animateContentInset(transition.height, transition.durationSeconds);
});
connectSignal(keyboard.onWillHide, (transition) => {
  animateContentInset(0, transition.durationSeconds);
});

// Did phase / web fallback: snap to the settled height (durationSeconds is 0 here).
connectSignal(keyboard.onDidResize, (height) => {
  animateContentInset(height, 0);
});

attachSoftKeyboard(keyboard);

// Later, when the surface is torn down:
disposeSoftKeyboard(keyboard);
```

`durationSeconds` is `0` on the web default, so an app that wants a uniform feel can supply its own duration there and reserve the reported duration for native hosts that emit the will phase. Easing the animation is left to the app (or a future `@flighthq/easing` extension of this recipe); this package reports timing and geometry only.
