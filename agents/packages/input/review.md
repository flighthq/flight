---
package: '@flighthq/input'
status: solid
score: 82
updated: 2026-08-27
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
coalesced pointer iteration. Its types-first contract, package exports, and 118-test suite are complete
and green. Listener attachment is host-neutral through `InputIngressBackend`; the principal remaining
depth is the adjacent browser-bound gamepad, scheduling, pointer-lock/capture, and coalescing surface.

## What is solid

- Every listener path is explicit behind an `attach*`/`detach*` pair and the Web registrations live in
  one explicit adapter. Importing the package installs no listeners, starts no polling loop, and
  mutates no shared host state.
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

- **Remaining host capabilities.** All six listener families accept host-neutral source identities,
  but `navigator.getGamepads`, pointer-lock/capture APIs, coalesced Web events, and
  `requestAnimationFrame` remain wired directly. Native hosts can supply normalized listener ingress
  but cannot yet replace the full package capability set.
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

The current package is a mature input library with a portable listener-ingress boundary and an
explicit Web adapter. Further surface polishing is lower value than extracting the adjacent host
capabilities and opening the mapping registry; those are direction-bearing architectural steps, not
sweep-safe cleanup.
