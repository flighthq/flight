---
package: '@flighthq/filesystem'
role: package
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

Host file system access: read/write/append text and binary files, directory CRUD, stat/metadata, recursive traversal and glob, ranged and streaming I/O, atomic write, symlink/permissions seam, disk-usage introspection, pure path utilities, and a file-watch callback. Backend-dependent operations take an explicit `HasStorageFileSystem` Host witness. `webFileSystemBackend` owns the 21 genuine OPFS operations, while Capacitor publishes only the shared basic subset its plugin can perform. Symlink, permissions, real-path, watch, and well-known-path operations are deliberately absent from host providers; the capability package owns their documented `null`/`false`/empty sentinels. The only platform-suite package that imports a sibling (`@flighthq/dialog`) — for 4 bridge functions (`read/writeDialogHandle*File`) that consume dialog's `FileDialogHandle`. Six pure path utilities (`joinPath`, `getBaseName`, `getDirName`, `getExtName`, `normalizePath`, `isAbsolutePath`) have zero backend dependency.

## Decisions

- **[2026-07-02] Path utils stay in filesystem.** The 6 pure path utilities have no backend dependency and could be extracted to `@flighthq/path`, but they map to native filesystem code in the Rust port (`std::path`) and belong here. Extract only if a second consumer outside filesystem needs them.
- **[2026-07-02] The `@flighthq/dialog` dependency is acceptable.** File dialogs are filesystem-adjacent — the 4 bridge functions that read/write a `FileDialogHandle` justify the coupling. This is the only sanctioned sibling-to-sibling dependency in the platform suite.
- **[2026-08-30] Host selection is explicit and provider shapes are honest.** Ambient get/set/install/explain state and the host-Web enabler are gone. A missing provider method is structurally absent and composes with the package-owned documented result rather than an inert host method.

## Open directions

1. **File-watch shape.** `watchPath` is a bare callback today (web no-op) — the one capability whose shape is below the suite's event-capability convention. Promoting it to a `FileSystemWatch` event entity (recursive watch, debounce/coalesce) adds a `@flighthq/signals` dependency and reshapes a contract no native host has committed to yet.
2. **Naming reshape window.** `renameFile` also moves directories; `findFiles` returns directory entries. Candidates for `renamePath` / `findPaths` before native hosts exist.
