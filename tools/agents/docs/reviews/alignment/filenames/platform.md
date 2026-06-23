# Filename Alignment: @flighthq/platform

**Verdict:** Clean — single-implementation domain package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package, so no backend token prefix applies); the lone source file `platform.ts` names the domain it covers, and the test mirrors it.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/platform.ts` — names the package's single domain (platform identification: detection, the `*PlatformBackend` seam, and the `getPlatform*`/`isPlatform*` accessors). Not a one-function file; it holds the whole domain's surface. No generic-name smell (no `data`/`utils`/`format`/`query`). No backend prefix needed — this is a single-implementation domain, not a backend variant.
- `src/index.ts` — thin barrel (`export * from './platform'`), the expected root entry. Acceptable index usage, not a dumping ground.
- `src/platform.test.ts` — colocated test, basename mirrors `platform.ts`.
