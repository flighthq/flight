# Filename Alignment: @flighthq/sdk

**Verdict:** Clean. Not a backend-variant package — it is the convenience barrel; its sole source file is the root `index.ts` re-exporting every package, which is the canonical, correct name for a barrel entry (no domain/object file naming applies).

## Files under `src/`

- `index.ts`
- `index.test.ts`

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `index.ts` — The barrel root entry. This is the one file convention that legitimately uses `index`: the package's single job is to be the SDK aggregation point (`export * from '@flighthq/*'` for all 80 packages). It is not an "index-as-dumping-ground" — it contains no logic, only re-exports, matching the project rule to keep the barrel "a thin re-export." Renaming it would break the package's `.` entry resolution.
- `index.test.ts` — Colocated test, correctly mirroring the `index.ts` source filename.
