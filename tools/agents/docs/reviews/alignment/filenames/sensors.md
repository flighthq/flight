# Filename Alignment: @flighthq/sensors

**Verdict:** Clean. This is a single-implementation event capability (not a backend-variant package, so no backend-token prefix rule applies); both source files carry the domain/object name `sensors` and the test mirrors its source exactly.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `index.ts` — barrel re-export (`export * from './sensors'`); the conventional package entry name.
- `sensors.ts` — names the domain/object (`Sensors`) for the whole capability: `createSensors`, `attachSensors`/`detachSensors`, `disposeSensors`, the `*SensorsBackend` seam (`get`/`set`/`createWeb`), `requestSensorsPermission`, and the `createMotionReading` / `createOrientationReading` value constructors. All exports belong to the one `sensors` domain, so a single domain-named file is correct — no per-function or backend split warranted.
- `sensors.test.ts` — colocated test, mirrors the `sensors.ts` source filename.
