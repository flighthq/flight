---
package: '@flighthq/shell'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# shell — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md › Recommended` that fall strictly within `packages/shell/`.

Done:

- **URL-safety security note on `openExternalUrl`.** Extended the source doc-comment to spell out the attacker-controlled-URL footgun (a non-http(s) scheme launching a local app / protocol handler) and to point at `setShellUrlSchemeAllowlist` and `isShellUrlAllowed` as the gate. Prose-only; no signature or behavior change. `packages/shell/src/shell.ts`.

Verification: `npm run test --workspace=packages/shell` — 32 tests pass.

Parked:

- **Alphabetize the new interface fields in `@flighthq/types/Shell.ts`** — cross-boundary: edits `packages/types`, outside the `packages/shell/` boundary for this sweep.
- **Refresh the stale `@flighthq/shell` Package Map line** — cross-boundary: the Package Map lives in `tools/agents/docs/index.md` (the codebase map / project CLAUDE.md), not under `tools/agents/docs/packages/shell/`; the assessment also flags it as gated on the user's exact wording.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/shell

**Session date**: 2026-06-24 **Starting score**: 78/100 (solid) **Estimated new score**: 93/100

## Implemented APIs

### New types in `@flighthq/types` (`packages/types/src/Shell.ts`)

- `ShellOpenExternalOptions` — `{ activate?: boolean }`. Controls macOS foreground raise when opening a URL. Added as an optional second parameter to `ShellBackend.openExternal` and `openExternalUrl`.
- `ShellOpenPathOptions` — `{ workingDirectory?: string; application?: string; arguments?: readonly string[] }`. Covers Electron's open-with, macOS `open -a`, and working directory control. Added to `ShellBackend.openPath` / `openPathResult` and `openShellPath` / `openShellPathResult`.
- `ShellShortcutLink` — full Windows `.lnk` descriptor: `target`, `args`, `description`, `cwd`, `icon`, `iconIndex`, `appUserModelId`.
- `ShellShortcutWriteOperation` — `'create' | 'replace' | 'update'`. Write mode for `writeShellShortcutLink`.
- Updated `ShellBackend` interface: added `moveItemsToTrash`, `openPathResult`, `readShortcutLink`, `writeShortcutLink`; added options parameters to `openExternal` and `openPath`.

### New / updated exports in `@flighthq/shell`

- `isShellUrlAllowed(url): boolean` — new. Checks a URL against the active scheme allowlist; false when the URL cannot be parsed.
- `moveItemsToTrash(paths: readonly string[]): Promise<readonly boolean[]>` — new. Batch trash with per-path results. Web returns `[]` sentinel.
- `openExternalUrl(url, options?)` — updated. Now accepts `ShellOpenExternalOptions`; consults the allowlist before calling the backend (returns `false` immediately for blocked schemes).
- `openShellPath(path, options?)` — updated. Now accepts `ShellOpenPathOptions`.
- `openShellPathResult(path, options?): Promise<string>` — new. Returns `''` on success or an OS error message on failure. Web returns `'unavailable on web'`. Mirrors Electron's `openPath` string convention.
- `readShellShortcutLink(shortcutPath): Promise<ShellShortcutLink | null>` — new. Windows `.lnk` read; null on non-Windows, web, or missing file.
- `setShellUrlSchemeAllowlist(schemes: readonly string[] | null): void` — new. Closes the classic `openExternal` security footgun. Pass `null` to allow all schemes (default).
- `writeShellShortcutLink(shortcutPath, link, operation?): Promise<boolean>` — new. Windows `.lnk` write; false on non-Windows and web.
- `createWebShellBackend()` — updated. Implements all new `ShellBackend` methods with correct sentinels.

### Updated `@flighthq/host-electron` (`electronShell.ts` + `electronModule.ts`)

- `ElectronShell` interface in `electronModule.ts` extended: `openExternal` now accepts `{ activate? }`, added `readShortcutLink`, `writeShortcutLink`, `ElectronShortcutLink`.
- `createElectronShellBackend` updated: `moveItemsToTrash` (parallel `trashItem` calls), `openExternal` forwards `activate`, `openPathResult` surfaces the Electron error string, `readShortcutLink` / `writeShortcutLink` mapped to Electron's shell methods with non-Windows throw-to-null/false guards.
- Test file expanded from 5 to 17 test cases covering all new methods.

### Test coverage

- `shell.test.ts`: 32 tests covering all 14 exported functions, including options forwarding, allowlist enforcement (scheme allowed/blocked/null/unparseable), batch trash, web backend sentinels, and `openPathResult` error strings.
- `electronShell.test.ts`: 17 tests covering all backend methods including activate forwarding, batch trash partial failure, shortcut link round-trips, Windows-only throw-to-sentinel behavior, and `openPathResult` throw capture.

## Deferred items and why

### Naming-consistency decision (design item — surface to user)

The exported API mixes `openExternalUrl` / `showItemInFolder` / `moveItemToTrash` (Electron-canonical, no domain prefix) with `openShellPath` / `shellBeep` / `getShellBackend` (domain-prefixed). The maturation roadmap calls this out as a deliberate pre-release decision. Recommendation: keep the Electron-canonical names for the four highest-frequency operations (they are immediately recognizable to Electron developers — a large migration pool) and retain the `shell*` prefix only for functions without a well-known Electron peer (`shellBeep`, `getShellBackend`, `setShellBackend`). This is a design call that should be recorded explicitly before Gold; not acted on autonomously.

### `getFileIcon` (design item — cross-package)

The maturation roadmap explicitly recommends deferring this to a future `@flighthq/nativeimage` cell. It would pull an `ImageSource` / native-image dependency into a thin seam. Not added.

### `openShellPath` application/arguments on Electron

Electron's `openPath` does not support `application` or `arguments` — it only takes a path and uses the default OS handler. These options are silently no-op'd in the Electron backend with a `void options` comment. A future `host-tauri` adapter could honor them via `tauri-plugin-opener`'s `open_path(path, openWith)`. Noted in code.

### Rust port `flighthq-shell` (Gold item)

The `crates/` directory does not exist in this worktree (builder). The Rust port of the expanded seam — `ShellBackend` trait in `flighthq-types`, free functions, native default backend (`opener`/`open` + `trash` + `mslnk`/`winreg` for `.lnk`), wasm sentinel implementations — should follow the final TS API freeze. Tracked as a Gold item.

### Allowlist hardening for `openShellPath`

The maturation roadmap mentions extending the URL-scheme allowlist concept to cover path-prefix allowlisting for `openShellPath` (hosts embedding untrusted content). Not implemented — this requires a design decision on what constitutes a "path-prefix allowlist" (OS-specific separators, symlink resolution, etc.) that is out of scope for a single session.

### Full error-fidelity `*Result` siblings for `moveItemsToTrash` and `writeShellShortcutLink`

The roadmap proposes `*Result` variants for batch trash and shortcut write to surface per-item OS errors. These are additive and low-risk, deferred to avoid unbounded scope in this session.

## Concerns or surprises

- `ElectronShell.openExternal` in Electron's actual API returns `Promise<void>` — it does not distinguish blocked from success. Flight's web backend can distinguish this via `window.open`'s return value, but the Electron backend can only report success/throw. The backend contract faithfully reflects this: success = `true`, throw = `false`. There is no "blocked by OS" boolean from Electron's `openExternal`.
- `ElectronShell.readShortcutLink` and `writeShortcutLink` are synchronous in Electron (they return immediately without a `Promise`). The `ShellBackend` seam wraps them in `async` for interface uniformity. This was the right call — the seam is `Promise`-based throughout.
- `openShellPath` with `workingDirectory` has no Electron equivalent (Electron's `openPath` is fixed-signature). The option is accepted and silently ignored to maintain seam compatibility with future hosts that do support it.

## Suggestions for future sessions

1. **Naming decision**: Make the `shell*`-prefix vs. Electron-canonical naming explicit as a recorded design decision before the Gold Rust port mirrors a settled API surface.
2. **Rust port**: Once the TS API is frozen, `flighthq-shell` is a good candidate for the first Rust port because it is a value/side-effect leaf (no scene graph, no GPU) and the native crates (`opener`, `trash`, `mslnk`) are mature.
3. **`*Result` siblings**: `moveItemsToTrashResult` and `writeShellShortcutLinkResult` returning per-item error strings would complete the error-fidelity model at Gold.
4. **Tauri host validation**: A `createTauriShellBackend` in a future `host-tauri` would validate that the seam is not Electron-shaped (the roadmap specifically calls for a second host to prove this).
5. **Path-prefix allowlist**: Extend the allowlist concept to `openShellPath` for hosts embedding untrusted content — requires OS-path canonicalization design.
