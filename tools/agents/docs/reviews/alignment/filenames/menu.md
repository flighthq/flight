# Filename Alignment: @flighthq/menu

**Verdict:** Clean. Single-implementation platform-capability package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so no backend prefix is required; the lone `menu.ts` is a self-describing domain name covering the whole capability (templates, app menu, context menu, backend seam, select events).

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

`menu.ts` holds the full menu domain — `createMenuItemTemplate`, `createWebMenuBackend`, `getMenuBackend`/`setMenuBackend`, `setApplicationMenu`, `showContextMenu`, `onMenuSelect`. It names the domain, not a single function, and passes the folder-removal test: a bare `menu.ts` is instantly self-describing. As the package grows (separate context-menu vs application-menu surfaces, descriptor builders, a native backend file) a future split into domain/object names like `menuItemTemplate.ts`, `applicationMenu.ts`, `contextMenu.ts`, and `menuBackend.ts` may be warranted, but the current single-file shape is correct for the present surface.

## Clean

- `index.ts` — barrel re-export (`export * from './menu'`), conventional and correct.
- `menu.ts` — domain-named file covering the entire menu capability; not a one-function file, no generic/dumping-ground name.
- `menu.test.ts` — colocated test mirroring `menu.ts` exactly.
