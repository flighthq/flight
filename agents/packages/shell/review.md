---
package: '@flighthq/shell'
status: solid
score: 95
updated: 2026-08-30
ingested:
  - packages/shell/src (live)
  - packages/types/src/Shell.ts (live)
  - packages/types/src/Host.ts (live)
  - packages/host-web/src/webShell.ts
  - packages/host-electron/src/electronShell.ts
  - packages/host-tauri/src/tauriShell.ts
---

# shell — Review

This review supersedes the 2026-07-13 aggregate-backend review while preserving its findings in git
and the package status log. Evidence is the live explicit-Host implementation named above.

## Verdict

`solid` — 95/100. Shell is a bedrock command domain whose provider coverage is now truthful by
construction. Six independent Entity slots replace one nine-method aggregate: Web claims external;
Electron claims external/path-open/path-reveal/trash/beep plus shortcut-link only for an injected
Windows platform; Tauri claims external/path-open/path-reveal; Capacitor claims none. There is no
ambient resolver, sentinel, diagnostic observation, enabler/reset, or unsupported provider method.

## Present capabilities

- **Core API — nine functions.** `isShellUrlAllowed`, `moveShellItemToTrash`,
  `moveShellItemsToTrash`, `openShellExternalUrl`, `openShellPath`, `readShellShortcutLink`,
  `revealShellPath`, `shellBeep`, and `writeShellShortcutLink`. Every operation takes the narrow
  `HasShell*` trait it needs.
- **Security contract.** `openShellExternalUrl` requires a policy argument with allowed schemes. Pure
  validation runs before provider dispatch; malformed and blocked schemes return `blocked-scheme`.
  There is no default and especially no allow-all state.
- **Outcome fidelity.** External calls distinguish popup blocking from host failure. Path-open uses one
  outcome whose failure carries the provider message, so an empty rejection cannot equal success.
  Trash batches are ordered core projections that start and await every one-item call. Shortcut read
  and write have separate outcome types.
- **Ownership.** All retained providers and all four Host values are Entities. The six provider types
  declare no whole-provider destroy because every command is bounded; the lifecycle collector asserts
  exactly those zero-teardown rows.

## Structural proof

Corrective tests cover explicit policy-before-dispatch, Web popup-null, Electron/Tauri empty rejection,
ordered all-awaited batch projection, two-Host isolation, injected Windows/non-Windows construction,
exact Web/Electron/Tauri/Capacitor slot subsets, Entity identity, and forbidden ambient/enabler/stub/
ignored-option absence. Host-probe now traverses `Host.shell` instead of an ambient selector.

## Remaining gap

Only the charter directions remain: ownership of `getFileIcon`, and a portable policy for untrusted
local paths. The implemented six-slot surface has no known contract or provider gap.
