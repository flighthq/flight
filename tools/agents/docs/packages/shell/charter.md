---
package: '@flighthq/shell'
crate: flighthq-shell
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# shell — Charter

## What it is

OS shell integration as a flat **command-capability cell**: launching external URLs and files in their default OS handler, revealing an item in the OS file manager, moving files (one or many) to the trash, reading and writing Windows shortcut links, and the system beep. The package is a thin set of free functions over a swappable `ShellBackend` seam (`getShellBackend` / `setShellBackend` / `createWebShellBackend`), with a lazily-created web/DOM default backend that guards every API and returns sentinels when the platform cannot serve it. A native host (Electron today, via `host-electron`) replaces the seam.

The canonical reference for the domain is Electron's `shell` module — the de-facto desktop-SDK standard — with Tauri's `shell`/`opener` plugins and Capacitor's `Browser` as secondary references. The boundary against neighbors: `shell` opens and reveals items by handing them to the OS; it is not a file reader/writer (`@flighthq/filesystem`), not a dialog surface (`@flighthq/dialog`), and not a URL-scheme _registrar_ (`@flighthq/protocol`). It hands work off to the OS; it does not perform IO on content itself.

## North star (proposed)

_Proposed durable principles, inferred from the design and the SDK forks. Edit or promote in review; nothing here is blessed._

- **A faithful, complete port of the Electron `shell` surface, no larger.** The domain is genuinely small; "good" means every canonical shell operation a desktop-SDK developer reaches for is present, and nothing outside that domain is pulled in. Completeness within a tight boundary, not breadth.
- **Sentinels at the seam, never throws.** Every backend converts an OS throw into a sentinel (`false` / `null` / `[]` / `''` / `'unavailable on web'`) at the boundary; expected failure (blocked scheme, off-platform op, missing target) is a return value, not an exception. No error-wrapper types; an OS error message rides an explicit `*Result` string variant.
- **The seam is host-shaped, not Electron-shaped.** `ShellBackend` is defined in `@flighthq/types` and must remain implementable by a non-Electron host. Forward-compat options (`openPath`'s `application` / `workingDirectory` / `arguments`) belong to the seam, not to one adapter's capabilities.
- **Safety is opt-in and explicit.** The URL-scheme allowlist (`setShellUrlSchemeAllowlist` / `isShellUrlAllowed`) closes the classic `openExternal` footgun without changing default behavior (`null` = allow-all). Any future safety surface follows the same shape: explicit, caller-installed, default-permissive.
- **Value-typed leaf, mixable and portable.** Plain-data in / sentinel out, single `.` export, `"sideEffects": false`, sole dependency `@flighthq/types`. This keeps it a clean first Rust-port target (`flighthq-shell` over `opener` / `trash` / `mslnk`) and a candidate Wasm-mixable leaf.

## Boundaries (proposed)

_Proposed scope lines, drawn from the review and neighboring packages. Confirm or move in review._

**In scope**

- Open external URL / open path in default handler (with options).
- Reveal item in OS file manager; move item(s) to trash; system beep.
- Windows shortcut-link read/write.
- The `ShellBackend` seam lifecycle and the lazy web default backend.
- URL-scheme safety allowlist.

**Non-goals (proposed — several are open questions below, not settled non-goals)**

- Reading or writing file _content_ — owned by `@flighthq/filesystem`.
- File open/save or message dialogs — owned by `@flighthq/dialog`.
- Custom URI-scheme / deep-link _registration_ and inbound-URL handling — owned by `@flighthq/protocol`.
- Native-image / icon production (`getFileIcon`) — leans toward a future `@flighthq/nativeimage` cell rather than pulling an `ImageSource` dependency into this thin seam (open direction 2).

## Decisions

None blessed yet.

## Open directions

Every candidate question carried from `review.md`, plus the structural forks that touch this package. These are where an agent should ask rather than assume; none is decided.

1. **Export-naming convention.** The surface mixes Electron-canonical un-prefixed names (`openExternalUrl`, `showItemInFolder`, `moveItemToTrash`) with domain-prefixed ones (`openShellPath`, `openShellPathResult`, `shellBeep`, `getShellBackend`). Namespace every export with the `shell` word, or keep the un-prefixed names for the high-frequency four (recognizability for the Electron migration pool)? A public-API fork that should be **recorded as a Decision before the Rust port mirrors a frozen surface.**
2. **`getFileIcon` scope.** In-scope here (pulling an `ImageSource` / native-image dependency into the seam) or deferred to a dedicated `@flighthq/nativeimage` cell? Crosses a package boundary; the roadmap leans defer. (Relates to the bedrock test, fork E — is the icon query its own well-homed subject?)
3. **Error-fidelity boundary.** Is a bare boolean acceptable for batch trash and shortcut write, or is the `*Result` (OS-error-string) sibling part of the package's definition of done? Settles whether the deferred `moveItemsToTrashResult` / `writeShellShortcutLinkResult` are roadmap or non-goals.
4. **Path-safety posture.** Does the security boundary stop at URL schemes, or does `openShellPath` need a path-prefix allowlist for untrusted-content hosts? Defines the package's threat model and requires an OS-path-canonicalization design.
5. **Second-host validation as a boundary.** Is a non-Electron host adapter (proving the seam is not Electron-shaped, and exercising the currently-inert `openPath` options) part of `authoritative` for this package, or out of scope and owned by the host-package track?

**Structural forks touching this package:**

- **Fork D (seam dimensions).** `shell` sits on the _runtime backend_ axis (`ShellBackend` + `set*Backend`), and is also a candidate on the _Wasm `-rs` mixing_ axis as a value-typed leaf. Direction should confirm whether Wasm-mixing is an intended use or merely a side effect of the clean value boundary.
- **Fork E / F (bedrock + thin-by-design).** The domain is small; the package looks **thin-by-design, blessed-as-minimal** rather than under-built. Confirm that framing, and confirm `getFileIcon` / second-host / `*Result` siblings (above) are the bedrock floor, not gaps.
- **Rust port (`flighthq-shell`).** Declared in front matter but unstarted in this worktree; a strong first-port candidate. The export-naming decision (1) should land before the surface is frozen and mirrored.

**Docs-fit note (user's gate, not the charter's):** the Package Map line for `@flighthq/shell` is stale — it predates the shortcut-link family, batch trash, the `openPathResult` error channel, and the URL-scheme allowlist. Candidate revision flagged in `review.md`.
