# Filename Alignment: @flighthq/shell

**Verdict:** Clean. This is a single-implementation platform-integration package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so plain domain names with no backend prefix are correct; `shell.ts` names the domain it covers (the whole web/native shell-integration seam) and its test mirrors it.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

`shell.ts` holds the entire capability — backend seam (`createWebShellBackend`, `getShellBackend`, `setShellBackend`) plus the flat command functions (`openExternalUrl`, `openShellPath`, `showItemInFolder`, `moveItemToTrash`, `shellBeep`). It names the `shell` domain, not any one function, and passes the test: stripped of its folder, `shell.ts` is self-describing for a package named `shell`. No generic dumping-ground names (no `data.ts` / `utils.ts` / `helpers.ts`). No backend prefix is warranted — `shell` is a single-implementation domain, and the web/native split is a runtime backend seam, not a build-variant package.

## Clean

- `index.ts` — thin barrel (`export * from './shell'`); standard root entry, not a content file.
- `shell.ts` — domain-named source covering the full shell capability.
- `shell.test.ts` — colocated test mirroring the `shell.ts` source filename exactly.
