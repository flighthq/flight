---
package: '@flighthq/shell'
updated: 2026-08-30
by: builder5
---

# shell — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

- **`getFileIcon` is unbuilt and unowned.** Nothing in `packages/` names it, and there is no
  `nativeimage` cell for the `ImageSource` it would return.
- **Local-path policy remains undesigned.** External URLs now require an explicit scheme policy on
  every call. Equivalent protection for untrusted paths needs cross-platform canonicalization and
  symlink/root semantics before it can be portable.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — Replaced `ShellBackend` and `ui.shell` with six top-level explicit Host slots.
  Web/Electron/Tauri/Capacitor now publish exact provider subsets; Electron shortcut-link presence is
  decided from an injected platform fact. Deleted ambient selection/diagnostics/sentinels, Web enabler/
  reset/stubs, portable ignored options, provider batch trash, and the boolean/error-string path twins.
  Added required per-call URL policy, reasoned awaited outcomes, Entity providers, and lifecycle proof.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The then-live aggregate's naming,
  ignored-option, error-fidelity, allowlist, and Tauri-stub findings were recorded for direction.
- **2026-06-25** — `openShellExternalUrl` gained the attacker-controlled-URL security note pointing at
  the then-ambient allowlist seam; prose only.
- **2026-06-24** — Aggregate seam expansion added URL policy state, batch/result siblings, shortcut
  links, and ignored options; all are preserved as historical context and superseded by 2026-08-30.
