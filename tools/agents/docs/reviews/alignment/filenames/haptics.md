# Filename Alignment: @flighthq/haptics

**Verdict:** Clean. This is a single-implementation platform-integration package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so the plain domain name `haptics.ts` is correct and needs no backend prefix.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/haptics.ts` — names the domain (haptics). Holds the whole capability surface (`vibrateDevice`, `triggerHapticImpact`/`Notification`/`Selection`, plus the `createWebHapticsBackend`/`get`/`set` backend seam), so it is a domain file, not a one-function file. Self-describing with the folder removed.
- `src/haptics.test.ts` — colocated test, mirrors the source filename exactly.
- `src/index.ts` — thin barrel (`export * from './haptics'`), the standard single-entry re-export. Not a dumping ground.
