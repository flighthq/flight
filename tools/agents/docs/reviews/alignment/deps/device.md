# Dependency Alignment: @flighthq/device

**Verdict:** Clean — the sole runtime dependency is `@flighthq/types` (pinned `*`), it is the only thing imported, all three cross-package types are `import type` from the header, and `npm run packages:check` passes with no findings.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| — | `@flighthq/types` (`*`) | Only declared runtime dep; imported type-only (`import type { DeviceBackend, DeviceInfo, SafeAreaInsets }`). Correct, minimal, pinned. | None |
| — | `@flighthq/sdk` | Not imported. | None |
| — | inline cross-package types | None — `DeviceBackend`, `DeviceInfo`, `SafeAreaInsets` all live in `@flighthq/types/src/Device.ts`, not redefined here. | None |
| — | tree-shaking | `"sideEffects": false`; no module-top-level side effects (backend is lazily created via `getDeviceBackend`, mutated only through `setDeviceBackend`). | None |

Judgment beyond `packages:check`: the dependency mapping reads exactly as a platform-suite command capability should — a single edge to the header layer for the `*Backend`/info types, no reach across the platform suite, no renderer or runtime coupling. The package is a value-in/value-out leaf (out-param fills, packed sentinels) with no surprising edges. Nothing to flag.

## Declared vs used

- **Unused declared deps:** none.
- **Phantom (used-but-undeclared) deps:** none. `@flighthq/types` is the only `@flighthq/*` import and it is declared; no other runtime imports exist (`navigator` is an ambient browser global, not a dependency).
- **Workspace pinning:** `@flighthq/types` correctly pinned to `"*"`.
