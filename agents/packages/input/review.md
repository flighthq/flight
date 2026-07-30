---
package: '@flighthq/input'
status: solid
score: 82
updated: 2026-07-30
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - public API
---

# input — Review

## Verdict

**Solid — 82/100.** The live package is a coherent, side-effect-free input library rather than the
non-mergeable intermediate delta described by the old review. Forty public functions normalize
keyboard, pointer, relative-pointer, wheel, gamepad, and text/IME events; maintain held and per-frame
edge state; and provide gamepad dead zones/names, reusable key-repeat timing, pointer lock/capture, and
coalesced pointer iteration. Its types-first contract, package exports, and 104-test suite are complete
and green. The principal remaining depth is architectural: every host attachment is still expressed
through browser DOM targets even though the charter requires a native-capable `InputBackend`.

## What is solid

- Every listener path is explicit behind an `attach*`/`detach*` pair. Importing the package installs no
  listeners, starts no polling loop, and mutates no shared host state.
- The `InputManager` signal surface covers keyboard, pointer, relative movement, wheel, gamepad
  connection/buttons/axes, and text composition. Reused scratch payloads preserve the zero-allocation
  per-event contract.
- `InputState` separates held state from frame edges. Connection wiring, end-of-frame clearing, and
  keyboard/gamepad press/release queries have behavioral coverage.
- Gamepad helpers provide linear and radial dead-zone math, alias-safe stick output, semantic names for
  the W3C standard mapping, and `null` for unknown mappings or indices.
- Pointer capability helpers use honest sentinels: pointer-lock requests resolve `false` on expected
  absence/failure, capture release tolerates an already-released pointer, and coalesced iteration falls
  back to the original event.
- Cross-package interfaces live in `@flighthq/types`. In particular, `GamepadMappingKind` types both
  semantic-name queries and `InputKeyRepeatTimer` names the reusable timer handle returned by
  `createInputKeyRepeatTimer`.
- Public and contract lanes are curated, `sideEffects` is false, the package description and package
  maps reflect the shipped library, every exported function has a colocated test, and the focused
  package check passes all structural gates.

## Remaining depth

- **Portable host seam.** The chartered `InputBackend` is absent. DOM `EventTarget`, `HTMLElement`,
  `Window`, `navigator.getGamepads`, pointer-lock APIs, and `requestAnimationFrame` remain wired
  directly in the implementation, so native hosts cannot feed the same normalized manager without
  recreating browser-shaped objects.
- **Gamepad mapping extensibility.** `GamepadMappingKind` is still a closed
  `'standard' | 'raw' | ''` type and semantic lookup recognizes only the fixed W3C standard tables.
  The charter decision calls for an open registry with optional preset registrations.
- **Device identity.** Keyboard and pointer events have no generalized device identity, and only
  gamepads expose connection lifecycle. Multi-keyboard/mouse native hosts therefore lack a portable
  distinction.
- **Signal cost model.** `createInputManager` eagerly creates all 15 signals. Because signals are the
  manager's sole delivery mechanism this is internally coherent, but it remains an explicit charter
  decision rather than silently borrowing the graph packages' `enable*Signals` model.
- Action mapping, gestures, and nonstandard controller databases remain deliberately separate,
  blessed neighbor-package directions rather than responsibilities to fold into this cell.

## Boundary conclusion

The current package is a mature browser input library with a clean normalized-data boundary. Further
surface polishing is lower value than introducing the chartered host backend and open mapping registry;
those are direction-bearing architectural steps, not sweep-safe cleanup.
