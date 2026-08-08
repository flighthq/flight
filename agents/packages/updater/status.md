---
package: '@flighthq/updater'
updated: 2026-08-08
by: principal
---

# updater — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/updater/src/`, `packages/types/src/Updater.ts`, and the one host that
implements the seam on 2026-08-08. A file:line here is a claim about this tree, not about a session.

- **Nothing parses an update feed.** There is no `@flighthq/updater-formats` package and no
  `parseUpdaterFeed*` / `parseAppcast*` symbol anywhere in `packages/`. `setUpdaterFeedUrl`
  (`updater.ts:264`) only hands a URL to the backend, so the host owns every byte of feed
  interpretation and must mint `UpdateInfo` itself.
- **`checkAndDownloadAppUpdate` fires both calls in one turn** (`updater.ts:72-78`): it invokes
  `checkForUpdates()` and, under `autoDownload`, `downloadUpdate()` immediately — it does not wait for
  an update-available event. Fine for a trigger-style backend, wrong for one that needs the sequential
  flow. Pinned by a colocated test so it cannot drift silently.
- **`UpdaterError.kind` is an open `string`** (`types/src/Updater.ts:29-31`), so a caller cannot switch
  exhaustively; the conventional values live only in the type comment.
- **The Electron backend is the built-in Squirrel updater, so most of the seam is honest no-ops.**
  `downloadUpdate` re-runs `checkForUpdates` (`host-electron/src/electronUpdater.ts:19-22`);
  `cancelDownload`, `rollback`, and `setSignatureConfig` do nothing (`:23-48`); and
  `subscribeDownloadProgress` / `Cancelled` / `RolledBack` / `Staging` / `Verified` return inert
  unsubscribes (`:62-96`). `UpdaterState` therefore never reaches `Downloading` or `Staging` on
  Electron, and four of the ten `AppUpdater` signals can never fire there.
- **Every Electron updater error is reported as `kind: 'Network'`** (`electronUpdater.ts:75`),
  whatever actually failed — a signature or disk error is indistinguishable from a fetch failure.
- **`isAppUpdateEligible` always returns true on Electron.** `toUpdateInfo`
  (`electronUpdater.ts:103-115`) pins `stagedRolloutPercent` to 100 and sentinels `deltaFromVersion`,
  `downloadSizeBytes`, `minimumOsVersion`, and `sha512`, so the staged-rollout gate
  (`updater.ts:231`) has no real input from the only host that supplies one.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two recorded type claims are **false**:
  no `UpdaterErrorKind` / `UpdaterPhaseKind` string unions exist (`kind` is a bare `string` and the
  phase type is `UpdaterPhase`, `types/src/Updater.ts:29`, `:50`), and `subscribeError` does not wrap
  Electron errors as `kind: 'Unknown'` — it hardcodes `'Network'` (`electronUpdater.ts:75`).
- **2026-06-25** — Pinned `checkAndDownloadAppUpdate`'s fire-both semantics with a colocated test so
  the documented instant-trigger behavior cannot drift unnoticed.
- **2026-06-24** — Updater matured to a queryable lifecycle: `UpdaterState` per entity, ten signals,
  a 22-method `UpdaterBackend`, staged-rollout and signature-config seams; the Electron adapter was
  rewritten against the new shape.
