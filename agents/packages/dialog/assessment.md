# dialog — Assessment

See [charter](./charter.md) for blessed direction.

## Recommended

Sweep-safe changes. Builder-ready.

1. **Fix `buildFileSystemAccessTypes` empty-accept edge case** — an all-wildcard filter group yields `{ accept: {} }`, which the File System Access API rejects (degrading silently to `[]`). Add a guard that detects empty accept maps and either omits the type entry or falls back to the wildcard form, and pin the behavior with a test.

## Approved

1. **Fix `buildFileSystemAccessTypes` empty-accept edge case** [2026-07-02 · blanket "platform integration suite sweep"]

## Backlog

None.
