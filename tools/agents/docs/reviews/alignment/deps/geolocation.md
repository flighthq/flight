# Dependency Alignment: @flighthq/geolocation

**Verdict:** Clean — a single, predictable `@flighthq/types` edge, fully type-only, matching the platform-suite command-capability pattern with no unused, phantom, or boundary-violating dependencies.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (dependency, `*`) | Sole runtime dep, pinned `*`, imported only via `import type`. No `@flighthq/sdk` import; no inline cross-package types (all of `GeolocationBackend`, `GeoPosition`, `GeolocationRequestOptions` live in `@flighthq/types/Geolocation.ts`). `"sideEffects": false`, lazy web backend via `getGeolocationBackend`, no top-level registration. | No action. |
| Info | `@flighthq/types` declared as `dependency` though usage is `import type` only | Could arguably be a devDependency since nothing is emitted at runtime. Not a defect: every sibling command-capability package (clipboard, notification, shell, haptics, share) declares it identically as a runtime `dependency`. Demoting only this one would break suite consistency. | Keep as-is for convention parity. |

## Declared vs used

- **Unused declared deps:** none. `@flighthq/types` is used (type-only) in both `geolocation.ts` and `geolocation.test.ts`.
- **Phantom (used-but-undeclared) deps:** none. The only other names referenced are lib.dom globals (`navigator`, `Geolocation`, `GeolocationPosition`, `PositionOptions`), aliased locally as `GlobalGeolocationPosition` to avoid the `GeolocationPosition` collision — no package dependency required.
- **Workspace pin:** `@flighthq/types` correctly pinned `"*"`.
- **`npm run packages:check`:** passes (86 packages valid); this report adds judgment only.
