---
id: shell
title: '@flighthq/shell'
type: depth
target: shell
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/shell.md
  - tools/agents/docs/reviews/depth/shell.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 78/100. A faithful, correctly-shaped command-capability cell (open URL/path, reveal, trash, beep over a swappable `ShellBackend`) that meets its declared scope but stops a few functions short of the full Electron-class shell surface.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum to close the highest-frequency fidelity gaps the depth review flagged. Mostly options objects and richer return shapes on functions that already exist.

- **`ShellOpenExternalOptions` (in `@flighthq/types` first)** — `{ activate?: boolean }`. Mirrors Electron's `openExternal(url, { activate })`. Add an optional second parameter to `openExternalUrl(url, options?: Readonly<ShellOpenExternalOptions>)` and to `ShellBackend.openExternal(url, options?)`. Web backend ignores `activate` (no concept), continues to return success/blocked.
- **`ShellOpenPathOptions` (types)** — `{ workingDirectory?: string }`. Add `openShellPath(path, options?: Readonly<ShellOpenPathOptions>)` and the matching backend param. Web sentinels `false` as today.
- **Surface `openPath`'s OS error string.** Electron's `openPath` resolves to a string (empty on success, an error message on failure). Add a result-bearing variant rather than overloading the boolean: `openShellPathResult(path): Promise<string>` returning `''` on success and the OS error otherwise (sentinel: `''` = ok). Keep `openShellPath` as the boolean convenience (`result === ''`). Add `ShellBackend.openPathResult` to the seam; web returns a fixed `'unavailable on web'` string.
- **Wire `host-electron` for the new options/return paths.** `electronShell.ts` already exists; extend its `createElectronShellBackend` to pass `{ activate }`, `workingDirectory`, and to forward Electron's `openPath` error string through `openPathResult`. No new web behavior.
- **Test coverage** for the new options being threaded through (distinct + default-omitted), the `''`-vs-error sentinel of `openPathResult`, and the web backend ignoring native-only options without throwing.

### Silver

Competitive with Electron's `shell` and Tauri's `opener`/`shell` plugins: the Windows shortcut-link family, batch trash, and a documented URL-safety seam.

- **Windows shortcut links (`.lnk`) — the largest missing canonical family.** Define in `@flighthq/types`: `ShellShortcutLink` (`{ target: string; args?: string; description?: string; cwd?: string; icon?: string; iconIndex?: number; appUserModelId?: string }`) and `ShellShortcutWriteOperation` string-kind-ish enum (`'create' | 'update' | 'replace'`). Add:
  - `writeShellShortcutLink(shortcutPath, link: Readonly<ShellShortcutLink>, operation?): Promise<boolean>`
  - `readShellShortcutLink(shortcutPath): Promise<ShellShortcutLink | null>` (sentinel `null` when absent/not-Windows)
  - matching `ShellBackend.writeShortcutLink` / `readShortcutLink`; web sentinels (`false` / `null`).
  - `host-electron` maps these 1:1 to `shell.writeShortcutLink` / `readShortcutLink`.
- **Batch trash** — `moveItemsToTrash(paths: readonly string[]): Promise<readonly boolean[]>` (per-path result array), with `ShellBackend.moveItemsToTrash`. Avoids N round-trips through a split-process host. Single-path `moveItemToTrash` stays as the convenience wrapper.
- **URL-scheme safety seam** — `setShellUrlSchemeAllowlist(schemes: readonly string[] | null)` and `isShellUrlAllowed(url): boolean`. `openExternalUrl` consults the allowlist (when set) and returns `false` for a disallowed scheme before reaching the backend — closes the classic `openExternal` footgun. Default `null` = allow all (no behavior change). Plain module state, no new dependency.
- **`getFileIcon(path, options?)` decision** — the depth review marks this borderline-out-of-scope (it is `nativeImage`-adjacent). Either: (a) add `getShellFileIcon(path, options?: Readonly<ShellFileIconOptions>): Promise<ImageSource | null>` returning a `flighthq-surface`-compatible `ImageSource`, or (b) explicitly defer to a future `@flighthq/nativeimage` cell. Recommend (b) and surface as a design-decision item — it pulls an image dependency into a thin seam.
- **Naming-consistency pass** — the file mixes `openExternalUrl` / `showItemInFolder` (un-namespaced, Electron-canonical) with `openShellPath` / `shellBeep` (domain-namespaced). Pre-release, decide one convention and apply it; record the decision rather than leaving the asymmetry implicit. (Keeping the Electron-canonical names buys recognizability — defensible, but make it deliberate.)
- **Docs note** on the security posture of `openExternalUrl` with attacker-controlled URLs, pointing at the allowlist seam.

### Gold

Authoritative / AAA: exhaustive canonical coverage, full error fidelity, and 1:1 Rust-port parity.

- **Complete the open-with surface** — `ShellOpenPathOptions.application?: string` (open a path with a specific app) and `arguments?: readonly string[]`, matching macOS `open -a` / Windows verb behavior where the host supports it. Backend reports `false` / error string when the named app is missing.
- **`beep` is already the complete Electron surface** — confirm it stays a no-arg `shellBeep()`; document that platform-specific sound is out of scope (that is `@flighthq/media`).
- **Full error-fidelity model** — every result-bearing op surfaces the OS error consistently (`openPathResult` already does; extend the pattern so `writeShellShortcutLink` / `moveItemsToTrash` can optionally report the OS error via a `*Result` sibling). Keep boolean convenience wrappers.
- **Exhaustive `host-electron` mapping + a second host** — verify the full surface (incl. shortcut links, batch trash, options objects) is mapped in `electronShell.ts`, and validate the seam against a non-Electron host shape (e.g. a Tauri/`host-tauri` `opener`-backed adapter or a fake) to prove the seam is not Electron-shaped.
- **Rust-port parity — `flighthq-shell`.** Mirror the seam: `ShellBackend` trait in `flighthq-types`, `set_shell_backend` / `get_shell_backend`, free functions `open_external_url`, `open_shell_path` / `open_shell_path_result`, `show_item_in_folder`, `move_item_to_trash` / `move_items_to_trash`, `write_shell_shortcut_link` / `read_shell_shortcut_link`, `shell_beep`. Native default backend gated behind the `native` cargo feature (the `opener` / `open` crate + `trash` crate + `winreg`/`mslnk` for `.lnk`), per the host-layer rule that std-serviceable capabilities ship a native default in-crate. Wasm build sentinels exactly like the TS web backend. Record any intentional TS↔Rust divergence (e.g. `.lnk` write being Windows-only) in the conformance divergence map.
- **Conformance tests** — assertion-ported unit tests for the sentinel matrix (web/native × each op) on both the TS and Rust sides, exercised through the parity instrument where a renderable result exists (none here — shell ops are non-visual, so this stays unit-level).
- **Allowlist hardening** — extend the URL-safety seam to also cover `openShellPath` (path-prefix allowlist) for hosts embedding untrusted content, and document the threat model.

## Sequencing & effort

Recommended order, with dependencies and items to surface.

1. **Bronze options + `openPathResult` (small, ~0.5 day).** Pure additive params and one new function + types in `@flighthq/types` first. Touches `Shell.ts` (types), `shell.ts`, `shell.test.ts`, and `electronShell.ts`. No cross-package design decision required. Run `npm run exports:check` (new export needs a colocated test) and `npm run api shell` to confirm naming symmetry.
2. **Silver shortcut-link family (medium, ~1 day).** New `ShellShortcutLink` type in `@flighthq/types`, four new exports + backend methods, Electron mapping. Largest single chunk of canonical surface. Independent of step 1.
3. **Silver batch trash + URL allowlist (small, ~0.5 day).** Self-contained; the allowlist is plain module state.
4. **Naming-consistency decision (design item — surface to user).** Whether to namespace all exports with the `shell` word or keep the Electron-canonical un-namespaced names is a public-API call that affects the whole cell and should be made deliberately pre-release. Do this before Gold so the Rust port mirrors a settled surface.
5. **`getFileIcon` scope decision (design item — surface to user, cross-package).** It pulls an `ImageSource` / native-image dependency into a thin seam. Recommend deferring to a dedicated cell; do not add it to `shell` autonomously — it crosses a package boundary and is the kind of dependency the bundle-size discipline warns against in a leaf seam.
6. **Gold open-with + error-fidelity (medium).** Depends on the Silver shortcut + options work being in place.
7. **Gold Rust port `flighthq-shell` (medium-large, ~1.5 days incl. native crate wiring).** Should follow the TS surface freeze (steps 1–6) so it ports a settled API. Native backend depends on choosing crates (`opener`/`open`, `trash`, `.lnk` writer) — a small dependency decision, but in-crate and feature-gated per the host-layer rule.

**Cross-package dependencies**: `@flighthq/types` (all new types land there first); `@flighthq/host-electron` (`electronShell.ts` already exists — extend, don't rebuild). A future `host-tauri` would validate the seam at Gold. `@flighthq/surface` only enters if `getFileIcon` is taken in-scope (recommended against).

**Design-decision items to surface to the user**: (a) export-naming convention (namespaced vs Electron-canonical); (b) `getFileIcon` in-scope vs a separate native-image cell; (c) crate choices for the Rust native backend. None block Bronze.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/shell` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
