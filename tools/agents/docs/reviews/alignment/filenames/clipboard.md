# Filename Alignment: @flighthq/clipboard

**Verdict:** Clean. Single-implementation host-integration package (not a backend-variant `*-canvas`/`*-dom`/`*-gl`/`*-wgpu` package), so no backend prefix applies; the lone source file is named after the package domain (`clipboard`) and is self-describing with the folder removed.

## Findings

| File     | Issue | Suggested rename |
| -------- | ----- | ---------------- |
| _(none)_ | —     | —                |

## Clean

- `src/index.ts` — standard barrel; sole line is `export * from './clipboard'`, not a dumping ground.
- `src/clipboard.ts` — names the package domain. Holds the full clipboard surface (read/write text/HTML/RTF/image/bookmark, `has*`, `clearClipboard`, and the backend seam `get/set/createWebClipboardBackend`). Not named after a single function. Passes the folder-removal test: "clipboard" still names the domain.
- `src/clipboard.test.ts` — colocated, mirrors `clipboard.ts` exactly.
