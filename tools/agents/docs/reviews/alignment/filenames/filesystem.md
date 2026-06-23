# Filename Alignment: @flighthq/filesystem

**Verdict:** Clean — single-implementation domain package (not a backend-variant), so no backend prefix applies; the lone source file `filesystem.ts` names the domain it covers, and its test is colocated correctly.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/filesystem.ts` — domain-named file covering the full filesystem capability surface (read/write text & binary, append, copy/rename/remove, directory make/read, stat, exists, watch, and the `*FileSystemBackend` seam). Passes the folder-removal test: the bare filename `filesystem.ts` is self-describing.
- `src/filesystem.test.ts` — colocated test mirroring `filesystem.ts`.
- `src/index.ts` — thin barrel re-export (`export * from './filesystem'`), not a dumping ground.

Notes:

- This is a host-integration command capability backed by a single swappable `FileSystemBackend` (web/OPFS default; native replaces it via `setFileSystemBackend`). It is NOT a `*-canvas` / `*-dom` / `*-gl` / `*-wgpu` backend-variant package, so the prefix-first rule (e.g. `glBlurFilter.ts`) does not apply — a plain domain name is correct here.
- The package keeps all ~17 exports in one domain file. This is fine at the current size; if the surface later splits along clear sub-domains (e.g. path/standard-directory helpers vs. file IO vs. the backend seam), domain/object-named files such as `fileSystemPath.ts` or `fileSystemBackend.ts` would be the natural division. No generic dumping-ground names (`data.ts`, `utils.ts`, `helpers.ts`) are present.
