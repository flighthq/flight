# Dependency Alignment: @flighthq/sensors

**Verdict:** Clean — dependencies are minimal, correct, and identical to every sibling event capability; no findings beyond what `npm run packages:check` already certifies (green).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/signals`, `@flighthq/types` | Both declared deps are used (`createSignal`/`emitSignal` from signals; `MotionReading`/`OrientationReading`/`Sensors`/`SensorsBackend` from types), pinned `"*"`, and match the canonical event-capability shape (network/power/lifecycle/keyboard carry the exact same two deps). | — |
| None | `@flighthq/sdk` | Not imported. | — |
| None | Cross-package types | All cross-package types (`MotionReading`, `OrientationReading`, `Sensors`, `SensorsBackend`) are imported from `@flighthq/types`; none are redefined inline. The only locally-defined interfaces (`WebDeviceMotionEvent`, `WebRotationRate`, `WebMagnetometer`, etc.) are private web-DOM event shapes, not cross-package contracts — correct to keep local. | — |
| None | Web DOM globals (`window`, `DeviceMotionEvent`, `Magnetometer`) | The default web backend touches browser globals but pulls no dependency for them — guarded via `typeof … === 'undefined'` and a local `declare const Magnetometer`. Keeps the package backend-clean and degrades to no-ops off the web, as the platform-suite seam pattern requires. | — |
| None | Tree-shaking / type-only | `"sideEffects": false` declared; all `@flighthq/types` imports use `import type` (value import only from signals, which is the runtime mechanism). No top-level side effects — backend is lazily created in `getSensorsBackend`. | — |

## Declared vs used

- **Unused declared deps:** none. Both `@flighthq/signals` and `@flighthq/types` are imported by `src/sensors.ts`.
- **Phantom (used-but-undeclared) deps:** none. The only imports in src are the two declared workspace deps; everything else (`window`, `DeviceMotionEvent`, `Magnetometer`, `WeakMap`) is a platform/global, not a package import.
- **Pinning:** both workspace deps pinned `"*"` per convention.
