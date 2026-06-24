---
package: '@flighthq/shell'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/shell

The `builder-67dc46d64` pass already landed all of Bronze and the bulk of Silver (options objects, `openShellPathResult`, the Windows `.lnk` family, batch trash, the URL-scheme allowlist, and the matching `host-electron` wiring + tests). What remains in the roadmap is either a design call the charter has not settled, a cross-package/cross-crate item, or a small within-package tidy. The package is `solid` (90/100); the distance to `authoritative` is mostly parked work, not sweep-safe work — so `Recommended` is short by design.

## Recommended

Sweep-safe: within `@flighthq/shell` (+ its `@flighthq/types` header, which is where its types already live), no cross-package coupling, no breaking change, no open design decision.

- **Alphabetize the new interface fields in `@flighthq/types/Shell.ts`.** `ShellOpenPathOptions` (`arguments` before `application`) and `ShellShortcutLink` (`target` last) are out of field order. A pure `types-layout` field-order tidy on types this package owns; no behavior change. (review.md › Contract & docs fit › Minor / candidate notes)
- **Add the URL-safety security note to the `openExternalUrl` source.** Document the attacker-controlled-URL footgun and point at `setShellUrlSchemeAllowlist` / `isShellUrlAllowed`, so the seam's purpose is discoverable at the callsite. Within-package, additive prose. (Silver roadmap › "Docs note on the security posture of `openExternalUrl`")
- **Refresh the stale `@flighthq/shell` Package Map line.** It still reads "open external URLs/paths, reveal in folder, move to trash, beep" and predates the shortcut-link family, batch trash, the `openPathResult` error channel, and the URL-scheme allowlist. Extend it to mention Windows shortcut links and the URL-safety seam. (Admin-doc tidy, no code; user's gate on the exact wording.) (review.md › Docs-fit)

## Backlog

Parked: each waits on a charter Open direction, crosses a package/crate boundary, or is larger than a sweep.

- **`*Result` error-fidelity siblings (`moveItemsToTrashResult`, `writeShellShortcutLinkResult`).** Additive and low-risk in isolation, but whether bare-boolean is acceptable for batch trash and shortcut write — or the `*Result` sibling is part of "done" — is the **error-fidelity boundary** design call (Open direction 3). Parked until that is settled; building both siblings speculatively would pre-empt the decision. (Gold roadmap › full error-fidelity model)
- **Wire the inert `openShellPath` open-with options (`application`, `arguments`).** The types are accepted but no backend consumes them; honoring them needs a host that implements `open -a` / Windows-verb behavior, which is cross-package (`host-electron` and/or a second host) and cannot be validated within `shell` alone. Parked as a Gold cross-package item. (Gold roadmap › complete the open-with surface)
- **Path-prefix allowlist for `openShellPath`.** A path-side twin of the URL-scheme seam for hosts embedding untrusted content. Requires an OS-path-canonicalization design and a stated threat model — a real design pass, not a sweep — and depends on the **path-safety posture** Open direction (Open direction 4). (Gold roadmap › allowlist hardening)
- **Second, non-Electron host adapter (Tauri / `host-opener` / a fake).** Proves the seam is not Electron-shaped and exercises the currently-inert `openPath` options. Lives in the host-package track, not in `shell`; and whether it is part of `authoritative` for this cell is itself the **second-host-validation** Open direction (Open direction 5). Cross-package — parked. (Gold roadmap › a second host)
- **Rust port `flighthq-shell`.** The charter declares `crate: flighthq-shell` but no `crates/` tree exists in this worktree; the port is unstarted. Correctly deferred to follow the TS API freeze, and a separate-crate effort with its own native-backend crate choices (`opener`/`trash`/`mslnk`). A strong first-port candidate (value/side-effect leaf), but cross-crate and gated on the naming decision below — parked. (review.md › Gaps; Gold roadmap › Rust-port parity)

## Approved

_None yet — approval is the user's verbal gate._

## Notes for the charter (Open directions)

These are design forks / cross-package calls the review surfaced; they belong in `charter.md › Open directions`, not in `Recommended`. Recorded here for the next direction session — this assessment does **not** edit the charter.

1. **Export-naming convention** — namespace every export with the `shell` word, or keep the Electron-canonical un-prefixed names (`openExternalUrl`, `showItemInFolder`, `moveItemToTrash`) for the high-frequency four? A public-API fork that should be settled and recorded as a Decision _before_ the Rust port mirrors a frozen surface.
2. **`getFileIcon` scope** — in-scope here (pulling an `ImageSource` / native-image dependency into a thin seam, against bundle-size discipline) or deferred to a dedicated `@flighthq/nativeimage` cell? Crosses a package boundary; the roadmap leans defer.
3. **Error-fidelity boundary** — is bare-boolean acceptable for batch trash and shortcut write, or is the `*Result` (OS-error-string) sibling part of the package's definition of done? Gates the first Backlog item.
4. **Path-safety posture** — does the security boundary stop at URL schemes, or does `openShellPath` need a path-prefix allowlist for untrusted-content hosts? Defines the package's threat model and gates the path-allowlist Backlog item.
5. **Second-host validation as a boundary** — is a non-Electron host adapter part of `authoritative` for this cell, or owned by the host-package track and out of `shell`'s scope?
