# @flighthq/keyboard

On-screen keyboard snapshots, change delivery, and controls through explicit host capabilities.

`keyboard` is an event cell in the platform-integration suite. A `SoftKeyboard` is a plain entity of signals; allocate it with `createSoftKeyboard()`, start delivery with `attachSoftKeyboard(host, keyboard)`, and release it with `disposeSoftKeyboard(keyboard)`. Every operation that needs a provider takes the matching `HasSoftKeyboard*` host witness first. There is no module-global backend and no runtime missing-provider branch: a caller without the required capability does not type-check.

Per-field input traits (input type, return-key label, auto-capitalize/correct, and spell-check) belong to `@flighthq/textinput`. Safe-area insets belong to `@flighthq/device`.

## Functions

| Function | Required host capability | Purpose |
| --- | --- | --- |
| `attachSoftKeyboard(host, keyboard)` | change + info | Subscribe the entity to keyboard changes. Returns `acquisition-failed` when subscription acquisition fails. |
| `createSoftKeyboard()` | none | Allocate a `SoftKeyboard` with inert signals. |
| `detachSoftKeyboard(keyboard)` | none | Stop delivery for this entity. Safe when not attached. |
| `disposeSoftKeyboard(keyboard)` | none | Detach the entity so it is eligible for collection. |
| `getSoftKeyboardHeight(host)` | info | Return the current height in CSS pixels. |
| `getSoftKeyboardInfo(host, out)` | info | Fill and return the caller-provided snapshot. |
| `hideSoftKeyboard(host)` | visibility | Request dismissal. |
| `isSoftKeyboardVisible(host)` | info | Return the current visibility flag. |
| `setSoftKeyboardAccessoryBarVisible(host, visible)` | accessory bar | Set iOS accessory-bar visibility. |
| `setSoftKeyboardResizeMode(host, mode)` | resize-mode write | Set how the viewport reacts to the keyboard. |
| `setSoftKeyboardScrollAssistEnabled(host, enabled)` | scroll assist | Enable or disable scroll assist. |
| `setSoftKeyboardStyle(host, style)` | style | Set the keyboard appearance. |
| `showSoftKeyboard(host)` | visibility | Request presentation. |

Host packages provide the capabilities they actually support. `@flighthq/host-web` supplies change, info, and visibility slots; `@flighthq/host-capacitor` supplies all seven keyboard slots.

## Signals

`attachSoftKeyboard` drives three settled-state signals:

| Signal     | Payload          | Fires on              |
| ---------- | ---------------- | --------------------- |
| `onShow`   | `height: number` | hidden to visible     |
| `onHide`   | none             | visible to hidden     |
| `onResize` | `height: number` | visible height change |

Attaching the same entity again first removes its previous subscription. `detachSoftKeyboard` and `disposeSoftKeyboard` remove only that entity's subscription.

## `SoftKeyboardInfo`

| Field     | Type      | Unit       |
| --------- | --------- | ---------- |
| `visible` | `boolean` | —          |
| `height`  | `number`  | CSS pixels |
| `x`       | `number`  | CSS pixels |
| `y`       | `number`  | CSS pixels |
| `width`   | `number`  | CSS pixels |

The web provider prefers the Chromium VirtualKeyboard API's `boundingRect`; otherwise it infers the frame from `visualViewport`. Without browser globals it reports a hidden, zero-sized snapshot, while show and hide report `operation-failed`.

## Example

```ts
import { attachSoftKeyboard, createSoftKeyboard, disposeSoftKeyboard } from '@flighthq/keyboard';
import { webHost } from '@flighthq/host-web';
import { connectSignal } from '@flighthq/signals';

const keyboard = createSoftKeyboard();
connectSignal(keyboard.onResize, (height) => updateContentInset(height));

await attachSoftKeyboard(webHost, keyboard);

// Later, when the surface is torn down:
disposeSoftKeyboard(keyboard);
```
