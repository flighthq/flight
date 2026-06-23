# API Alignment: @flighthq/input

**Verdict:** Strongly aligned — names carry full type words, out-params are alias-safe, no eager side effects, and teardown verbs are correct; only minor verb/seam observations remain.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `createInputManager` | Eagerly folds the full signal set in via `...createInputSignals()`, so every manager pays the cost of all 15 signals. The CLAUDE map makes signal-group cost opt-in through `enable*` functions (`enableDisplayObjectSignals`). There is no `enableInputSignals` seam to defer that cost. | Acceptable as-is since signals are this package's sole delivery mechanism (a manager without signals is inert), but consider whether a leaner core + opt-in signal groups (pointer/keyboard/gamepad/text) better matches the tree-shaking intent. Otherwise document the deliberate departure. |
| Low | `attachRelativePointerInput` | The handler inlines pointer-data population (manually assigning all 14 `_pointerData` fields) instead of reusing the internal `setInputPointerData` helper that every other pointer path uses. This is a parallel field-population codepath that can drift from the canonical one. | Route through `setInputPointerData` (passing `movementX`/`movementY` as the deltas) so all pointer events populate `InputPointerData` identically. |
| Low | `attachRelativePointerInput` / `detachRelativePointerInput` | `Relative` is a mode adjective rather than the type word; the type operated on is still pointer input. Naming is self-identifying but the adjective-before-type shape (`attachRelativePointerInput`) is slightly off the `attach<Type>Input` pattern the siblings follow. | Borderline-keep. The relative/absolute distinction is a real mode, so the name is defensible; flagging only for symmetry awareness, no change required. |

## Clean

- **Full, unabbreviated type words throughout.** `getKeyCodeFromDomKeyboardEvent`, `getKeyModifierFromDomKeyboardEvent`, `getMouseWheelModeFromDomWheelEvent`, `attachGamepadInput`, `pollGamepadInput` — no abbreviation of `Keyboard`, `Gamepad`, `Pointer`, `Wheel`, or `Event`.
- **Globally unique root exports.** No collisions with the adjacent `@flighthq/textinput` surface (`attachTextInput` vs `connectInputToTextInput`/`dispatchTextInput` are distinct), and the DOM-conversion getters are namespaced with `FromDom…Event`.
- **Verb consistency on the attach/detach pair.** Every source has a symmetric `attach<X>Input` / `detach<X>Input` (gamepad, keyboard, pointer, relative-pointer, text, wheel). This matches the `attach*`/`detach*` source-wiring verbs used by `@flighthq/application` window wiring — the correct pair for DOM-source binding (distinct from signal-group `enable*`).
- **Allocation discipline by verb.** `createInputManager` / `createInputSignals` allocate (correct `create*`); the hot per-event population uses internal `setInput*Data(out, event, …)` helpers that write into reused scratch objects (`_pointerData`, `_keyboardData`, `_textData`) and allocate nothing per event.
- **Alias-safe out-params.** `setInputKeyboardData`, `setInputPointerData`, `setInputTextData` read every field off the event before writing `out`; `out` is never the event, so aliasing is a non-issue.
- **Accessors use `get*` and return values, not booleans.** All three `get*FromDom*Event` functions return a number/`MouseWheelMode`. No boolean masquerading as a getter.
- **Sentinels over throws.** No thrown errors for expected conditions — disabled managers short-circuit via `if (!manager.enabled) return`, missing gamepad API falls back (`typeof navigator.getGamepads !== 'function'`), unknown keys/codes return `KeyCode.UNKNOWN`, and unknown wheel modes return `'unknown'`.
- **Readonly on read-only object params.** `Readonly<AttachInputOptions>`, `Readonly<KeyboardEvent>`, `Readonly<WheelEvent>` are all marked; mutable params (`InputManager`, DOM `EventTarget`/`HTMLElement`/`Window` targets being attached to) are deliberately mutable.
- **No import-time side effects.** Listeners, `requestAnimationFrame` loops, and the cleanup registry are all set up inside `attach*` calls; module top level only declares functions, lookup tables, and scratch state. `"sideEffects": false` holds. Internal teardown is tracked in side-table `WeakMap`s (`_inputBindings`, `_gamepadPollStates`) rather than fields on the public entity.
- **Type-import hygiene.** `import type { … }` is on its own block (lines 2–13), with the value import of `KeyCode`/`KeyModifier` on a separate line. All cross-package types come from `@flighthq/types`; the only inline interface (`GamepadPollState`) is internal-only and never crosses a package boundary.
- **Symbol kinds used correctly for internal-only slots.** `kGamepadInput` etc. are `Symbol()` registry keys that are never serialized — exactly the internal-slot case the kind-identity rule permits as symbols (no string-kind requirement, since they are not user-facing or persisted).
