# Filename Alignment: @flighthq/statusbar

**Verdict:** Clean — single-implementation platform capability (not a backend-variant package), so no backend prefix applies; the lone source file `statusbar.ts` names its domain and the test mirrors it.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `statusbar.ts` — names the domain (status bar style/visibility/color + the swappable backend). This is a command-style platform capability with one web default backend living in the same domain file, so a backend prefix would be wrong; a plain domain name is correct.
- `statusbar.test.ts` — colocated, mirrors `statusbar.ts`.
- `index.ts` — thin barrel (`export * from './statusbar'`), the conventional package entry, not a dumping ground.
