# Dependency Alignment: @flighthq/shell

**Verdict:** Clean — a single `import type { ShellBackend }` from `@flighthq/types`, correctly declared and pinned `*`; no unused, phantom, or surprising edges; nothing to fix.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| — | `@flighthq/types` | No issues. Only declared runtime dep; used as `import type` for `ShellBackend`; pinned `*`. | None |

Checklist results (all pass):

- **No `@flighthq/sdk` import** — confirmed; the only `@flighthq` import in `src/` (both `shell.ts` and `shell.test.ts`) is `@flighthq/types`.
- **Cross-package types in `@flighthq/types`** — `ShellBackend` is defined in `packages/types/src/Shell.ts` and imported, not redefined inline. No inline cross-package types.
- **Declared deps minimal and correct** — exactly one dep (`@flighthq/types`), and it is used. No used-but-undeclared deps (no other imports exist). Workspace dep pinned `"*"`.
- **Layering** — this is a platform-suite command capability; depending only on the header layer (`@flighthq/types`) is exactly the expected shape. The concrete native adapter (`createElectronShellBackend`) lives in `@flighthq/host-electron`, not here, so there is no host coupling and no cross-backend edge.
- **type-only import / tree-shakable** — `ShellBackend` imported via `import type` on its own line, so it pulls zero runtime weight; `"sideEffects": false` is declared and the source has no top-level side effects (the default web backend is built lazily inside `getShellBackend`, not at module load).
- **Mapping reads cleanly** — a reader can predict the dep set from the package purpose: an OS-shell command seam over a swappable backend depends only on the backend interface in the header. No surprising edges.

`npm run packages:check` passes (`86 packages and 16 examples valid`); this audit adds the judgment that the single declared edge is also the _correct minimal_ edge and that lazy backend construction keeps the `sideEffects: false` claim honest.

## Declared vs used

- **Declared:** `@flighthq/types` (dependencies), `typescript` (devDependencies).
- **Used:** `@flighthq/types` (`ShellBackend`, type-only) in `src/shell.ts` and `src/shell.test.ts`.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none.
