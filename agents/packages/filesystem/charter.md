---
package: '@flighthq/filesystem'
crate: flighthq-filesystem
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# filesystem — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Host file system access: read/write/append text and binary files, directory CRUD, stat/metadata, recursive traversal and glob, ranged and streaming I/O, atomic write, symlink/permissions seam, disk-usage introspection, pure path utilities, and a file-watch callback — each delegating to a swappable `FileSystemBackend`. A fully implemented OPFS web default ships in-crate, guards every API touch, and returns sentinels (`null`/`[]`/`false`) in unsupported environments. The only platform-suite package that imports a sibling (`@flighthq/dialog`) — for 4 bridge functions (`read/writeDialogHandle*File`) that consume dialog's `FileDialogHandle`. Six pure path utilities (`joinPath`, `getBaseName`, `getDirName`, `getExtName`, `normalizePath`, `isAbsolutePath`) have zero backend dependency.

## Decisions

- **[2026-07-02] Path utils stay in filesystem.** The 6 pure path utilities have no backend dependency and could be extracted to `@flighthq/path`, but they map to native filesystem code in the Rust port (`std::path`) and belong here. Extract only if a second consumer outside filesystem needs them.
- **[2026-07-02] The `@flighthq/dialog` dependency is acceptable.** File dialogs are filesystem-adjacent — the 4 bridge functions that read/write a `FileDialogHandle` justify the coupling. This is the only sanctioned sibling-to-sibling dependency in the platform suite.

## Open directions

1. **File-watch shape.** `watchPath` is a bare callback today (web no-op) — the one capability whose shape is below the suite's event-capability convention. Promoting it to a `FileSystemWatch` event entity (recursive watch, debounce/coalesce) adds a `@flighthq/signals` dependency and reshapes a contract no native host has committed to yet.
2. **Naming reshape window.** `renameFile` also moves directories; `findFiles` returns directory entries. Candidates for `renamePath` / `findPaths` before native hosts exist.
