---
package: '@flighthq/input'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# input — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/input

**Session date:** 2026-06-24 (Second pass) **Starting score:** 82/100 **Estimated new score:** 92/100

## Implemented APIs

### Types added/updated in `@flighthq/types`

All changes from the first pass remain. New types added in this pass:

**`GamepadAxisKind`** (`packages/types/src/GamepadAxisKind.ts`) — new file

- `GamepadAxisKind` object constant + type: `STICK_LEFT_X`, `STICK_LEFT_Y`, `STICK_RIGHT_X`, `STICK_RIGHT_Y` — semantic axis identifiers for the W3C Standard Gamepad Mapping, with axis indices documented.

**`GamepadButtonKind`** (`packages/types/src/GamepadButtonKind.ts`) — new file

- `GamepadButtonKind` object constant + type: 18 entries covering all W3C standard gamepad buttons (face buttons A/B/X/Y labeled by cardinal direction South/East/West/North, shoulders, triggers, select/start, stick-clicks, d-pad directions, home, and touchpad). Index comments on each entry.

**`GamepadMappingKind`** (`packages/types/src/GamepadMappingKind.ts`) — new file

- `GamepadMappingKind = 'standard' | 'raw' | ''` — documents the three mapping states a Gamepad can report. `'standard'` = W3C layout where `GamepadButtonKind`/`GamepadAxisKind` indices apply; `'raw'` and `''` = device-specific layout.

**`InputGamepadConnectData`** (`packages/types/src/InputGamepadData.ts`) — updated

- Added `mapping: GamepadMappingKind` field. Now carries the layout the browser reports on connect/disconnect, enabling callers to know whether semantic button/axis names apply.

**`InputKeyRepeatOptions`** (`packages/types/src/InputKeyRepeatOptions.ts`) — new file

- `InputKeyRepeatOptions { delay: number; interval: number }` — configuration for synthetic key-repeat timing (non-DOM sources). Default values documented: `delay = 500 ms`, `interval = 33 ms` (~30 repeats/s).

**`InputState`** (`packages/types/src/InputState.ts`) — extended

- Added four per-frame edge-tracking sets: `justPressedKeys`, `justReleasedKeys`, `justPressedGamepadButtons`, `justReleasedGamepadButtons`. These accumulate transitions since the last `endInputStateFrame` call; `was*` query functions read from them.

### Functions added to `@flighthq/input`

**`applyGamepadAxisDeadZone(value, deadZone): number`**

- Linear dead-zone filter for a single axis. Values within `[-deadZone, deadZone]` → `0`; outside values rescaled linearly to `[-1, 1]` so the live range is continuous. Pure function, no mutation.

**`applyGamepadStickDeadZone(out, x, y, deadZone): void`**

- Radial dead-zone filter for a 2-D stick. Compares magnitude of `(x, y)` against `deadZone`; outputs `(0, 0)` if within dead zone, otherwise preserves direction and rescales magnitude to `[0, 1]`. Alias-safe (reads `x`/`y` inputs before writing `out`).

**`createInputKeyRepeatTimer(options): { start, stop }`**

- Creates a key-repeat timer for non-DOM sources (gamepad d-pad, virtual keys, native backends). `start(callback)` fires immediately then after `delay` ms then every `interval` ms. `stop()` cancels pending timers. The handle is reusable across press/release cycles.

**`endInputStateFrame(state): void`**

- Clears all four frame-edge sets (`justPressedKeys`, `justReleasedKeys`, `justPressedGamepadButtons`, `justReleasedGamepadButtons`). Call once per logical frame after querying `was*` functions. Does not affect held-state sets (`keysDown`, etc.).

**`exitInputPointerLock(): void`**

- Calls `document.exitPointerLock()`. No-op if unavailable.

**`getCoalescedInputPointerEvents(event, callback): void`**

- Iterates over coalesced pointer events from a `pointermove` `PointerEvent`. Calls `getCoalescedEvents()` when available; falls back to single invocation with the event itself for environments without coalesced support (jsdom). The `InputPointerData` payload object is reused — callers must not retain a reference across invocations.

**`getGamepadAxisName(mapping, index): GamepadAxisKind | null`**

- Returns the semantic `GamepadAxisKind` string for `index` in the W3C standard mapping. Returns `null` when `mapping !== 'standard'` or `index` is out of the standard range (0–3).

**`getGamepadButtonName(mapping, index): GamepadButtonKind | null`**

- Returns the semantic `GamepadButtonKind` string for `index` in the W3C standard mapping. Returns `null` when `mapping !== 'standard'` or `index` is out of the standard range (0–17).

**`hasInputPointerLock(): boolean`**

- Returns `true` if `document.pointerLockElement` is non-null.

**`releaseInputPointerCapture(element, pointerId): void`**

- Calls `element.releasePointerCapture(pointerId)`. Catches `DOMException` silently — if the pointer was already released, the call is a no-op.

**`requestInputPointerLock(element): Promise<boolean>`**

- Requests pointer lock on `element`. Returns `Promise<boolean>` resolving to `true` on success, `false` on rejection or exception. Handles both async (modern browsers) and sync (older browsers) `requestPointerLock` return shapes.

**`setInputPointerCapture(element, pointerId): void`**

- Calls `element.setPointerCapture(pointerId)`. Used for drag operations where all pointer events should be captured to one element.

**`wasInputGamepadButtonPressed(state, gamepad, button): boolean`**

- Returns `true` if the button transitioned from up → down this frame (since last `endInputStateFrame`).

**`wasInputGamepadButtonReleased(state, gamepad, button): boolean`**

- Returns `true` if the button transitioned from down → up this frame.

**`wasInputKeyPressed(state, keyCode): boolean`**

- Returns `true` if the key transitioned from up → down this frame.

**`wasInputKeyReleased(state, keyCode): boolean`**

- Returns `true` if the key transitioned from down → up this frame.

### API changes (second pass)

- **`attachGamepadInput`**: `_connectData` scratch object now populates `mapping` from `pad.mapping` (normalized to `'standard' | '' | 'raw'`), matching the updated `InputGamepadConnectData`.
- **`connectInputStateToInputManager`**: `onKeyDown`/`onKeyUp`/`onGamepadButtonDown`/`onGamepadButtonUp` handlers now also maintain the four frame-edge sets (`justPressed*`, `justReleased*`). `onGamepadConnect`/`onGamepadDisconnect` clean all four sets for the affected pad.
- **`createInputState`**: initializes all four new edge sets (`justPressedKeys`, `justReleasedKeys`, `justPressedGamepadButtons`, `justReleasedGamepadButtons`) as empty `Set<number>`.
- **Key-code tables** (`keyCodesByCode`, `keyCodesByKey`): massively expanded:
  - `keyCodesByCode`: added F13–F24, BrowserBack/Forward/Home/Refresh/Search/Stop/Bookmarks, MediaPlayPause/Stop/TrackNext/TrackPrevious, VolumeDown/VolumeUp/VolumeMute/AudioVolumeDown, LaunchApp1/App2/Mail/MediaPlayer, Eject, Find/Help/Select, Pause, PrintScreen, ScrollLock, Sleep, Undo, Paste, IntlBackslash, ContextMenu.
  - `keyCodesByKey`: added F13–F24, all browser/media keys mirroring the code table, plus Copy/Cut/Paste/Undo/Find/Help/Select/ContextMenu.
  - `numpadKeyCodesByCode`: added `NumpadEqual` → `NUMPAD_EQUALS`.

### Previously implemented (first pass, cumulative)

All Bronze items from session 1 remain in place:

- `InputTextData` type, `InputState` type (basic fields), timestamp fields on all data types, pointer payload enrichment (pressure/tiltX/tiltY/twist/width/height), options symmetry on all `attach*` functions.
- `connectInputStateToInputManager`, `createInputState`, `getInputGamepadAxis`, `isInputGamepadButtonDown`, `isInputKeyDown`, `isInputPointerButtonDown`.

## Test coverage

**84 tests pass** (up from 46 at start of session 1 / 84 at end of session 2). All new exported functions have colocated tests.

New test coverage added in this pass:

- `applyGamepadAxisDeadZone` — 5 cases (within dead zone, positive rescale, negative rescale, zero dead zone, midpoint correctness)
- `applyGamepadStickDeadZone` — 4 cases (within dead zone, full deflection, alias-safe, zero dead zone)
- `createInputKeyRepeatTimer` — 4 cases (immediate fire, delay+interval sequence, stop cancels, restart works)
- `createInputState` — extended to check all 8 fields including new edge sets
- `endInputStateFrame` — 2 cases (clears edge sets, does not affect held-state)
- `exitInputPointerLock` — calls `document.exitPointerLock`
- `getCoalescedInputPointerEvents` — 2 cases (fallback single event, iterates coalesced array)
- `getGamepadAxisName` — 3 cases (standard mapping, non-standard mapping, out-of-range)
- `getGamepadButtonName` — 3 cases (standard mapping, non-standard mapping, out-of-range)
- `hasInputPointerLock` — 2 cases (false when null, true when element locked)
- `releaseInputPointerCapture` — 2 cases (calls method, no-throw on exception)
- `requestInputPointerLock` — 3 cases (sync true, async promise true, throws → false)
- `setInputPointerCapture` — calls `setPointerCapture`
- `wasInputGamepadButtonPressed` — 2 cases (true this frame, false after endInputStateFrame)
- `wasInputGamepadButtonReleased` — press-then-release sequence
- `wasInputKeyPressed` — 3 cases (true this frame, false when not pressed, false after frame roll)
- `wasInputKeyReleased` — 3 cases (true after release, false when not released, false after frame roll)

## Deferred items and why

### Silver items still open

- **`InputBackend` seam** — the roadmap's explicit design decision gate: whether `attach*` functions keep their DOM target signatures alongside a backend path, or route entirely through the backend. This affects every `attach*` signature and the Rust mirror. Kept deferred; needs user input before implementation.
- **Gamepad rumble/vibration** (`hasGamepadVibration`, `setGamepadVibration`, `stopGamepadVibration`) — requires the `InputBackend` seam to route natively. Blocked on the backend seam design decision.

### Gold items not implemented

- **`@flighthq/input-bindings` neighbor package** — action/binding map layer (`InputAction`, `InputActionSet`, `createInputBindingMap`, `bindInputAction`, `getInputActionValue`, chord/combo recognition, serializable maps). Explicit design question: confirm name and boundary with user before creating package shape.
- **`@flighthq/gestures` neighbor package** — gesture recognizers (tap, double-tap, long-press, pinch-zoom, swipe/pan with velocity, rotate). Bronze timestamps (done) and Silver coalesced events (done) are now both available, so the technical precondition is satisfied. Confirm name and scope with user first.
- **`@flighthq/gamepad-mappings` neighbor package** — SDL `GameControllerDB`-style mapping database. Explicit design question: name and scope.
- **Multi-device identity & hot-plug** — per-device `InputDeviceId`, generalized `onInputDeviceConnect`/`Disconnect` signals for keyboard/mouse beyond gamepads.
- **Sensor/extended sources** — boundary with `@flighthq/sensors` not resolved; surface as design question.
- **Rust `flighthq-input` parity** — `InputBackend` seam (partially blocked), `InputState` snapshot (done), gamepad semantics (done); record divergences in conformance map when backend seam is settled.

## Design choices made (second pass)

**Dead-zone approach: linear rescale, not clamped band.** `applyGamepadAxisDeadZone` rescales from the dead-zone boundary to the edge so the full `(0, 1]` range is accessible even after filtering. A naive clamp-to-zero approach would mean axis values just outside the dead zone report near-zero but never approach 1.0 at the same physical position. The linear rescale gives game-quality dead-zone behavior (same approach as SDL2/Unity).

**Radial vs axial dead zone for sticks.** `applyGamepadStickDeadZone` uses a radial (circular) dead zone rather than per-axis filtering. Per-axis filtering creates a diamond-shaped dead zone that causes the stick direction to jump when moving through the cardinal axes. Radial dead zone is industry standard (Unity, Unreal, SDL2 examples all recommend it).

**`GamepadButtonKind` uses compass direction for face buttons (South/East/West/North), not console brand names (A/B/X/Y or Cross/Circle/Square/Triangle).** South/East/West/North maps correctly across Xbox (A/B/X/Y), PlayStation (Cross/Circle/Square/Triangle), and Nintendo Switch (B/A/Y/X — flipped vs Xbox) controllers. This matches the approach used by SDL3, the W3C gamepad spec discussion, and modern game engines that target multi-platform.

**Frame-edge sets are on `InputState`, not separate.** The `justPressedKeys`/`justReleasedKeys` sets are fields on `InputState` (alongside `keysDown`). The alternative would have been a separate `InputFrameState` entity requiring a second connect call. Keeping them on `InputState` is simpler and matches how game loops expect to use them — one state object for both held and edge queries. The `endInputStateFrame` call makes the frame-roll boundary explicit.

**`getCoalescedInputPointerEvents` uses callback iteration, not returning an array.** Returning an array would require allocation per frame. A callback pattern lets callers process each event without creating a temporary array. The single `_pointerData` scratch object is reused per callback call — callers who need to retain values must copy them.

**`requestInputPointerLock` returns `Promise<boolean>` (not `void`).** The caller needs to know whether lock was granted. Modern browsers return `Promise<void>` from `requestPointerLock`; older browsers returned `undefined`. The wrapper normalizes both to `Promise<boolean>` and catches exceptions, so callers see a consistent, awaitable result.

**`createInputKeyRepeatTimer` uses `setTimeout`+`setInterval`, not a signal-driven approach.** Key-repeat synthesis is inherently time-based. A `setTimeout` for the initial delay followed by `setInterval` for the repeat rate is the standard pattern (mirrors browser OS-level key repeat). The returned handle is intentionally simple: `{ start, stop }`. Callers control what the "key" means by providing the callback.

## Concerns and surprises

- The pre-existing `void options` pattern in `attachGamepadInput` and `attachRelativePointerInput` is still present (the `options` parameter is accepted for API symmetry but not consumed for those attach types). This is a minor smell but the correct trade-off until the `InputBackend` seam decides how options flow through.
- `connectSignal` returning `void` rather than a disposer means `connectInputStateToInputManager` must maintain named slot references for `disconnectSignal`. This is correct but verbose. Worth flagging for a future `signals` package revision.
- The expanded `keyCodesByCode`/`keyCodesByKey` tables include entries that map to `KeyCode.UNKNOWN` for keys without SDL equivalents (e.g. IME Convert/NonConvert, WakeUp). These entries are intentionally present as documentation of the mapping decision, not bugs.

## Suggestions for future sessions

1. **Confirm the three Gold neighbor package names and boundaries** with the user: `@flighthq/input-bindings` (action mapping), `@flighthq/gestures` (gesture recognizers), `@flighthq/gamepad-mappings` (SDL controller database). Both Bronze timestamps and Silver coalesced events are now done, so `@flighthq/gestures` has its technical preconditions met.
2. **Confirm the `InputBackend` design question**: should `attach*` functions keep DOM target signatures alongside a backend path, or route entirely through the backend? Answering this unblocks gamepad vibration, the full Silver roadmap, and Rust parity.
3. **Gamepad vibration** (`hasGamepadVibration`, `setGamepadVibration`, `stopGamepadVibration`) once the backend seam question is resolved.
4. **Multi-device identity** — `InputDeviceId`, `onInputDeviceConnect`/`Disconnect` signals beyond gamepads; relevant for native hosts with multiple keyboards/mice.
5. **`@flighthq/gestures`** — now technically unblocked (Bronze timestamps + Silver coalesced events both done). Surface the package scope and name question; then build tap, double-tap, long-press, swipe/pan, pinch-zoom, rotate over the `InputManager` signal layer.
