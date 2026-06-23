# Dependency Alignment: @flighthq/haptics

**Verdict:** Clean — a textbook leaf platform-capability package; one type-only dep on `@flighthq/types`, no phantom/unused deps, no boundary violations.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (`*`) | Sole declared dep; used type-only via `import type` for `HapticsBackend`, `HapticImpactStyle`, `HapticNotificationType`. Pinned `"*"` per workspace convention. | None. |
| Info | (cross-package types) | All three cross-package types live in `@flighthq/types` (`packages/types/src/Haptics.ts`); none redefined inline in this consumer. Correct header-layer usage. | None. |
| Info | (no `@flighthq/sdk`) | Package does not import the barrel. | None. |
| Info | (tree-shaking) | `"sideEffects": false`; no top-level side effects (backend lazily created on first `getHapticsBackend()`). Only runtime dependency in the body is the platform `navigator.vibrate`, not another package. | None. |

## Declared vs used

- **Declared deps:** `@flighthq/types` (runtime), `typescript` (dev).
- **Used in src:** `@flighthq/types` only (type-only import in `haptics.ts` and `haptics.test.ts`).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none.
- **Pinning:** workspace dep `@flighthq/types` pinned `"*"` as required.

`npm run packages:check` passes (86 packages, 16 examples valid). Judgment adds nothing beyond it here — the dependency edge (`haptics → types`) is exactly what the package's purpose predicts, and the only dep is type-only so the package carries no runtime weight from the workspace.
