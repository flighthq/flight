---
package: '@flighthq/shell'
status: solid
score: 80
updated: 2026-07-13
ingested:
  - packages/shell/src (live)
  - packages/types/src/Shell.ts (live)
  - host-electron/src/electronShell.ts
  - charter.md
  - assessment.md
  - prior review (2026-06-25 merge-gate)
---

# shell — Review

Evidence: the **live worktree** `packages/shell/src/` (source + tests), `packages/types/src/Shell.ts`, and `packages/host-electron/src/electronShell.ts`.

**Supersedes the 2026-06-25 merge-gate review (revise — 45).** That review blocked integration `b2824e3d8` because the expanded `shell.ts` was carried without its `@flighthq/types` contract. **Every element of that blocker is resolved in the live tree**: `packages/types/src/Shell.ts` now declares the full 9-method `ShellBackend` plus `ShellOpenExternalOptions`, `ShellOpenPathOptions`, `ShellShortcutLink`, and `ShellShortcutWriteOperation`; `shell.ts`/`shell.test.ts` compile against it; and `electronShell.ts` implements all nine methods (the June review noted it was still the base 5-method adapter — no longer true). The charter's Approved rename also landed: the export is `openShellExternalUrl` (there is no `openExternalUrl` in the live source).

## Verdict

`solid` — 80/100. Shell is a small-bedrock domain and the live package covers its canonical reference (Electron's `shell` module) completely: `openExternal` (with `activate` option), `openPath` (+ the `openPathResult` OS-error-string sibling), `showItemInFolder`, trash (single + batch with per-path results), `beep`, and Windows `.lnk` read/write with a create/replace/update operation — plus a URL-scheme allowlist safety seam (`setShellUrlSchemeAllowlist`/`isShellUrlAllowed`) that closes the classic `openExternal` footgun before the URL reaches the backend. Sentinels are exact and documented per method; the Electron backend fills the whole seam. Deductions: the remaining un-prefixed export names (`showItemInFolder`, `moveItemToTrash`, `moveItemsToTrash`), both charter Open directions unresolved (`getFileIcon` scope; whether `*Result` error-fidelity siblings for trash/shortcut-write are part of done — only `openPath` has one today), and the Electron `openExternal` not forwarding the `activate` option it could honor.

## Present capabilities (verified against live source)

- **Seam.** `ShellBackend` (types) — `beep`, `moveItemsToTrash`, `moveToTrash`, `openExternal(url, options?)`, `openPath(path, options?)`, `openPathResult`, `readShortcutLink`, `showItemInFolder`, `writeShortcutLink(path, link, operation?)`. `getShellBackend` lazy web default; `setShellBackend(backend | null)`.
- **Free functions — 14 exports**: `createWebShellBackend`, `getShellBackend`, `isShellUrlAllowed`, `moveItemsToTrash`, `moveItemToTrash`, `openShellExternalUrl`, `openShellPath`, `openShellPathResult`, `readShellShortcutLink`, `setShellBackend`, `setShellUrlSchemeAllowlist`, `shellBeep`, `showItemInFolder`, `writeShellShortcutLink`.
- **URL-scheme safety.** Default allowlist `null` = allow-all; when set, `openShellExternalUrl` returns `Promise.resolve(false)` before touching the backend; `isShellUrlAllowed` returns `false` on unparseable URLs via try/catch. The security rationale is documented at the callsite.
- **Web backend.** Only `openExternal` is achievable (`window.open` with `noopener`, null-checked, try/catch); everything else returns the documented sentinel (`false` / `[]` / `null` / `'unavailable on web'`). Correct posture — the web genuinely cannot do these.
- **Electron backend** (`electronShell.ts`): all nine methods, including `openPathResult` passing through Electron's ''-on-success error-string contract, per-path batch trash, and `.lnk` read/write mapped to Electron's `(path, operation, details)` argument order.
- **Tests.** 32 tests / 14 `describe` blocks mirroring all 14 exports: allowlist allowed/blocked/null/unparseable, options forwarding (distinct + omitted), batch results, the `''`-vs-error split.

## Gaps

- **Naming asymmetry (the last one).** `showItemInFolder`, `moveItemToTrash`, and `moveItemsToTrash` omit the `Shell` subject word that `openShellPath`, `openShellExternalUrl`, `readShellShortcutLink`, `writeShellShortcutLink`, and `shellBeep` carry. The 2026-07-02 rename decision fixed `openExternalUrl` only; these three predate it and remain. Under "exported function names include the full, unabbreviated name of the type they operate on," they are not self-identifying (`showItemInFolder` could belong to any file-UI package).
- **Error-fidelity asymmetry.** `openPath` has an OS-error-string sibling (`openShellPathResult`); trash and shortcut-write return bare booleans with no reason channel. Charter Open direction 2 asks exactly this; unresolved.
- **Electron `openExternal` drops `options`.** `electronShell.ts` line 11 declares `async openExternal(url)` — the `activate` option is accepted by the seam and honored by Electron's own API but never forwarded. (host-electron file — noted, not in this package's write scope.)
- **`getFileIcon` absent** — charter Open direction 1 (may belong to a `nativeimage` cell instead).
- **No Rust `flighthq-shell` crate** activity verified this pass (charter front matter names one; conformance posture untracked here).

## Charter contradictions

None. The charter's "What it is" now matches the live surface exactly (URLs/paths/reveal/trash/beep/shortcut links/allowlist over `ShellBackend`). The Decision's rename is implemented and can be marked delivered at the next direction session.

## Contract & docs fit

- Types-first: full contract in `@flighthq/types`, `import type` only, one concept per file section. ✔
- Sentinels-not-throws: exact and per-method documented; no throws anywhere. ✔
- `sideEffects: false`, single root export, lazy backend, module state (`_backend`, `_urlSchemeAllowlist`) at file bottom, sole dependency `@flighthq/types`. ✔
- Exports alphabetized; tests colocated, `describe`s alphabetized and mirroring. ✔
- One inline-comment nit: `writeShellShortcutLink`'s "IMPORTANT: URL safety…" comment is a caller-facing misuse warning — per the diagnostics inversion rule that wants to be a guard, not a comment (same class as the `openShellExternalUrl` SECURITY comment, though that one doubles as durable semantics for the allowlist seam).

## Structural-fork fit

- **Fork D (backend seam):** textbook.
- **Fork B:** `ShellShortcutWriteOperation` closed three-value union — fixed OS-mirrored set, correct closed-union exception.
- **Subject triad:** boundaries against `filesystem`/`dialog`/`protocol` hold in source (shell never reads/writes file contents, shows no dialogs, registers no schemes).

## Candidate open directions

1. **Finish the subject-prefix renames** (`showShellItemInFolder`, `moveShellItemToTrash`, `moveShellItemsToTrash`) — mechanically the same convention as the blessed `openShellExternalUrl` rename; listed in the assessment as Recommended since it extends an already-blessed decision, flagged here in case the user prefers to re-bless.
2. **Error-fidelity boundary** (charter Open direction 2): `moveShellItemToTrashResult` / `writeShellShortcutLinkResult` siblings, or accept booleans.
3. **`getFileIcon` scope** (charter Open direction 1).
4. **Electron `activate` forwarding** — one-line host-electron fix, outside this package's boundary.
