---
package: '@flighthq/filesystem'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/filesystem

> Recommendations over `review.md` (solid, 88/100). This pass (builder-67dc46d64) widened the package 17 → 43 exports and landed **essentially the whole Bronze and Silver tier** of the maturation roadmap: explicit directory verbs, recursive traversal + glob, ranged + streaming I/O, atomic write, the symlink/permissions seam, disk-usage introspection, and the public path utilities. What remains splits into a very small set of sweep-safe within-package hardening items and a larger backlog that is almost entirely **Gold-tier**: design forks, cross-package coordination, and the Rust mirror.
>
> The charter is still a stub — North star, Boundaries, and Decisions are all `TODO` — so anything that needs a scope, naming, or dependency-posture decision cannot be Recommended; those are routed to the charter's Open directions (listed at the bottom, **not** edited into the charter here). The prior roadmap (`reviews/maturation/depth/filesystem.md`) is fully absorbed here and can be removed as one-time seed.

## Recommended

Strictly sweep-safe: within `@flighthq/filesystem`, no cross-package coupling, no breaking change to the public surface, no open design decision. Safe for a blanket "do all recommended."

1. **Symlink-loop detection in the recursive walk.** `walkWebDirectory` (filesystem.ts) recurses by `depth < maxDepth` with no visited-set guard, so a `followSymlinks` walk over a cyclic link tree (on a native backend that follows links) recurses until `maxDepth`/stack exhaustion. Add a visited real-path set to the walk and stop on a repeat. Pure internal robustness — the export shape, sentinels, and `FileWalkOptions` contract are unchanged. The web/OPFS default has no symlinks so there is no live web behavior to break; the fix exists to make the seam safe before a native host uses it. — review.md#gaps (edge sweep)

2. **Web-backend hardening: persistent-storage + Permissions API.** The OPFS default never calls `navigator.storage.persist()` and its probe paths (`fileExists`/`directoryExists`/`canAccessFile`) do not consult the Permissions API. Request persistent storage where appropriate and query permissions in probe paths so capability checks do not rely solely on try/catch. Within-package refactor of `createWebFileSystemBackend`; the sentinel contract (reads → `null`/`[]`, writes → `false`, never throw) is unchanged. — reviews/maturation/depth/filesystem.md (Silver: web backend hardening — not yet landed)

3. **De-duplicate the `getWebRoot()` + try/catch blocks.** `getWebRoot()` is called from ~10 sites, each wrapped in near-identical guard/try-catch scaffolding that has grown with the seam. Fold the repeated "resolve root → walk to handle → guard" shape behind one or two shared internal helpers at the file bottom. Pure within-package refactor, no public surface change; pairs naturally with item 2. — reviews/maturation/depth/filesystem.md (Silver: de-duplicate as the seam grows)

## Backlog

Parked: each crosses a package boundary, needs a design decision the stub charter has not made, or is larger Gold-tier / other-worktree scope. Not sweep-eligible.

- **Naming reshape: `renameFile` → `renamePath` (+ maybe `renameDirectory`).** `renameFile` moves directories too (OPFS copy+remove is type-agnostic) yet the name says `File`. **Parked: design/naming decision** — a pre-release API reshape that is cheap now and breaking later; needs a yes/no before native hosts commit to the contract. Routed to Open directions. — review.md#contract-&-docs-fit; candidate-open-directions (6)

- **`findFiles` over-promise: directory-filter or rename.** `findFiles` returns _all_ `FileEntry` results including directories (its `**/*` test matches a `sub` directory). **Parked: design choice** — the review frames it as "either filter to `!isDirectory` _or_ rename to `findPaths`/`findFileEntries`," a behavior-vs-naming fork the charter has not settled. Routed to Open directions. — review.md#contract-&-docs-fit; candidate-open-directions (6)

- **`removeFile` strictness — record the Decision.** The POSIX file/directory split landed (`removeFile` now verifies a file handle; `removeDirectory` owns directories). **Parked: Decision-to-record** — confirm `removeFile` stays strictly file-only rather than reverting to convenience recursion, and freeze it as a blessed Decision so a later agent does not re-add recursion. Routed to Open directions. — review.md#candidate-open-directions (5)

- **The `@flighthq/dialog` coupling — cross-cell dependency policy.** The four `*DialogHandle*` bridges make `filesystem` the first platform-suite cell importing a _sibling_ cell (`getWebFileSystemHandle` from `@flighthq/dialog`) rather than only `@flighthq/types`. **Parked: design fork** (structural-fork A — where a capability's data lives vs. its graph/participation). The most consequential undecided question; sanction it, or rehome the bridge (in `dialog`, or a thin `@flighthq/dialog-filesystem` seam). Routed to Open directions. — review.md#charter-contradictions; candidate-open-directions (1)

- **`@flighthq/path` extraction.** The path utilities (`joinFilePath`, `getFileBaseName`, `getFileDirectoryName`, `getFileExtensionName`, `normalizeFilePath`, `isAbsoluteFilePath`) are pure value-typed leaves currently homed in `filesystem`. **Parked: cross-package** — a clean Wasm-mixable leaf (structural-fork D) whose extraction is gated on a second consumer (`resources`, `loader`). Surface, don't assume. Routed to Open directions. — review.md#candidate-open-directions (2)

- **File-watch: command → event capability.** Promoting the bare `watchPath(path, listener)` callback to a `FileSystemWatch` event entity (signals, recursive watch, debounce/coalesce, rename-as-`moved`), mirroring `@flighthq/network`. **Parked: design fork** (structural-forks B/F) — adds a `@flighthq/signals` dependency to a currently `@flighthq/types`-only package and reshapes a contract no native host has committed to; gate behind an `enableFileSystemWatch` group. The web no-op means no live web consumer to break. Decide before any `host-*` backend hardens the old contract. Routed to Open directions. — review.md#gaps; candidate-open-directions (3)

- **Locking & sync-access.** `lockFile`/`releaseFileLock` advisory brackets and the OPFS `createSyncAccessHandle` worker-context fast path (`openFileSyncAccess`). **Parked: larger scope** — Gold-tier; the sync-access path needs a worker test harness and the lock bracket is mostly a native contract. — review.md#gaps; depth-roadmap Gold

- **Bulk directory operations.** `copyDirectory`, `moveDirectory`, `emptyDirectory`, `getDirectorySize`, and a callback-style `walkFileTree` for huge trees without materializing a `FileEntry[]`. **Parked: larger scope** — Gold-tier; implementable over the new recursive walk but a sizeable addition best sequenced after the seam freezes. — review.md#gaps; depth-roadmap Gold

- **`@flighthq/filesystem-formats` (archive-as-backend).** Mounting zip/tar through `FileSystemBackend` (`setFileSystemBackend(createZipFileSystemBackend(bytes))`). **Parked: design fork** — must clear the bedrock/plurality guard (structural-forks B/D/E) before building; it bends "host capability seam" toward a virtual-fs abstraction. Routed to Open directions. — review.md#gaps; candidate-open-directions (4)

- **Full edge-case sweep.** Windows path normalization (`\`, UNC, drive letters beyond the `isAbsoluteFilePath` regex), text-encoding options beyond UTF-8, BOM handling, and a `getFileSystemCapabilities()` per-backend matrix. **Parked: mixed scope** — the capability matrix and Windows-path support touch the seam contract (cross-host) and the encoding options are a public-API addition; larger than a sweep and partly decision-gated. (The pure within-walk loop guard is split out as Recommended item 1.) — review.md#gaps; depth-roadmap Gold

- **Rust mirror — `flighthq-filesystem`.** The crate is mapped (`crate: flighthq-filesystem`, native-default over `std::fs` per the host-layer rule) but unbuilt; the path module is a clean mixing candidate. **Parked: other worktree** — out of scope for this TS worktree, and correctly held until the Silver seam stops moving to avoid re-porting a moving contract. — review.md#gaps; depth-roadmap Gold

- **Admin-doc widening (Package Map + host-electron entry).** The Package Map line for `@flighthq/filesystem` ("file read/write/list/stat and standard directory paths") now badly undersells the package (no streaming, atomic write, glob, symlink/perm seam, or dialog bridge), and the `host-electron` entry could name `filesystem` among the seams a node-fs backend fills. **Parked: cross-doc, user-gated** — edits the shared top-level `tools/agents/docs/index.md`, not the package, so it is outside the sweep boundary. — review.md#contract-&-docs-fit (admin-doc drift)

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Routed to the charter's Open directions (not edited here)

These are charter silences this assessment had to assume past — surfaced for an explicit direction conversation, not actioned:

1. **Boundary — cross-cell dependency policy** (the `@flighthq/dialog` coupling). Is a platform-suite cell importing a sibling cell sanctioned, or does the dialog-handle bridge belong in `dialog` / a thin `dialog-filesystem` seam? Touches structural-fork A. — review.md#candidate-open-directions (1)
2. **Boundary — `@flighthq/path` extraction.** Path utilities ship in `filesystem` vs. a shared sibling `@flighthq/path`, gated on a second consumer. Structural-fork D Wasm-mixable leaf. — review.md#candidate-open-directions (2)
3. **North star — file-watch as command vs. event capability** (the `FileSystemWatch` / `@flighthq/signals` question). Decide before any native host hardens the bare-callback `watchPath`. — review.md#candidate-open-directions (3)
4. **Boundary — `filesystem-formats` archive-as-backend.** Whether mounting an archive through `FileSystemBackend` is in scope; run the bedrock/plurality guard first. — review.md#candidate-open-directions (4)
5. **Decision — `removeFile` strictness.** Confirm the file-only POSIX split is the blessed behavior and record it so recursion is not re-added. — review.md#candidate-open-directions (5)
6. **Naming reshape window** — `renameFile`→`renamePath` (+ `renameDirectory`?) and the `findFiles` directory-filter-vs-rename fork. Pre-release-cheap; needs a yes/no before native hosts exist. — review.md#candidate-open-directions (6)
