# Dependency Alignment: @flighthq/ipc

**Verdict:** Clean — a single type-only dependency on `@flighthq/types`, correctly pinned and fully used; nothing to fix.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (`*`) | Sole runtime dependency; used as a type-only import (`import type { IpcBackend }`) in both `ipc.ts` and `ipc.test.ts`. Pinned `"*"` per workspace convention, declared correctly. | — |
| Info | (mapping) | `IpcBackend` is the cross-package backend-seam contract and correctly lives in `@flighthq/types` (`packages/types/src/Ipc.ts`), not redefined inline. The test's `FakeIpcBackend extends IpcBackend` reuses the header type rather than shadowing it. | — |
| Info | (layering) | No edges to `@flighthq/sdk`, no host adapter coupling, no reach across boundaries. `@flighthq/host-electron` provides the native backend via `createElectronIpcBackend`, but the dependency points host → ipc, never ipc → host. The edge set reads exactly as a reader would predict from a backend-seam capability package. | — |

## Declared vs used

- **Unused declared deps:** none. `@flighthq/types` is the only dependency and is imported. `typescript` (devDependency) is the build toolchain.
- **Phantom (used-but-undeclared) deps:** none. The only non-relative import in `src/` is `@flighthq/types`; the only other import is the relative `./ipc`.
- **Pinning:** `@flighthq/types` is pinned `"*"` as required for workspace deps. `"sideEffects": false` is declared and honored — the package is pure functions plus one lazily-initialized module-local backend variable, no top-level side effects, so it stays tree-shakable.
