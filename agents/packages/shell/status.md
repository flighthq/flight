---
package: '@flighthq/shell'
updated: 2026-08-08
by: principal
---

# shell — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/shell/src/`, `packages/types/src/Shell.ts`, and the
`host-*` packages on 2026-08-08. A file:line here is a claim about this tree, not about a session.

- **The exported names are split between two conventions and the split is unruled.**
  `moveItemToTrash` (`shell.ts:83`), `moveItemsToTrash` (`:78`), and `showItemInFolder` (`:135`) carry
  no domain prefix, while `openShellPath` (`:99`), `shellBeep` (`:130`), and `getShellBackend` (`:59`)
  do. The unprefixed three are Electron-canonical on purpose, but the design constraint asks for
  globally self-identifying names, so this needs a recorded ruling before the surface freezes.
- **`ShellOpenPathOptions` is accepted by the public API and dropped by every host.** Both native
  backends take the path alone — `electronShell.ts:17` and `tauriShell.ts:19` — so
  `workingDirectory` and `application` reach nothing. Electron's `openPath` genuinely cannot express
  them; Tauri's opener could (`openWith`), and does not.
- **No `*Result` sibling for the batch/write paths.** `moveItemsToTrash` returns a boolean per path
  (`shell.ts:78`) and `writeShellShortcutLink` a bare boolean (`:143`), so a per-item OS error is
  unrecoverable. `openShellPathResult` (`:106`) is the shape these would follow.
- **The allowlist covers URLs only.** `setShellUrlSchemeAllowlist` (`shell.ts:125`) and
  `isShellUrlAllowed` (`:66`) gate `openShellExternalUrl`, but `openShellPath` has no equivalent
  gate — a host embedding untrusted content can open any local path. A path-prefix allowlist needs a
  canonicalization design (separators, symlink resolution) before it can be built.
- **The Tauri backend realizes only the opener half of the seam.** It reports contract sentinels for
  trash, Windows `.lnk` read/write, and beep (`tauriShell.ts:3-7`), so those four `ShellBackend`
  members are proven against exactly one host (Electron).
- **`getFileIcon` is unbuilt and unowned.** Nothing in `packages/` names it, and there is no
  `nativeimage` cell for the `ImageSource` it would return.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two parked items checked out **false**:
  "alphabetize the new interface fields in `types/Shell.ts`" (every member of `ShellBackend`,
  `ShellOpenPathOptions`, and the optional half of `ShellShortcutLink` is already alphabetized), and
  "a future `host-tauri` adapter" — `createTauriShellBackend` exists (`host-tauri/src/tauriShell.ts:8`)
  and is wired by `tauriRegister.ts:45`, so the second-host validation the roadmap asked for is done.
  Also corrected: `ShellOpenPathOptions` has no `arguments` field.
- **2026-06-25** — `openShellExternalUrl` gained the attacker-controlled-URL security note pointing at
  `setShellUrlSchemeAllowlist` / `isShellUrlAllowed`; prose only.
- **2026-06-24** — Seam expansion: `isShellUrlAllowed` + `setShellUrlSchemeAllowlist`,
  `moveItemsToTrash`, `openShellPathResult`, `readShellShortcutLink` / `writeShellShortcutLink`, and
  options bags on `openExternal` / `openPath`, with the matching Electron backend arms.
