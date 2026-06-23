# Filename Alignment: @flighthq/entity

**Verdict:** Clean — single-implementation domain package (not a backend-variant, so no backend prefix applies); all three source files name a domain/object (`entity`, `runtime`, `binding`), none names a single function, and tests are colocated and mirrored.

## Findings

| File   | Issue | Suggested rename |
| ------ | ----- | ---------------- |
| _none_ | —     | —                |

## Clean

- `entity.ts` — names the `Entity` object; holds `createEntity`. Self-describing without the folder.
- `runtime.ts` — names the `EntityRuntime` object; holds `createEntityRuntime` / `getEntityRuntime`. The basename is the domain, not one function.
- `binding.ts` — names the binding domain; holds `attachEntityBinding` / `getEntityBinding`. Two functions over one concept, correctly grouped by domain rather than per function.
- `index.ts` — thin barrel (`export * from` the three modules), not a dumping ground.
- Tests colocated as `entity.test.ts`, `runtime.test.ts`, `binding.test.ts`, each mirroring its source filename.
