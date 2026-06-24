---
package: '@flighthq/shell'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/shell.md
  - reviews/maturation/depth/shell.md
  - source
  - incoming/builder-67dc46d64
---

# Review: @flighthq/shell

## Verdict

solid — 90/100. A faithful, near-complete command-capability cell for the OS-shell domain. The `builder-67dc46d64` pass took it from the prior 78/100 by closing almost every fidelity gap the depth review flagged: options objects, the Windows `.lnk` family, batch trash, the `openPathResult` error-string variant, and a URL-scheme safety seam. It falls short of `authoritative` only on items that are correctly deferred (the Rust crate, a second non-Electron host, `*Result` siblings for batch ops) plus two open design calls the charter has not yet settled (export-naming convention and `getFileIcon` scope).

## Status-doc verification (as-claimed → verified)

Every claim in `status.md` checks out against the bundle diff (`67dc46d64:packages/shell/`, `/types/src/Shell.ts`, `/host-electron/src/electronShell.ts`) and the realized `dist/*.d.ts`:

- Base surface was 8 exports + 5 `ShellBackend` methods; head is **14 exports + 9 backend methods**. New exports `isShellUrlAllowed`, `moveItemsToTrash`, `openShellPathResult`, `readShellShortcutLink`, `setShellUrlSchemeAllowlist`, `writeShellShortcutLink`; `openExternalUrl` / `openShellPath` gained options params. Confirmed in `dist/shell.d.ts`.
- New `@flighthq/types` shapes (`ShellOpenExternalOptions`, `ShellOpenPathOptions`, `ShellShortcutLink`, `ShellShortcutWriteOperation`) are present in `Shell.ts` and the `ShellBackend` interface gained `moveItemsToTrash`, `openPathResult`, `readShortcutLink`, `writeShortcutLink` + options params. Header-first rule honored — nothing typed inline in the package.
- Test counts match exactly: **32** `it` blocks in `shell.test.ts`, **17** `it` blocks in `electronShell.test.ts`.
- `createWebShellBackend` implements all 9 methods with the claimed sentinels (`[]` for batch trash, `false` / `null` / `'unavailable on web'`), verified in source.
- `host-electron` wiring matches: parallel `trashItem` for batch, `activate` forwarded, `openPath` error string surfaced via `openPathResult`, shortcut read/write mapped with throw-to-sentinel guards for non-Windows. The `void options` no-op for `application`/`workingDirectory`/`arguments` on Electron's `openPath` is present and commented as claimed.

No claim was overstated. The estimated 93/100 is close; I land at 90 because the deferred Rust port and the unsettled naming decision are real distance from `authoritative`, not bookkeeping.

## Present capabilities

Fourteen free functions over a `ShellBackend` seam plus the seam lifecycle, all grounded in `shell.ts`:

- **Open / reveal / trash**: `openExternalUrl(url, options?)`, `openShellPath(path, options?)`, `openShellPathResult(path, options?)` (`''`=ok / OS error string), `showItemInFolder(path)`, `moveItemToTrash(path)`, `moveItemsToTrash(paths)` (per-path boolean array), `shellBeep()`.
- **Windows shortcut links**: `writeShellShortcutLink(shortcutPath, link, operation?)` and `readShellShortcutLink(shortcutPath)` (`null` sentinel off-Windows/web/missing).
- **URL safety seam**: `setShellUrlSchemeAllowlist(schemes | null)` + `isShellUrlAllowed(url)`. `openExternalUrl` consults the allowlist and returns `false` for a blocked scheme _before_ reaching the backend, and `isShellUrlAllowed` returns `false` for an unparseable URL — closing the classic `openExternal` footgun. Default `null` = allow-all, so no behavior change for existing callers.
- **Backend lifecycle**: `getShellBackend()` (lazy web default — always returns a backend), `setShellBackend(backend | null)`, `createWebShellBackend()`. Exactly the command-capability shape (`get*Backend` / `set*Backend` / `createWeb*Backend`) the platform-suite docs mandate.

The web backend is real and honestly guarded: `openExternal` uses `window.open(url, '_blank', 'noopener')` and distinguishes blocked-vs-opened, everything else sentinels. `host-electron`'s `createElectronShellBackend` maps the full surface 1:1 to Electron's `shell` module, wrapping throw-to-sentinel for the Windows-only ops and Electron's `openPath` string convention. Tests cover options forwarding (distinct + omitted), allowlist allowed/blocked/null/unparseable, batch results, web sentinels, and the `openPathResult` `''`-vs-error split.

## Gaps

The domain is genuinely small and most canonical surface is now covered. Remaining gaps, none large:

- **No Rust crate `flighthq-shell`.** The charter declares `crate: flighthq-shell`; the `crates/` tree does not exist in this (builder) worktree, so the port is unstarted. This is the single largest distance from `authoritative` and is a strong first-port candidate (value/side-effect leaf, mature native crates `opener`/`trash`/`mslnk`). Correctly deferred to follow the TS API freeze.
- **No second, non-Electron host.** Only `host-electron` fills the seam. The seam's freedom from Electron-shape is asserted in prose but not proven by a Tauri/`host-opener` adapter or fake. The `openPath` options (`application`/`workingDirectory`/`arguments`) are accepted but no host honors them yet — they are seam-forward-compat placeholders, untested against a backend that consumes them.
- **No `*Result` error fidelity for batch trash / shortcut write.** `moveItemsToTrash` and `writeShellShortcutLink` return bare booleans; only `openShellPathResult` surfaces the OS error. The roadmap's full-error-fidelity model (`moveItemsToTrashResult`, `writeShellShortcutLinkResult`) is unimplemented — additive, low-risk, deferred.
- **`getFileIcon` absent.** Electron's `shell`/`nativeImage`-adjacent icon query is not present. The roadmap recommends deferring to a future `@flighthq/nativeimage` cell rather than pulling an `ImageSource` dependency into a thin seam — an unsettled scope call, not an oversight.
- **No path-prefix allowlist for `openShellPath`.** The URL-scheme safety seam has no path-side twin for hosts embedding untrusted content; requires an OS-path-canonicalization design.

## Charter contradictions

None. The charter's "What it is" (open URLs/paths, reveal, trash, beep; Electron `shell` as the canonical reference) is fully honored and exceeded. North star / Boundaries / Decisions are still `TODO` stubs, so there is no stated principle for the code to violate — the package is judged against the codebase-map AAA standard, which it meets for its declared scope.

## Contract & docs fit

**Lives up to the contract — yes, cleanly:**

- Types are `@flighthq/types`-first (`Shell.ts`); nothing cross-package is typed inline.
- Names are full and self-identifying; `Promise<boolean>` for IO, `void` for beep, `*Result` variant for error-bearing.
- Sentinels-not-throws throughout (`false` / `null` / `[]` / `'unavailable on web'`); no error-wrapper types. `host-electron` converts every Electron throw into a sentinel at the boundary.
- Single root `.` export (`index.ts` is a bare `export * from './shell'`); `"sideEffects": false`; default backend lazily created, not registered at module load; sole dependency `@flighthq/types`.
- Module state (`_backend`, `_urlSchemeAllowlist`) and exports are correctly ordered — loose vars at file bottom, exports alphabetized.
- `ShellShortcutWriteOperation` is a closed string union (`'create' | 'replace' | 'update'`), which is correct under fork B's closed-union exception: a fixed, Electron-mirrored set with no extensibility goal, not a registry candidate. No mis-homed type, no closed switch that should be a registry, no hot-loop concern (this package has no per-frame path).

**Minor / candidate notes (not violations):**

- Interface fields in `ShellOpenPathOptions` / `ShellShortcutLink` are not alphabetized (`arguments` before `application`; `target` last). The source-order convention binds exported functions and `describe` blocks, not interface members, so this is a style nit, not a contract break — but a `types-layout` field-order pass would tidy it.
- **Naming asymmetry** (carried from the depth review and flagged in `status.md` as a design item): the surface mixes Electron-canonical un-prefixed names (`openExternalUrl`, `showItemInFolder`, `moveItemToTrash`) with domain-prefixed ones (`openShellPath`, `openShellPathResult`, `shellBeep`, `getShellBackend`). Defensible (recognizability for the Electron migration pool) but should be a _recorded_ decision pre-release, not left implicit.

**Docs-fit (candidate revisions to admin docs):**

- The Package Map line for `@flighthq/shell` ("open external URLs/paths, reveal in folder, move to trash, beep") is now **stale** — it predates the shortcut-link family, batch trash, the `openPathResult` error channel, and the URL-scheme allowlist. Candidate revision: extend the line to mention Windows shortcut links and the URL-safety seam. (User's gate, not the reviewer's.)
- `host-electron`'s Package Map entry lists the shell seam generically; no change needed, but the expanded surface (shortcut links, batch trash) is now part of what that adapter must keep mapped.

## Candidate open directions

These are questions the charter's `TODO` North star / Boundaries / Decisions do not answer; the review had to assume the AAA default. Each should feed the charter:

1. **Export-naming convention** — namespace every export with the `shell` word, or keep the Electron-canonical un-prefixed names for the high-frequency four? This is a public-API fork that should be settled (and recorded as a Decision) _before_ the Rust port mirrors a frozen surface.
2. **`getFileIcon` scope** — in-scope here (pulling an `ImageSource`/native-image dependency into the seam) or deferred to a dedicated `@flighthq/nativeimage` cell? Crosses a package boundary; the roadmap leans defer.
3. **Error-fidelity boundary** — is bare-boolean acceptable for batch trash and shortcut write, or is the `*Result` (OS-error-string) sibling part of the package's definition of done? Settles whether the deferred `moveItemsToTrashResult` / `writeShellShortcutLinkResult` are roadmap or non-goals.
4. **Path-safety posture** — does the security boundary stop at URL schemes, or does `openShellPath` need a path-prefix allowlist for untrusted-content hosts? Defines the package's threat model.
5. **Second-host validation as a boundary** — is a non-Electron host adapter (proving the seam is not Electron-shaped, and exercising the currently-inert `openPath` options) part of `authoritative`, or out of this package's scope and owned by the host-package track?
