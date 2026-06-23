# Filename Alignment: @flighthq/share

**Verdict:** Clean — single-implementation platform-capability package (not a backend-variant), so no backend prefix applies; the lone source file `share.ts` names the package domain and its colocated test mirrors it.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/share.ts` — Names the package domain (`share`), the object every export operates over (`ShareContent` / `ShareBackend`). Holds the full capability surface (`shareContent`, `canShareContent`, `getShareBackend`, `setShareBackend`, `createWebShareBackend`) rather than being named after one function, so it passes the folder-removal test. Single-implementation domain, no backend token needed.
- `src/share.test.ts` — Colocated test mirroring `share.ts` exactly.
- `src/index.ts` — Thin barrel (`export * from './share'`); a standard entry point, not a dumping ground.
