---
package: '@flighthq/input'
updated: 2026-07-02
basedOn: ./review.md
---

# input — Assessment

Verified against the live tree (2 source files, 1 test file, ~104 tests, 40 exports) and the direction session (2026-07-02). Five charter decisions blessed. Types are present in `@flighthq/types` (stale review was false alarm). Depth review: 70/100.

## Recommended

Sweep-safe: within-package fixes, no design fork.

1. **Type `getGamepadAxisName`/`getGamepadButtonName` mapping parameter as `GamepadMappingKind`.** Currently bare `mapping: string`. Tighten to the kind type and reconcile the `getInput…`/`getGamepad…` prefix split.

2. **Name the key-repeat-timer handle.** `createInputKeyRepeatTimer` returns an inline `{ start; stop }`. Define `InputKeyRepeatTimer` in `@flighthq/types` and return it.

3. **Fix implicit `any` in test file.** Two test callbacks have untyped `data` parameter (lines ~937, ~951 in `inputManager.test.ts`).

4. **Package Map description update.** Per charter Open direction #5. Current entry omits gamepad, state snapshots, edge queries.

## Backlog

- **`InputBackend` seam design.** Per charter Decision #2. Requires design — shape of the backend interface, relationship to `WindowBackend`. Not sweep-safe.
- **`GamepadMappingKind` open registry migration.** Per charter Decision #4. Requires types changes and preset registration functions.
- **Neighbor packages.** `input-bindings`, `gestures`, `gamepad-mappings` are blessed but undesigned. Each needs its own session.
- **`enableInputSignals` decision.** Per charter Open direction #2.

## Approved

- [2026-07-02 · picked] Sweep items 1–4: mapping parameter type, timer handle type, test fix, Package Map
