# Filename Alignment: @flighthq/tray

**Verdict:** Clean. Single-implementation platform-integration package (not a backend-variant, so no backend prefix is required); the lone source file `tray.ts` names its domain and passes the folder-removal test.

## Source files under `src/`

- `index.ts` — barrel (`export * from './tray'`)
- `tray.ts` — all exported functions
- `tray.test.ts` — colocated test mirroring `tray.ts`

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

All functions (`createTrayIcon`, `createWebTrayBackend`, `destroyTrayIcon`, `getTrayBackend`, `onTrayEvent`, `setTrayBackend`, `setTrayContextMenu`, `setTrayIconTitle`, `setTrayIconTooltip`) operate over the tray domain and the single `TrayIcon`/`TrayBackend` object, so consolidation into one `tray.ts` is appropriate — `tray.ts` names the domain, not one function.

## Clean

- `tray.ts` — names the tray domain; self-describing with the folder removed. Holds the entity (`TrayIcon`), the backend seam (`*TrayBackend`), and the command/event API. Correctly unprefixed: this is a single-implementation platform cell (web default in-package, native via `@flighthq/host-electron`'s `createElectronTrayBackend`), not a `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` backend-variant package.
- `index.ts` — thin barrel re-export, the standard package entry; not a dumping ground.
- `tray.test.ts` — colocated, mirrors `tray.ts` exactly.
