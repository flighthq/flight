---
package: '@flighthq/device'
crate: flighthq-device
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# device — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

`@flighthq/device` is the platform-suite command capability for static device/OS identity: a flat set of free functions (`getDeviceInfo`, `getDeviceCapabilities`, `getDeviceDisplayMetrics`, `getSafeAreaInsets`, `getDeviceId`, `refreshDeviceInfo`) over a swappable `DeviceBackend`, with a lazily-constructed web default and `setDeviceBackend` for native hosts. It answers "what hardware/OS is this and what are its fixed traits?" — model, manufacturer, OS name/version, arch, CPU cores, physical/total memory, GPU vendor/renderer, form factor, virtualization, low-end heuristic, safe-area insets, and a resettable install id. It is the snapshot layer — anything that changes at runtime (battery, connectivity, orientation streams) belongs to a neighbor's event capability.

## Decisions

- **[2026-07-02] Evaluate refactoring `detectDesktopUa` to use `@flighthq/useragent`.** The private `detectDesktopUa` function partially duplicates parsing that `@flighthq/useragent` now provides as a library. Evaluate whether it can be replaced with useragent APIs. Not a forced DRY — the Rust port may distinguish the APIs further, so keep the option open.

## Open directions

- Whether `device-formats` collapses into the shared `useragent` primitive (structural fork E, paired with the same decision in `platform`).
- `device` vs `screen` boundary ruling for `DeviceDisplayMetrics` vs live multi-display.
- `getId` durability seam — inject `@flighthq/storage` vs direct `localStorage`.
- `installSource` / install provenance home — likely `@flighthq/app`, confirm placement.
- Predicate-convenience policy: ship `isDeviceTablet(info)` etc. as free functions, or leave consumers to compare the `formFactor` string.
