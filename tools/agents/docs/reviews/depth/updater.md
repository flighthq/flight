# Depth Review: @flighthq/updater

**Domain**: Application auto-update lifecycle — checking for, downloading, and installing a new version of a desktop/native application, with progress and error events surfaced to the app (the `electron-updater` / Squirrel / Sparkle / WinSparkle / Tauri-updater problem space).

**Verdict**: solid — 72/100

This package is an event-capability seam in Flight's platform-integration suite, not a standalone updater engine. Judged against what such a seam is _intended_ to be — a thin, swappable contract over a host updater — it is essentially complete: the full canonical lifecycle (check → available/not-available → download progress → downloaded → quit-and-install), feed-URL configuration, an entity-of-signals event surface, a guarded web fallback, and the create/attach/detach/dispose lifecycle that every other Flight event capability follows. The score is "solid" rather than "authoritative" because an _authoritative_ updater library owns the update mechanism itself (manifest fetch, signature/hash verification, differential download, staging, rollback) — here that all lives behind `UpdaterBackend` in a host adapter (`host-electron`), by design. As a seam it is well-shaped; as an updater it delegates almost everything.

## Present capabilities

Command surface (flat free functions over the active backend):

- `checkForUpdates()` — trigger a check.
- `downloadUpdate()` — fetch the available update.
- `quitAndInstallUpdate()` — relaunch into the staged update.
- `setUpdaterFeedUrl(url)` — point at an update feed.
- `getUpdaterBackend()` / `setUpdaterBackend(backend | null)` / `createWebUpdaterBackend()` — the backend seam, with a lazily-created web default and a null-to-fallback reset.

Event surface (`AppUpdater` entity of six signals + `UpdateInfo` payload):

- `onChecking`, `onUpdateAvailable(info)`, `onUpdateNotAvailable`, `onDownloadProgress(percent)`, `onUpdateDownloaded(info)`, `onError(message)`.
- `UpdateInfo { version, notes, releaseDate }`.
- `createAppUpdater()` / `attachAppUpdater()` / `detachAppUpdater()` / `disposeAppUpdater()` — allocate inert signals, wire/unwire backend delivery (idempotent attach that tears down a prior subscription first; one combined unsubscribe per updater stored in a `WeakMap`).

The web backend correctly no-ops every command and returns inert unsubscribes, matching the suite rule that web fallbacks degrade to sentinels rather than throw. The six-event lifecycle is the canonical `electron-updater` shape (checking-for-update / update-available / update-not-available / download-progress / update-downloaded / error), so the vocabulary is industry-recognized and maps 1:1 to the most common host. A colocated test file exists.

## Gaps vs an authoritative auto-update library

Most of these are gaps-by-design for a _seam_ (the work belongs in a host backend), but they are the features an end-to-end updater library is expected to expose, so they bound what this package can claim on its own:

- **No version/state query (gap-by-omission for a seam).** There is no `getUpdaterState()` / `isUpdateAvailable()` / `getCurrentVersion()` / `getDownloadedUpdate()`. The lifecycle is event-only; a consumer that attaches late cannot ask "is there a pending update?" — it must have been listening. A mature updater exposes a queryable current state alongside events.
- **No combined check-and-download / auto-download policy.** Real updaters expose `autoDownload`, `autoInstallOnAppQuit`, and an `allowPrerelease` / channel selector. None of that is modeled — only manual `checkForUpdates` then `downloadUpdate`.
- **No update channels.** `setFeedUrl` is a single URL; there is no `stable`/`beta`/`alpha` channel concept, which is table stakes for shipping a real app.
- **No integrity/security surface.** No notion of signature verification, public-key/cert configuration, or checksum — the canonical reason an updater is hard. Delegated entirely to the backend with no contract for it.
- **No staging/rollback or progress detail.** `onDownloadProgress(percent)` is a single number; mature backends report bytes-transferred / total / bytes-per-second / ETA. No `onUpdateCancelled`, no `cancelDownload()`, no differential/delta-download concept, no rollback hook.
- **No structured error type.** `onError(message: string)` loses the failure category (network vs signature vs disk vs already-up-to-date). An authoritative library carries a typed error.
- **`UpdateInfo` is minimal.** `{ version, notes, releaseDate }` — no download size, no SHA, no mandatory/critical flag, no minimum-OS or staged-rollout percentage.

## Naming / API-shape notes

- Naming is consistent and self-identifying: the command functions all carry their object word (`checkForUpdates`, `downloadUpdate`, `quitAndInstallUpdate`, `setUpdaterFeedUrl`), and the backend/entity lifecycle mirrors the rest of the platform suite (`get*/set*/createWeb*Backend`, `create*/attach*/detach*/dispose*`). This is exactly the "event capability" shape the codebase map prescribes.
- Slight asymmetry worth noting: three commands keep the bare backend method name (`checkForUpdates`, `downloadUpdate`) while two are object-qualified (`quitAndInstallUpdate`, `setUpdaterFeedUrl`). The backend method is `quitAndInstall`/`checkForUpdates`; the public functions diverge case-by-case. Per the global-uniqueness rule, `checkForUpdates` and `downloadUpdate` are the weakest names here — `checkForAppUpdate` / `downloadAppUpdate` would be more globally self-identifying and symmetric with `quitAndInstallUpdate`.
- `disposeAppUpdater` correctly just delegates to `detachAppUpdater` (signals are plain GC memory, nothing to `destroy`), which matches the dispose/destroy distinction.
- The entity/runtime split is light here: `AppUpdater` is a pure entity of signals with no paired runtime; subscription bookkeeping lives in a module-level `WeakMap`. Reasonable for a singleton-ish host capability, though it means two `AppUpdater`s share one global backend (correct for this domain — there is one OS updater).

## Recommendation

Treat this as a near-complete _seam_, not an updater engine — that is the right scope for the SDK. To move it from "solid" toward authoritative-for-a-seam without overreaching into backend territory:

1. Add a queryable state surface: `getAppUpdaterState()` returning the current phase plus the last `UpdateInfo`, so late subscribers and UI can read status without having listened. This is the single most impactful gap.
2. Enrich the contract that backends fill: a typed error payload on `onError`, richer progress (bytes/total/bps) on `onDownloadProgress`, and a `cancelDownload()` command — these are seam-level shape decisions, not engine work.
3. Model channels and auto-download policy at the type layer (`setUpdaterChannel`, an `autoDownload`/`autoInstallOnQuit` config) even if the web default no-ops them, so the contract is authoritative and host backends have somewhere to implement.
4. Expand `UpdateInfo` (download size, checksum, mandatory flag) since this crosses the package boundary and lives in `@flighthq/types`.

Everything genuinely hard about auto-update (signing, differential download, staging, rollback) is legitimately a `host-*` concern and should stay there; the package's job is to make that contract complete and queryable, which is most of what's left.
