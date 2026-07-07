# geolocation — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

1. **Fix `floorLevel` bug** — `mapWebPosition` hardcodes `floorLevel: 0` instead of reading `coords.floorLevel`. Read the value with a guarded cast (`(coords as { floorLevel?: number }).floorLevel ?? 0`).
2. **Rename `Geo*` → `Geolocation*` prefix** — `watchGeoPosition` → `watchGeolocationPosition`, `clearGeoWatch` → `clearGeolocationWatch`. Consistent with the suite-wide naming convention (full, unabbreviated subject name).

## Approved

1. **Fix `floorLevel` bug** [2026-07-02 · blanket "platform integration suite sweep"]
2. **Rename `Geo*` → `Geolocation*` prefix** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

None.
