# Filename Alignment: @flighthq/power

**Verdict:** Clean. `@flighthq/power` is a single-implementation domain package (a swappable web/native backend lives behind `PowerBackend`, but it is not a `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` backend-variant package, so no backend filename prefix applies). All source files take the plain domain name `power` and pass the folder-removal test.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `index.ts` — barrel re-export (`export * from './power'`); conventional package entry.
- `power.ts` — names the domain, not a function. Holds the entire power domain in one cohesive cell: the `Power` event entity, `PowerStatus`, the `PowerBackend` seam (`createWebPowerBackend`, `get/setPowerBackend`), attach/detach/dispose wiring, status snapshot, and keep-awake. `power` is self-describing with the folder removed.
- `power.test.ts` — colocated test, basename mirrors `power.ts`.
