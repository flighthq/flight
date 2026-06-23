# Filename Alignment: @flighthq/storage

**Verdict:** Clean. Single-implementation domain package (no `-canvas`/`-dom`/`-gl`/`-wgpu` variant, so no backend prefix applies); the lone source file is named after the `storage` domain it covers and carries the full command + backend-seam surface, not a single function.

## Findings

| File   | Issue | Suggested rename |
| ------ | ----- | ---------------- |
| _none_ | —     | —                |

## Clean

- `storage.ts` — names the domain. Holds the entire storage surface (`getStorageItem`, `setStorageItem`, `removeStorageItem`, `clearStorage`, `getStorageKeys`) plus the backend seam (`getStorageBackend`, `setStorageBackend`, `createWebStorageBackend`). A domain name, not a per-function file. Correct for a single-implementation domain package.
- `storage.test.ts` — colocated test mirroring `storage.ts` exactly.
- `index.ts` — thin barrel (`export * from './storage'`), the single root entry. Not a dumping ground.
