# Depth Review: @flighthq/input

**Domain:** Raw-system-input normalization — turning host (DOM) keyboard, pointer, wheel, gamepad, and text/IME events into a portable, backend-agnostic representation dispatched over signals, with stable key codes and modifier flags.

**Verdict:** solid — 70/100

The package is well-scoped, internally clean, and complete for what it declares: a normalization seam ("maps raw system inputs to a normalized internal representation, feeding into interactions, signals, and other consumers" — Package Map). It is _not_ a full game-input library (state polling, action mapping, deadzones, rebinding). For its declared role it is close to done; against a maximal "input library" bar it is a normalization layer with the higher-level conveniences missing. The verdict reflects depth for the declared domain; the gaps are largely missing-by-scope rather than missing-by-omission.

## Present capabilities

Device coverage (attach/detach pairs, all routed through one internal binding registry keyed by manager → target → kind):

- Keyboard: `attachKeyboardInput` / `detachKeyboardInput` over `keydown`/`keyup`, emitting `onKeyDown`/`onKeyUp` with normalized `InputKeyboardData`.
- Pointer: `attachPointerInput` / `detachPointerInput` over Pointer Events (`pointerdown/up/move/cancel` + `contextmenu` suppression), emitting `onPointerDown/Up/Move/Cancel`. Pointer type normalized to `mouse | pen | touch | unknown`; `pointerId`, `isPrimary`, `buttons` carried through — so multi-touch / multi-pointer is representable.
- Relative pointer: `attachRelativePointerInput` / `detachRelativePointerInput` using `movementX/Y` → `onPointerMoveRelative` (pointer-lock / FPS-look style deltas). This is a notable, non-obvious inclusion.
- Wheel: `attachWheelInput` / `detachWheelInput` with `deltaMode` normalized to `MouseWheelMode` (`pixels | lines | pages | unknown`).
- Gamepad: `attachGamepadInput` / `detachGamepadInput` with internal rAF poll loop, plus a standalone `pollGamepadInput` for callers who own their own loop. Diff-based edge detection emits `onGamepadButtonDown/Up` and `onGamepadAxisMove`; connect/disconnect via `onGamepadConnect/Disconnect`. Per-manager poll state held in a side `WeakMap`.
- Text / IME: `attachTextInput` / `detachTextInput` over `beforeinput` + `compositionupdate`, emitting `onTextInput` / `onTextEdit` (composition) as `TextSelectionRange`.

Normalization primitives (the genuinely valuable, portable core):

- `getKeyCodeFromDomKeyboardEvent` mapping `event.code`/`event.key` to a stable SDL-style `KeyCode` table (the `@flighthq/types` `KeyCode` is exhaustive — full alpha/num/F1–F24, numpad incl. mem/hex/binary variants, media/browser/system keys, ~250 entries), with correct numpad-by-location disambiguation.
- `getKeyModifierFromDomKeyboardEvent` producing a left/right-distinguished `KeyModifier` bitmask plus CapsLock/NumLock lock state via `getModifierState`.
- `getMouseWheelModeFromDomWheelEvent`.
- `createInputManager` / `createInputSignals` (entity + signals split, matching the SDK's enable-signals convention).

Engineering quality is high: scratch `_*Data` singletons reused per emit (zero per-event allocation, matching the SDK's allocation discipline), `Readonly<>` on all signal payloads, `enabled` gate honored everywhere, idempotent re-attach (re-binding the same kind cleans up the prior one), and `preventDefault` opt-out via `AttachInputOptions`. 46 tests over the single source file.

## Gaps vs an authoritative input library

A maximal, industry-standard input library (think SDL input subsystem, Unity Input System, gainput, OpenFL/Lime input) is expected to provide several layers this package does not:

- **No queryable input state.** Everything is edge dispatch over signals; there is no `isKeyDown(keyCode)`, `isPointerButtonDown(button)`, `getKeyState`, or a frame-snapshot of held keys/buttons/axes. A consumer that wants "is W currently held?" must build and maintain that themselves. For a game-facing SDK this is the single biggest missing layer. (Partly by design — the package is a normalization seam, not a state store — but a `*State`/`is*Down` poll surface is canonical enough to flag.)
- **No action / binding mapping.** No `InputAction`, action sets, key/button rebinding, or chord/combo recognition — standard in modern input systems (Unity Input System, SDL `SDL_GameControllerDB`). Missing-by-scope, but it is what separates a "normalization layer" from an "input library."
- **Gamepad depth is thin.** Buttons/axes are raw indices only. No `GamepadButton`/`GamepadAxis` semantic mapping (A/B/X/Y, triggers, stick L/R), no **dead-zone** handling, no **rumble / vibration** (`GamepadHapticActuator`), no standard-mapping vs raw-mapping distinction. A robust gamepad layer is expected to name buttons and filter stick noise.
- **No gestures / high-level touch.** Tap, double-tap, long-press, pinch-zoom, rotate, swipe — none. `clickCount`/double-click detection exists only over in `@flighthq/textinput`, not here. Raw multi-touch pointers are exposed, but no gesture recognizer sits on top.
- **No timestamps on events.** Payloads carry no event time, so velocity/inertia/repeat-timing consumers must stamp time themselves. Most input libraries include a monotonic timestamp.
- **No pressure / tilt / coalesced events.** Pointer payload omits `pressure`, `tiltX/Y`, `twist`, `width/height`, and does not surface `getCoalescedEvents()` / `getPredictedEvents()` — relevant for pen and high-frequency input, which the `pen` pointer type otherwise advertises support for.
- **No key-repeat synthesis or auto-repeat config.** `repeat` is passed through from the DOM but there is no first-class repeat timer for non-keyboard sources.
- **Web-only host coupling.** All attach functions take DOM `EventTarget`/`HTMLElement`/`Window` directly; there is no `*Backend` seam the way the platform suite uses, so a native host cannot feed normalized input through the same API without a parallel path. (Per the Rust map, `input` maps raw inputs to the normalized rep; a backend seam would make that portability explicit rather than implicit in the DOM signatures.)

## Naming / API-shape notes

- Naming is clean and self-identifying: `attach*Input` / `detach*Input` pairs, `get*FromDom*Event` normalizers, `pollGamepadInput`. The `FromDomKeyboardEvent` / `FromDomWheelEvent` suffix correctly marks these as the web adapter (consistent with the conformance map's separation of normalized vs host-specific).
- The entity/runtime + enable-signals convention is followed: `InputManager extends InputSignals` is the entity, `createInputSignals` is the opt-in cost. The internal binding registry and gamepad poll state live in side `WeakMap`s off the public entity — exactly the runtime-slot pattern the codebase prescribes.
- Text events reuse `TextSelectionRange` as the payload (`{ start, length, text }`). For an IME `beforeinput` the `start`/`length` are synthesized as `0`/`text.length`, which is a slight overload of a selection type to mean "inserted run." A dedicated `InputTextData` payload would read more honestly than borrowing the selection range.
- `attachGamepadInput` starts a `requestAnimationFrame` loop internally — a hidden timer behind an `attach*` call. This is consistent with attach semantics, but note it means gamepad input has an import-adjacent side effect on attach that the other (purely listener-based) attach functions do not; `pollGamepadInput` being exported separately is the right escape hatch for callers who already own a loop.
- One small asymmetry: keyboard/pointer/wheel expose `AttachInputOptions { preventDefault }`, but relative-pointer, text, and gamepad attach do not accept options. Fine today, but worth keeping symmetric as options grow.

## Recommendation

Treat this as a deliberately thin, high-quality **normalization layer** that is solid for its stated job, and decide explicitly whether the SDK wants the higher layers here or elsewhere:

- **Within this package (closest to canonical "input library" depth):** add a queryable state snapshot (`isKeyDown`, `isPointerButtonDown`, held-axis query, or a per-frame `InputSnapshot`); add gamepad dead-zone handling, semantic button/axis naming, and vibration; add event timestamps; enrich pointer payloads with `pressure`/`tilt` and optional coalesced events.
- **Likely separate, bounded neighbors (raise as design questions):** an action/binding-map layer (`@flighthq/input-bindings`?) and a gesture recognizer (`@flighthq/gestures`?) are large enough and orthogonal enough that they may deserve their own cells rather than swelling this one.
- **Portability:** introduce an `InputBackend` seam so native hosts feed normalized input through the same `InputManager` API, making the "portable" in the package description structural rather than DOM-implicit.

No blocking issues; the existing surface is clean and well-tested. The score reflects that the package is authoritative on _normalization and key-code mapping_ but only partial against the full breadth of a mature input system (state, actions, gestures, gamepad semantics).
