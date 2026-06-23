# TS↔Rust Alignment: @flighthq/input

**Verdict:** Crate name and the lifecycle/constructor exports align, but the entire event-ingestion surface diverges in shape (TS DOM `attach*`/`detach*` vs Rust native `dispatch_*`) and this is only weakly covered by the catch-all "DOM input wiring" phrase — `input` is not named in the web-relocated list and the native `dispatch_*` family is undocumented drift that needs an explicit conformance-map entry.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `attachKeyboardInput`, `attachPointerInput`, `attachRelativePointerInput`, `attachWheelInput`, `attachGamepadInput`, `attachTextInput` (`inputManager.ts`) | — (no Rust equivalent) | 6 DOM-wiring `attach*` functions have no Rust port. Native input is push-based, so the seam is right — but the omission is only implicitly covered by the conformance map's "DOM input wiring" clause, which does **not** list `input` among its packages. Should be named explicitly. |
| `detachKeyboardInput`, `detachPointerInput`, `detachRelativePointerInput`, `detachWheelInput`, `detachGamepadInput`, `detachTextInput` (`inputManager.ts`) | — (no Rust equivalent) | Same as above: 6 `detach*` functions absent; teardown for native dispatch is the implicit drop of listener guards, not a per-target detach. Web-relocated, but `input` not named in the map. |
| `getKeyCodeFromDomKeyboardEvent` (`inputManager.ts`) | `get_key_code_from_key_name(name: &str)` (`keyboard.rs`) | Not a 1:1 name port. The Rust function takes a key-name string rather than a DOM event and is renamed. Defensible (no `KeyboardEvent` natively) but the renamed-without-map-entry pairing is silent drift. |
| `getKeyModifierFromDomKeyboardEvent` (`inputManager.ts`) | `get_key_modifier_from_flags(...)` (`keyboard.rs`) | Renamed; takes 10 bools instead of a DOM event. Same drift concern. |
| `getMouseWheelModeFromDomWheelEvent` (`inputManager.ts`) | — (folded into `dispatch_wheel_event` `mode` param) | No standalone Rust port; mode is passed in by the host. Web-relocated, unlisted. |
| `pollGamepadInput` (`inputManager.ts`) | `poll_gamepad_input` (`gamepad.rs`) | 1:1 name match, but the Rust body is an intentional no-op stub (`TODO(wave-N)`); real diffing lives in the extra `poll_gamepad_snapshots`. Behavioral gap to record. |
| `createInputManager`, `createInputSignals` (`inputManager.ts`) | `create_input_manager`, `create_input_signals` (`manager.rs`, `signals.rs`) | Aligned 1:1. |
| — (no TS export) | `dispatch_keyboard_event`, `dispatch_pointer_down_event`, `dispatch_pointer_up_event`, `dispatch_pointer_move_event`, `dispatch_pointer_cancel_event`, `dispatch_pointer_move_relative_event`, `dispatch_wheel_event`, `dispatch_gamepad_axis_event`, `dispatch_gamepad_button_down_event`, `dispatch_gamepad_button_up_event`, `dispatch_gamepad_connect_event`, `dispatch_gamepad_disconnect_event` (`keyboard.rs`/`pointer.rs`/`gamepad.rs`) | 12 **extra** Rust functions with no TS counterpart — the native push-dispatch surface that replaces the DOM `attach*` listeners. Architecturally correct per the host-layer pattern, but not present upstream and not in the divergence map. This is the core undocumented divergence. |
| — (no TS export) | `dispose_input_manager` (`manager.rs`) | Extra Rust teardown. TS has no `disposeInputManager` (cleanup is per-target `detach*`). Reasonable given the shape change but unrecorded. |
| — (no TS export) | `poll_gamepad_snapshots`, `GamepadSnapshot`, `GamepadButtonSnapshot`, `GamepadPollState` (`gamepad.rs`) | Extra Rust diffing helper + value types. The TS equivalent (`getOrCreateGamepadPollState`, the `GamepadPollState` interface) is **module-internal**, not exported — so these are private TS state surfaced as public Rust API. Borderline; note as a deliberate seam. |
| `inputManager.ts` (single file) | `manager.rs` + `signals.rs` + `keyboard.rs` + `pointer.rs` + `gamepad.rs` | Filename split. Nice-to-have basename tracking is broken: there is no `input_manager.rs`. The split is reasonable for the larger native surface, but `manager.rs` is the closest counterpart and does not echo the `inputManager` basename. |

## In sync

- **Crate name:** `@flighthq/input` → `flighthq-input` is identity, no rename needed.
- **Constructors:** `createInputManager` ↔ `create_input_manager`, `createInputSignals` ↔ `create_input_signals` map 1:1 with correct camelCase→snake_case and full type words preserved.
- **`InputManager` / `InputSignals` types** are re-exported from `flighthq-types::input`, matching the TS "types live in `@flighthq/types`" rule.
- **Signal field names** match 1:1 (`onKeyDown`↔`on_key_down`, `onGamepadAxisMove`↔`on_gamepad_axis_move`, all 15).
- **`enabled` gate behavior** is preserved: every Rust `dispatch_*`/`poll_*` early-returns when `!manager.enabled`, mirroring the TS `if (!manager.enabled) return;` guard.
- **Sentinel convention:** `getKeyCodeFromDomKeyboardEvent`'s `KeyCode.UNKNOWN` fallback carries across to `get_key_code_from_key_name` returning `key_code::UNKNOWN`.
- **KeyCode / KeyModifier tables** are faithfully ported (named-key map, single-char lowercase fallback, all modifier bits).

## Recommended divergence-map additions

The conformance map's web-relocated clause (conformance.md line 119) lists packages but **omits `input`**, while the trailing "DOM input wiring" phrase is too vague to count as a reviewed decision for this package. Add an explicit `input` entry recording:

1. `input` belongs in the web-relocated set — the 12 `attach*`/`detach*` + 3 `get*FromDom*`/`getMouseWheelMode*` functions are DOM-bound and live in `host-web`, not native core.
2. The native crate **replaces** them with a `dispatch_*` push surface (12 fns) + `dispose_input_manager` + `poll_gamepad_snapshots`/`GamepadSnapshot`/`GamepadPollState`. This is the host-layer pattern (native pushes events; web wires DOM), not drift — but it must be recorded so the extra Rust functions and the renamed `get_key_code_from_key_name`/`get_key_modifier_from_flags` are auditable rather than silent.
3. Note `poll_gamepad_input` is a deliberate no-op pending a portable gamepad backend (`TODO(wave-N)`), with diffing logic parked in `poll_gamepad_snapshots`.
