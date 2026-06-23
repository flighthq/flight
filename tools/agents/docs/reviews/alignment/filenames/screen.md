# Filename Alignment: @flighthq/screen

**Verdict:** Clean. Single-implementation platform-integration package (NOT a backend-variant `*-canvas/-dom/-gl/-wgpu` package — the web/native backend seam lives inside `screen.ts` via `setScreenBackend`, so no backend-token filename prefix applies). The lone source file `screen.ts` names the package domain, and the test mirrors it.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

`index.ts` is the package barrel (`export * from './screen'`), not a dumping ground, so it is exempt from the generic-name rule.

## Clean

| File | Why |
| --- | --- |
| `screen.ts` | Names the package domain (screen/display enumeration). Holds the full domain surface — `createScreenInfo`, `createWebScreenBackend`, `getScreens`, `getPrimaryScreen`, `getScreenBackend`/`setScreenBackend`, `onScreenChange`. Self-describing with the folder removed. |
| `screen.test.ts` | Colocated, mirrors `screen.ts` exactly. |
| `index.ts` | Thin barrel re-export; expected name for a package entry. |
