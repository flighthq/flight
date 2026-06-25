---
package: '@flighthq/shell'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/shell

This assessment reasons over the **merge-gate** review (`./review.md`, 2026-06-25), which judged the `integration-b2824e3d8` delta against the approved floor `origin/main (eb73c3d74)`. The headline finding governs everything below: the delta **does not compile in this head** — `shell.ts`/`shell.test.ts` reference four `@flighthq/types` shapes and four `ShellBackend` methods that the same head's `packages/types/src/Shell.ts` does not declare. The expanded-surface _design_ is sound; the _integration_ is incomplete.

`Recommended` is strictly sweep-safe: within `@flighthq/shell` (plus its `@flighthq/types` header, where its types already belong), additive, non-breaking, no open design decision. The blocker itself is **not** a Recommended sweep — it is a must-fix-before-merge directive routed to the integration worker via `outgoing/integration/shell.md`, because the missing pieces live in `@flighthq/types` and `@flighthq/host-electron`, outside this package, and gate the build rather than improving it.

## Recommended

- **Land the URL-safety security note already present in source as a durable comment, kept in sync.** `b2824e3d8:packages/shell/src/shell.ts` carries the footgun note on `setShellUrlSchemeAllowlist` (L117-120) and `writeShellShortcutLink` (L137-138). Once the package compiles, confirm the `openExternalUrl` callsite (L87-88) also points a reader at `setShellUrlSchemeAllowlist` / `isShellUrlAllowed` so the seam's purpose is discoverable from the highest-frequency entry point. Within-package, additive prose, no behavior change. — review.md › What is sound (URL-scheme safety seam)

- **Refresh the stale `@flighthq/shell` Package Map line.** The codebase-map entry still reads "open external URLs/paths, reveal in folder, move to trash, beep" and predates the shortcut-link family, batch trash, the `openPathResult` error channel, and the URL-scheme allowlist. Extend it to mention Windows shortcut links and the URL-safety seam. Admin-doc tidy, no code; the user gates the exact wording. — review.md › Charter contradictions / docs-fit

## Backlog

Parked: each waits on the build being fixed first, or on a charter Open direction, or crosses a package/crate boundary.

- **`*Result` error-fidelity siblings (`moveItemsToTrashResult`, `writeShellShortcutLinkResult`).** Additive in isolation, but whether bare-boolean is acceptable for batch trash and shortcut write — or the `*Result` sibling is part of "done" — is the **error-fidelity boundary** design call (Open direction 3). Parked until settled and until the base surface compiles. — review.md › What is sound; charter Open direction 3
- **Wire the inert `openShellPath` open-with options (`application`, `arguments`).** Accepted by the (unlanded) `ShellOpenPathOptions` type but no backend consumes them; honoring them needs a host implementing `open -a` / Windows-verb behavior — cross-package, cannot be validated within `shell`. Parked. — charter Open direction 5
- **Path-prefix allowlist for `openShellPath`.** A path-side twin of the URL-scheme seam for untrusted-content hosts; needs OS-path-canonicalization design and a stated threat model — a design pass, not a sweep. Gated on the **path-safety posture** Open direction (4). — charter Open direction 4
- **Second, non-Electron host adapter.** Proves the seam is not Electron-shaped and exercises the currently-inert `openPath` options. Lives in the host-package track; whether it is part of `authoritative` for this cell is itself Open direction 5. Cross-package — parked. — charter Open direction 5
- **Rust port `flighthq-shell`.** Charter front matter declares `crate: flighthq-shell`; no `crates/` tree exists in this worktree. Correctly deferred to follow the TS API _freeze_ — and the freeze cannot happen while the head does not compile. A strong first-port candidate (value/side-effect leaf, `opener`/`trash`/`mslnk`), but cross-crate and gated on both the build fix and the export-naming decision. — review.md › Carry-over context; charter Open direction 1

## Approved

_None. Approval is the user's verbal gate; nothing is swept in here automatically._

## Notes for the charter's Open directions

Design forks / cross-package calls the review surfaced. They belong in `charter.md › Open directions`, not in `Recommended`. Recorded here for the next direction session; this assessment does not edit the charter.

1. **Export-naming convention** — namespace every export with the `shell` word, or keep the Electron-canonical un-prefixed names (`openExternalUrl`, `showItemInFolder`, `moveItemToTrash`) for the high-frequency four? This asymmetry is a **base** property (those four names pre-date the delta), so it is a standing fork, not a delta regression — but it should be recorded as a Decision before any Rust port mirrors a frozen surface.
2. **`getFileIcon` scope** — in-scope here (pulling an `ImageSource` / native-image dependency into a thin seam, against bundle-size discipline) or deferred to a dedicated `@flighthq/nativeimage` cell? Crosses a package boundary; the roadmap leans defer.
3. **Error-fidelity boundary** — bare-boolean vs `*Result` (OS-error-string) siblings for batch trash and shortcut write. Gates the first Backlog item.
4. **Path-safety posture** — does the security boundary stop at URL schemes, or does `openShellPath` need a path-prefix allowlist? Defines the threat model and gates the path-allowlist Backlog item.
5. **Second-host validation as a boundary** — is a non-Electron host adapter part of `authoritative` for this cell, or owned by the host-package track?
