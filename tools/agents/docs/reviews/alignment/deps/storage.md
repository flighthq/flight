# Dependency Alignment: @flighthq/storage

**Verdict:** Clean — the single declared dependency (`@flighthq/types`) is exactly the one imported, pinned `"*"`, type-only, and the package is side-effect-free and tree-shakable.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Only runtime dep; imported via `import type { StorageBackend }`, pinned `"*"`. Correct. | — |
| None | `@flighthq/sdk` | Not imported (correct — no barrel dependency). | — |
| None | `StorageBackend` | Defined in `@flighthq/types` (`packages/types/src/Storage.ts`), not redefined inline. | — |
| Info | (general) | `sideEffects: false` is accurate: the lone module variable `_backend` is lazily initialized inside `getStorageBackend`, with no top-level registration, listener, or global mutation. The `Storage`/`window` references are ambient DOM lib types, not package deps. | — |

The dependency mapping reads exactly as predicted from the package's role: a capability-seam package over a `*Backend` trait needs only the header layer (`@flighthq/types`) and nothing else. No layering violations, no surprising edges, no cross-backend reach.

## Declared vs used

- **Unused declared deps:** none. `@flighthq/types` is used by `storage.ts` and `storage.test.ts`.
- **Phantom (used-but-undeclared) deps:** none. The only `@flighthq/*` import is `@flighthq/types`, which is declared.
- **devDependencies:** `typescript ^5.3.0` — present and used by the `build`/`clean` tsc scripts.
- **`npm run packages:check`:** passes (86 packages, 16 examples valid); no storage-specific findings beyond it.
