---
package: '@flighthq/filesystem'
updated: 2026-07-13
basedOn: ./review.md
---

# filesystem — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

1. **Resolve `..` segments in `normalizeFilePath` / `joinFilePath`** — `splitWebPath` filters only `''` and `'.'`, so `normalizeFilePath('a/b/../c')` keeps the `..` literally. Textbook normalize resolves parent segments (without escaping a relative root); pure within-package change to utilities the charter has already ruled stay here — review.md Gaps #3. (Windows `\` handling stays a Backlog design call.)
2. **Seam-doc note on `requestPermission`-free sentinels** — n/a; no other sweep-safe items. `removeFile`/`removeDirectory` verb split, dialog bridge, and streaming are landed and verified in source (2026-07-13).

## Approved

None.

## Backlog

- **`watchPath` → event-capability reshape** — charter Open direction #1; adds a `@flighthq/signals` dependency and reshapes a contract no native host has committed to. Design-gated.
- **Bulk directory operations** (`copyDirectory`, `moveDirectory`, `emptyDirectory`, `getDirectorySize`) — each needs a seam decision (backend-native method vs composed-over-walk); review.md Candidate open direction #2.
- **Locking / OPFS sync-access-handle tier** (`lockFile`/`releaseFileLock` brackets, `createSyncAccessHandle`) — sizable scope, new seam members.
- **`findFiles` / `renameFile` naming reshape** (`findPaths` / `renamePath`) — charter Open direction #2; a rename is direction-session territory, not a sweep.
- **Windows path handling** (`\` separators, UNC) in the pure path utilities — design call on POSIX-only vs Windows-aware convention.
- **Text-encoding options / BOM handling** on text I/O — seam signature change.
- **`@flighthq/filesystem-formats` archive-as-backend** (zip/tar mounted through `FileSystemBackend`) — held at the plurality guard.
- **Diagnostics layer** (`explain*` queries, `enable*Guards`) — suite-wide pattern; should land as one coordinated platform-suite decision, not per-cell.
- **Rust mirror `flighthq-filesystem`** — path utilities first; separate repo track.
- **Record the file/directory verb split as a charter Decision** — direction-session item (charter edits are the user's gate).
