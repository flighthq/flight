---
package: '@flighthq/shell'
role: package
crate: flighthq-shell
draft: false
lastDirection: 2026-08-30
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# shell — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

OS shell integration as six explicit Host command capabilities: external URLs, local-path opening,
path reveal in the file manager, trash, Windows shortcut links, and the system beep. Free functions
take the narrow `HasShell*` trait they need; every provider is an Entity and a missing optional slot is
capability absence, never a sentinel implementation. The boundary against neighbors is unchanged:
Shell hands URLs and paths to the OS, but does not read/write file contents (`@flighthq/filesystem`),
show dialogs (`@flighthq/dialog`), or register URL schemes (`@flighthq/protocol`).

## Decisions

- **[2026-07-02] Rename `openExternalUrl` to `openShellExternalUrl`.** Naming is inconsistent: `openExternalUrl` lacks the `Shell` subject prefix used by `openShellPath` and other exports. Rename for consistency with the suite-wide naming convention (full, unabbreviated subject name in every export).
- **[2026-08-30] Six explicit Host slots replace the aggregate.** `Host.shell` is a required group with
  optional `external`, `pathOpen`, `pathReveal`, `trash`, `shortcutLink`, and `beep` slots. Coverage is
  exact: Web external; Electron every slot except shortcut links off Windows; Tauri external/path-open/
  path-reveal; Capacitor empty. Providers and Hosts are Entities; bounded commands own no provider-wide
  destroy hook.
- **[2026-08-30] External URL policy is a required call dependency.** Every
  `openShellExternalUrl(host, url, policy)` call names its allowed schemes. Pure validation runs before
  dispatch. No default, allow-all sentinel, ambient allowlist, or policy setter exists.
- **[2026-08-30] Outcomes are awaited, named, and method-tight.** External distinguishes `ok`,
  `blocked-scheme`, `popup-blocked`, and `operation-failed`; path-open retains a provider failure message;
  reveal/trash/shortcut-write report their narrower reasons; shortcut-read carries either a link or
  failure message. Batch trash is a core ordered projection of the one-item provider operation.

## Open directions

1. **`getFileIcon` scope.** In-scope here (pulling an `ImageSource` / native-image dependency into the seam) or deferred to a dedicated `@flighthq/nativeimage` cell?
2. **Untrusted local-path policy.** URL schemes now require explicit policy, but safely constraining local
   paths needs a canonicalization design covering separators, symlinks, and platform roots before it can
   be a portable Shell dependency.
