---
package: '@flighthq/filesystem'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/filesystem

> Recommendations over `review.md` (partial, 58/100 as a **merge gate** for integration b2824e3d8 vs approved origin/main eb73c3d74). The review scores the delta's fitness to merge, not the package's distance to authoritative. The design of the delta is strong and the test suite is exhaustive, but the integration head is internally inconsistent: `filesystem.ts` (and sibling `dialog.ts`) import four `@flighthq/types` symbols and eleven new `FileSystemBackend` methods that are **absent from this branch's `@flighthq/types`** — so the package cannot typecheck. That single defect dominates the gate.
>
> The cross-`@flighthq/types`/`@flighthq/dialog` fix is **not within-package** and so cannot be `Recommended` for a sweep-safe filesystem-only worker; it is the headline directive in the dispatch brief (`outgoing/integration/filesystem.md`) and is parked in Backlog here as the merge blocker. Genuinely sweep-safe, within-`packages/filesystem/` items are listed in Recommended. Design forks (path extraction, the dialog coupling, watch promotion, naming reshapes) route to the charter's Open directions, not into Recommended. The charter has a populated draft (`draft: true`) — it is unblessed, so nothing here is `Approved`.

## Recommended (sweep-safe, within `packages/filesystem/` only)

These are safe to do as a filesystem-only pass and do not depend on a user decision. **None of them, alone, makes the package compile** — that needs the cross-package `@flighthq/types` fix in Backlog. Do them alongside that fix.

1. **`findFiles` honesty: filter to files, or stay honestly named.** `b2824e3d8:filesystem.ts:318-323` returns directory entries because it filters on `name|path` regex match with no `isDirectory` guard. Either add `&& !entry.isDirectory` so the name is true, or (if directories are intended) it is a naming reshape and belongs in Open directions, not here. The conservative within-package move is to filter to files; the test at `filesystem.test.ts:370-384` already only asserts file matches, so filtering won't regress coverage — add one assertion that a directory is excluded.
2. **Confirm + document the `removeFile`/`removeDirectory` POSIX split in a durable comment.** The split landed correctly (`:509-511`, `:503-505`, `writeWebRemove(path, false)` at `:687-705`). This is the likely intended Decision (charter Open direction #5); a one-line durable comment on `removeFile` ("file-only by design; directories use removeDirectory") locks the intent in source. Cheap, within-package.
3. **Drop a `status.md`-accuracy note for the next ingest.** The bundled status doc over-claims the `@flighthq/types` additions as landed. When this package's status is next written, record that the header change must travel with the implementation (it did not, on b2824e3d8) — a continuity note so a future pass does not re-trust the claim.

## Backlog (parked — each with why)

- **[MERGE BLOCKER — cross-package] Land the `@flighthq/types` header for the new filesystem/dialog surface.** Add `FilePermissions`, `FileSystemUsage`, `FileWalkOptions` type files (+ index exports), `FileDialogHandle` to `Dialog.ts` (consumed by both `dialog` and `filesystem`), and the eleven new methods to `FileSystemBackend` in `types/src/FileSystem.ts`. _Why parked, not Recommended:_ it edits `packages/types/` and `packages/dialog/`, crossing package boundaries — outside a sweep-safe filesystem-only mandate. It is the #1 directive in the dispatch brief because the merge cannot proceed without it.
- **`@flighthq/path` extraction (fork D / E bedrock).** The pure path utils are mixable value-typed leaves; ship-here vs. a `@flighthq/path` sibling is gated on a second consumer (`resources`/`loader`). _Why parked:_ design decision + cross-package; charter Open direction #2.
- **`renameFile` → `renamePath` (+ possible `renameDirectory`).** OPFS copy+remove and native rename both move directories; the name under-describes. _Why parked:_ API-shape decision; charter Open direction #6.
- **File-watch command → event capability.** `watchPath` is a bare web-no-op callback, below the suite's event-capability convention; promotion adds a `@flighthq/signals` dependency. _Why parked:_ contract reshape + new dependency; charter Open direction #3. No live consumer (web no-op), so safe to defer until a `host-*` backend is imminent.
- **Gold-tier coverage (locking/sync-access, bulk directory ops, `getFileSystemCapabilities()`, the Windows/symlink-loop/encoding edge sweep).** _Why parked:_ scope decision (which to pursue) is charter Open direction #7.
- **Rust mirror `flighthq-filesystem` (`std::fs` default + path leaf as a `-rs` mixing candidate).** Unstarted. _Why parked:_ sequencing depends on the path-extraction decision; charter Open direction #8.

## Approved

_None. Approval is the user's verbal gate; this section is filled only when the user blesses items, frozen and stamped per CONTRACT.md._

## Notes for the charter's Open directions

These delta findings are forks/decisions, not sweep-safe work — they belong in the conversation that turns the draft charter into a blessed one, not in Recommended:

- **The `@flighthq/dialog` coupling (fork A / Open direction #1).** This delta _realizes_ the coupling the charter flagged: `package.json` now depends on `@flighthq/dialog` and `filesystem.ts:1` imports `getWebFileSystemHandle`, with four `read/writeDialogHandle*File` bridge functions (`:437-608`). Is a platform-suite cell importing a sibling cell sanctioned, or does the bridge belong in `dialog` or a thin `dialog-filesystem` seam? Most consequential undecided question; wants an explicit Decision before the bridge hardens against any native host.
- **`findFiles`/`renameFile` naming (Open direction #6)** — if directories-in-results is intended for `findFiles`, that is a rename decision, not the Recommended filter; surface it.
- **`@flighthq/path` extraction (Open direction #2)** and **watch promotion (Open direction #3)** as above.
- **Admin-doc drift (Open direction #9).** The Package Map line for `@flighthq/filesystem` still predates streaming/atomic-write/glob/the symlink-perm seam/the dialog bridge; `host-electron`'s entry could now name `filesystem` among the seams a host fills. Widen on confirmation — but only _after_ the header-layer fix makes the surface real.
