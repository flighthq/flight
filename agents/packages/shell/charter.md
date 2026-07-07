---
package: '@flighthq/shell'
crate: flighthq-shell
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shell — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

OS shell integration as a flat command-capability cell: launching external URLs and files in their default OS handler, revealing an item in the OS file manager, moving files to the trash, reading and writing Windows shortcut links, the system beep, and a URL-scheme safety allowlist — over a swappable `ShellBackend`. The canonical reference is Electron's `shell` module. The boundary against neighbors: `shell` opens and reveals items by handing them to the OS; it is not a file reader/writer (`@flighthq/filesystem`), not a dialog surface (`@flighthq/dialog`), and not a URL-scheme registrar (`@flighthq/protocol`).

## Decisions

- **[2026-07-02] Rename `openExternalUrl` to `openShellExternalUrl`.** Naming is inconsistent: `openExternalUrl` lacks the `Shell` subject prefix used by `openShellPath` and other exports. Rename for consistency with the suite-wide naming convention (full, unabbreviated subject name in every export).

## Open directions

1. **`getFileIcon` scope.** In-scope here (pulling an `ImageSource` / native-image dependency into the seam) or deferred to a dedicated `@flighthq/nativeimage` cell?
2. **Error-fidelity boundary.** Is a bare boolean acceptable for batch trash and shortcut write, or is the `*Result` (OS-error-string) sibling part of the definition of done?
