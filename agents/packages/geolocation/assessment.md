---
package: '@flighthq/geolocation'
updated: 2026-08-25
basedOn: ./review.md
---

# geolocation — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

1. **Rename `Geo*` → `Geolocation*` prefix** — `createGeoPosition` → `createGeolocationPosition`, `getCurrentGeoPosition` → `getCurrentGeolocationPosition`, `getCurrentGeoPositionResult` → `getCurrentGeolocationPositionResult`. `clearGeoWatch` was already renamed to `clearGeolocationWatch`. Consistent with the suite-wide naming convention (full, unabbreviated subject name). Cascades through SDK barrel and consumers.

## Approved

1. ~~**Fix `floorLevel` bug**~~ [2026-07-02 · landed]
2. **Rename `Geo*` → `Geolocation*` prefix** [2026-07-02 · blanket "platform integration suite sweep"] — partially landed (`clearGeolocationWatch`); three functions remain

## Backlog

None.
