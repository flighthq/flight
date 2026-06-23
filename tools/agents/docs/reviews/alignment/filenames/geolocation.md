# Filename Alignment: @flighthq/geolocation

**Verdict:** Clean. Single-implementation platform-suite capability (NOT a backend-variant package), so the plain domain-name rule applies — no backend prefix expected — and `geolocation.ts` self-describes its domain. Test colocated and mirrored; `index.ts` is a thin barrel.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `geolocation.ts` — domain file for the whole capability: current-position, watch, permission, the swappable backend seam (`get/set/createWebGeolocationBackend`), and `createGeoPosition`. The bare filename names its domain unambiguously. The web backend is folded in here as `createWebGeolocationBackend` rather than split into a `webGeolocation.ts`, which is correct for a capability this small (one backend, no cross-file weight).
- `geolocation.test.ts` — colocated `<source>.test.ts`, mirrors the source filename exactly.
- `index.ts` — thin `export * from './geolocation'` barrel; standard root entry, not a dumping ground.

No generic/grab-bag names (`data.ts`, `utils.ts`, `query.ts`, etc.) and no single-function-named files. As the capability grows (e.g. a dedicated native backend file), prefer a domain/object name such as `geoPosition.ts` for position math or `<host>Geolocation.ts` for a host backend — but at current scope a single `geolocation.ts` is the right shape.
