---
package: '@flighthq/input'
status: solid
score: 83
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
  - input-ingress-seam-plan.md
  - explicit-dependency-model.md
---

# input -- Review

## Verdict

**Solid -- 83/100.** A coherent, side-effect-free input library with a complete portable
listener-ingress seam. Forty-one exported functions (35 public, 6 contract-only) normalize keyboard,
pointer, relative-pointer, wheel, gamepad, and text/IME events; maintain held and per-frame edge
state; and provide gamepad dead zones and semantic names, key-repeat synthesis, pointer capture, and
coalesced pointer iteration. Since the prior review, the legacy pointer-lock surface has been
deleted (charter Decision [2026-08-29]), and the Web adapter now owns all six attachment families
behind the process-global `InputIngressBackend` with the P5 input-ingress budget at zero. The test
suite (about 118 individual test cases across 42 `describe` blocks) covers all exported functions
including the ingress backend override chain, multi-source routing, and reentrant detach safety.

Score rises slightly from 82: the ingress seam is now fully implemented and the legacy pointer-lock
surface is cleanly removed rather than partially migrated. Remaining depth is architectural
(gamepad-mapping registry, adjacent browser capabilities, singleton migration) rather than missing
functionality.

## Present capabilities

**Source layout:** 2 source files (`inputManager.ts` at 1,231 lines, `index.ts` at 37 lines), 2
test files (`inputManager.test.ts` at 1,565 lines, `index.test.ts` at 27 lines). All source lives
in `packages/input/src/`. Dependencies: `@flighthq/signals`, `@flighthq/types`.

**Listener ingress and the Web adapter.** All six listener families (`attachKeyboardInput`,
`attachPointerInput`, `attachRelativePointerInput`, `attachWheelInput`, `attachTextInput`,
`attachGamepadInput`) and their six `detach*` counterparts accept host-neutral
`InputIngressSource`. The Web adapter (`createWebInputIngressBackend`) handles DOM-specific
concerns: keyboard keydown/keyup, five pointer events plus contextmenu, document-level mousemove
for relative pointer, beforeinput/compositionupdate for text/IME, passive-aware wheel, and
requestAnimationFrame-driven gamepad polling with edge detection against previous state. The
adapter returns inert release functions for source identities it cannot interpret, rather than
throwing. Three-tier backend resolution (`getInputIngressBackend`): custom > host > web fallback.

**Signal delivery.** `createInputManager` allocates all 15 typed signals (`onKeyDown`, `onKeyUp`,
`onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`, `onPointerMoveRelative`,
`onWheel`, `onGamepadConnect`, `onGamepadDisconnect`, `onGamepadButtonDown`, `onGamepadButtonUp`,
`onGamepadAxisMove`, `onTextInput`, `onTextEdit`). `createInputSignals` is available separately
at the contract lane. The `enabled` flag on `InputManager` gates both the sink routing and the Web
adapter's internal listeners.

**Held-state snapshot and edge queries.** `createInputState` provides `keysDown`, `pointerButtonsDown`,
`gamepadButtonsDown`, `axisValues`, and the four `just*` edge sets. `connectInputStateToInputManager`
wires all relevant signals with correct transition semantics: up-to-down guards prevent held-key
autofire, same-frame press+release preserves both edges, and gamepad connect/disconnect clears stale
pad state. `endInputStateFrame` clears the edge sets. Query functions: `isInputKeyDown`,
`isInputPointerButtonDown`, `isInputGamepadButtonDown`, `getInputGamepadAxis`, `wasInputKeyPressed`,
`wasInputKeyReleased`, `wasInputGamepadButtonPressed`, `wasInputGamepadButtonReleased`.

**Gamepad helpers.** `applyGamepadAxisDeadZone` (linear, single axis) and `applyGamepadStickDeadZone`
(radial, 2-D stick with alias-safe `out`). `getGamepadAxisName` and `getGamepadButtonName` map
indices to `GamepadAxisKind`/`GamepadButtonKind` strings for the W3C standard mapping, returning
`null` for non-standard or out-of-range. `createInputKeyRepeatTimer` synthesizes key-repeat with
configurable delay and interval, reusable across press/release cycles.

**DOM helpers.** `getKeyCodeFromDomKeyboardEvent` maps `KeyboardEvent.code` (with numpad-location
dispatch) and falls back to `KeyboardEvent.key` for unknown codes. Exhaustive W3C code tables.
`getKeyModifierFromDomKeyboardEvent` produces a `KeyModifier` bitmask including CapsLock and
NumLock via `getModifierState`. `getMouseWheelModeFromDomWheelEvent` maps `deltaMode` to
`MouseWheelMode`. `getCoalescedInputPointerEvents` iterates high-frequency intermediate pointer
positions with a single-event fallback. `setInputPointerCapture`/`releaseInputPointerCapture`
wrap the DOM pointer-capture API with error tolerance on release.

**Zero-allocation contract.** Six scratch singletons at module scope (`_keyboardData`, `_pointerData`,
`_textData`, `_axisData`, `_buttonData`, `_connectData`) are reused across all event dispatch.
The gamepad polling loop reuses the same data objects for axis and button emissions.

**Pointer-lock removal.** `index.test.ts` explicitly asserts that the three legacy pointer-lock
exports (`exitInputPointerLock`, `hasInputPointerLock`, `requestInputPointerLock`) are absent from
both export lanes, and that no legacy pointer-lock operation remains on `InputIngressBackend`.

## Gaps

1. **Remaining host capabilities.** `getCoalescedInputPointerEvents` takes a DOM `PointerEvent`
   directly. `setInputPointerCapture` and `releaseInputPointerCapture` take `HTMLElement` directly.
   `getKeyCodeFromDomKeyboardEvent`, `getKeyModifierFromDomKeyboardEvent`, and
   `getMouseWheelModeFromDomWheelEvent` accept DOM event types. These are useful Web utilities, but a
   native host that feeds normalized events through `InputIngressBackend` cannot use them. The status
   doc names `navigator.getGamepads`, animation-frame scheduling, pointer capture, and coalesced
   events as the remaining browser-bound capabilities.

2. **Gamepad mapping extensibility.** `GamepadMappingKind` remains the closed
   `'standard' | 'raw' | ''` union. `getGamepadAxisName` and `getGamepadButtonName` recognize only
   the hardcoded W3C standard mapping tables. The charter Decision [2026-07-02] calls for an open
   registry with preset `register*` functions, which is not yet implemented.

3. **No `disposeInputManager`.** The internal state held in the two WeakMaps (`_inputIngressSinks`,
   `_inputBindings`) is garbage-collected with the manager, but there is no explicit teardown that
   detaches all bindings for a manager being retired. A caller must `detach*` each source manually.

4. **Gamepad rumble / haptic feedback.** Not present. The status doc notes this absence.

5. **No multi-device identity.** No `InputDeviceId`; keyboard and pointer devices lack generalized
   connection lifecycle. Only gamepads have connect/disconnect signals (charter Open direction #3).

6. **Charter "What it is" section is stale.** It says "37 exports, 2 source files, 118 tests."
   The public lane now has 35 exports (3 pointer-lock removed, but contract lane has 41 total
   including 6 contract-only ingress functions). The source and test file counts are accurate. The
   test count is approximately correct when counting `it.each` expansions. Minor, but the numbers
   should match the live tree.

## Charter contradictions

1. **Process-global singleton versus explicit dependency model.** The codebase-map Design Constraints
   say: "No `set*Backend` singletons, no module-scoped mutable state that functions reach for." The
   `setInputIngressBackend`/`installInputIngressHostBackend`/`getInputIngressBackend` trio is exactly
   this pattern, with two module-scoped `let` variables (`_customInputIngressBackend`,
   `_hostInputIngressBackend`) and three-tier precedence. The charter Decision [2026-08-27]
   deliberately chooses "one process-global `InputIngressBackend`" -- so this is a ratified departure,
   not accidental drift. However, the explicit-dependency-model record (P5 migration plan) names
   `set*Backend` / `install*HostBackend` as the pattern being replaced by host capability fields.
   The input ingress backend will need to migrate to that model.

2. **`GamepadMappingKind` still closed.** Charter Decision [2026-07-02] says open registry with
   preset methods. The type and lookup functions still use a closed union. No `register*` function
   exists for custom mappings.

No other charter violations found. North star #1 (full library), #2 (zero allocation), #3
(side-effect-free wiring), #4 (portable ingress), and #5 (sentinels over throws) are all upheld.

## Contract and docs fit

**Adherence to project contract:**
- All types imported from `@flighthq/types/contract`; no locally-defined exported types.
- Function names use full unabbreviated type names (`getKeyCodeFromDomKeyboardEvent`, not
  `getKeyCode`; `applyGamepadStickDeadZone`, not `applyStickDeadZone`).
- `sideEffects: false` declared and accurate: importing the package creates no listeners, starts no
  timers, and mutates no globals. The module-level `_webInputIngressBackend` allocation creates an
  inert backend object, not active resources.
- Two export lanes properly configured (`.` and `./contract`). Public lane curates 35 exports;
  contract lane re-exports all 41 including ingress backend management.
- Scratch singletons at bottom of file, after exported functions.
- Sentinels used consistently: `null` for unknown mappings, `0` for unknown axes, `false` for
  unknown held state. `releaseInputPointerCapture` silently catches on already-released pointer.
- `Readonly<T>` used on all `InputState` query functions, on `AttachInputOptions`, and on data
  payloads received from signals and in the state machine.
- The `out` parameter on `applyGamepadStickDeadZone` is documented alias-safe and tested.

**Candidate revisions to contract or admin docs:**
- The Package Map in `AGENTS.md` groups `input` under "Input and text." Accurate.
- The charter's "What it is" export count (37) is stale after the pointer-lock removal and ingress
  additions. Should be updated to reflect 35 public / 41 contract-lane exports.

## Candidate open directions

1. **Migration timeline for the ingress singleton.** The explicit-dependency-model record plans to
   replace `set*Backend`/`install*HostBackend` across the SDK with host capability fields. Input's
   ingress backend was implemented as a process-global singleton with a charter decision, but the
   migration plan targets it for replacement. When should this happen?

2. **Should the `Dom` helper functions move to a separate module or stay?** Functions like
   `getKeyCodeFromDomKeyboardEvent` and `getMouseWheelModeFromDomWheelEvent` are Web-specific
   utilities that do not participate in the portable ingress model. They are useful for the Web
   adapter and for callers working directly with DOM events. The charter does not speak to whether
   they should be separated or remain alongside the portable API.
