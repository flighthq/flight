# Dependency Alignment: @flighthq/filesystem

**Verdict:** Clean — a model platform-suite cell: one type-only runtime dep on the header, no phantom/unused deps, no boundary violations.

`npm run packages:check` passes (86 packages valid) and reports nothing for this package. The findings below are judgment beyond that gate.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Sole runtime dep, pinned `"*"`, imported `import type`-only in both source and test. All five cross-package types (`FileEntry`, `FileStat`, `FileSystemBackend`, `FileSystemPathKind`, `FileWatchEvent`) are defined in `@flighthq/types/src/FileSystem.ts`, not redefined inline. | None. |
| None (note) | `lib.dom` ambient types | The web (OPFS) backend uses `navigator`, `FileSystemDirectoryHandle`, `FileSystemFileHandle`, `FileSystemWriteChunkType` — all ambient `lib.dom` globals, no package dependency required. Correctly not declared. | None. |

Confirmed against the checklist:

- No import of `@flighthq/sdk`.
- No inline cross-package types — the header layer owns all of them.
- Declared deps minimal and correct: no unused, no phantom; workspace dep pinned `"*"`.
- Layering respected: a command-style platform capability depending only on the header is exactly the predicted shape. No sibling-host, cross-capability, or "reach up a layer" edges.
- Type-only import pulls no runtime weight; `"sideEffects": false` holds, package is runtime-self-contained.
- Dependency mapping reads cleanly: a reader can predict `@flighthq/types` and nothing else from the package's purpose.

## Declared vs used

- **Unused declared deps:** none. (`@flighthq/types` is used; `typescript` is a legitimate build-only devDependency.)
- **Phantom (used-but-undeclared) deps:** none. The only `@flighthq/*` import is `@flighthq/types`, which is declared; all other identifiers are `lib.dom` ambient types.
