# Filename Alignment: @flighthq/path

**Verdict:** Aligned. `@flighthq/path` is a single-implementation domain package (vector path geometry), NOT a backend-variant package, so plain domain/object filenames are correct and no backend prefix applies. All three source files are self-describing; the two operation files (`flattenPath.ts`, `tessellatePath.ts`) name distinct path-processing domains over the `Path` object, not generic single-function dumping grounds.

## Findings

| File | Issue | Suggested rename |
| --- | --- | --- |
| `flattenPath.ts` | Borderline only: filename matches its single exported function `flattenPath`. Acceptable here because the basename names a distinct path-processing domain (curve flattening over `Path`) and is self-describing with the folder removed. No change required. | (keep) |
| `tessellatePath.ts` | Borderline only: filename matches its single exported function `tessellatePath`. Acceptable for the same reason — names the tessellation domain over `Path`, self-describing standalone. No change required. | (keep) |

## Clean

- `path.ts` — names the `Path` object/domain; holds the entity constructor `createPath` plus the `appendPath*` builders. Exemplary object-named file.
- `flattenPath.ts` / `tessellatePath.ts` — self-describing operation-over-object names; pass the "remove the folder" test (`flattenPath.ts` reads unambiguously as path flattening). Each is a legitimate path-processing domain, not a generic name (no `data.ts` / `utils.ts` / `helpers.ts` here).
- `index.ts` — thin barrel re-exporting the three modules only; not a dumping ground.
- Tests colocated and mirrored: `path.test.ts`, `flattenPath.test.ts`, `tessellatePath.test.ts`.
- No generic/ambiguous filenames; no missing or suffix-style backend tokens (none expected in a single-implementation package).
