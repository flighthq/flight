# Filename Alignment: @flighthq/dialog

**Verdict:** Clean. This is a single-implementation platform "command" capability (not a backend-variant `*-canvas/-dom/-gl/-wgpu` package), so the prefix-first backend-token rule does not apply; `dialog.ts` is a correct plain domain name and the package is the disambiguator.

## Files under src/

- `dialog.ts`
- `dialog.test.ts`
- `index.ts`

## Findings

| File | Issue      | Suggested rename |
| ---- | ---------- | ---------------- |
| —    | No issues. | —                |

## Clean

- **`dialog.ts`** — Names the domain ("dialog"), not a single function, even though it holds the whole capability (backend seam `createWebDialogBackend`/`getDialogBackend`/`setDialogBackend` plus the `show*Dialog` commands). Passes the folder-removal test: `dialog.ts` is self-describing. The in-package `createWebDialogBackend` web default is the canonical command-capability shape, not a reason to split into a backend-variant file.
- **`dialog.test.ts`** — Colocated, mirrors `dialog.ts` exactly.
- **`index.ts`** — Standard thin barrel (`export * from './dialog'`); expected and acceptable, not a dumping ground.
