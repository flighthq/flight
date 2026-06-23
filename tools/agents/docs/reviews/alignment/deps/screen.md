# Dependency Alignment: @flighthq/screen

**Verdict:** Clean — a single type-only edge to `@flighthq/types`, correctly pinned, no phantom/unused deps, no boundary or barrel violations; nothing to fix.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (dependency) | Sole runtime dep; used only as `import type { ScreenBackend, ScreenInfo }` in `screen.ts`. Pinned `"*"` per workspace convention. Correct and minimal. | — |
| Info | `WebScreenOrientation` (local interface in `screen.ts`) | Package-private structural shape for the web `screen.orientation` DOM seam. Single-consumer, web-backend-only, not a cross-package contract — correctly kept local rather than pushed to `@flighthq/types`. | — |
| Info | No `@flighthq/sdk` import; `"sideEffects": false`; lazy `_backend` created via `getScreenBackend()`, no top-level registration | Conforms to barrel, tree-shaking, and side-effect-free import rules. Dependency mapping reads exactly as expected for a platform-suite command capability (header + native-backend seam). | — |

`npm run packages:check` passes (86 packages valid); it adds nothing beyond the above. Judgment confirms the package is at the floor: one type-only header dependency, which is the minimum a platform-suite command capability can have.

## Declared vs used

- **Declared:** `@flighthq/types` (dep), `typescript` (devDep).
- **Used:** `@flighthq/types` — imported type-only in `src/screen.ts` and `src/screen.test.ts`.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. `window`, `Screen`, `HTMLElement`, etc. are DOM lib globals, not packages.
