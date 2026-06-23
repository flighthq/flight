# Dependency Alignment: @flighthq/dialog

**Verdict:** Clean — the sole dependency (`@flighthq/types`, pinned `"*"`) is used, type-only, and exactly what a header-only command capability should declare; nothing to fix.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| — | (none) | No `@flighthq/sdk` import; no inline cross-package types; no phantom or unused deps; no boundary violations. | — |
| Info | `@flighthq/types` | All five dialog types (`DialogBackend`, `MessageDialogOptions`, `MessageDialogResult`, `OpenFileDialogOptions`, `SaveFileDialogOptions`) are sourced from the header layer (`packages/types/src/Dialog.ts`), imported via `import type`, so they pull no runtime weight. `"sideEffects": false` holds — the `_backend` singleton is lazily created, not initialized at module top level. | — |
| Info | mapping legibility | Edge set is fully predictable from the package's role: a command-style platform capability over a swappable backend seam depends only on the header. The concrete adapter (`createElectronDialogBackend`) correctly lives in `@flighthq/host-electron`, not here. | — |

## Declared vs used

- **Declared:** `@flighthq/types` (`"*"`, runtime dep) — _used_ (type-only import in `dialog.ts` and `dialog.test.ts`). `typescript` (devDep) — expected.
- **Used but undeclared (phantom):** none. The only imports in `src/` are from `@flighthq/types`; all other references are to web platform globals (`window`, `document`).
- **Declared but unused:** none.
- **Workspace pin:** `@flighthq/types` correctly pinned `"*"`.

`npm run packages:check` passes (86 packages, 16 examples valid); this review adds the import↔declaration cross-check and the type-only / mapping-legibility judgment beyond it.
