---
package: '@flighthq/updater'
status: solid
score: 86
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/updater.md
  - source
  - changes.patch
  - charter.md
---

# updater — Review

Evidence: `incoming/builder-67dc46d64/head/packages/updater/` + `changes.patch`, with the realized surface read from `dist/updater.d.ts` and the cross-package types from `head/packages/types/src/Updater.ts`. Findings reference `67dc46d64:<path>`. The prior depth review (`reviews/depth/updater.md`, verdict `solid — 72`) and the maturation roadmap (`reviews/maturation/depth/updater.md`) still exist in the tree; this survey absorbs and supersedes both — the work in this bundle implements essentially the entire Bronze tier and most of Silver/Gold, so the package has moved well past the 72 those reports described.

## Verdict

`solid — 86/100`. An event-capability **seam** over a host updater (the `electron-updater`/Squirrel/Sparkle/Tauri problem space), now substantially complete at the _contract_ level: a queryable per-entity lifecycle state, a structured `UpdaterError`, rich `UpdateProgress`, an enriched `UpdateInfo`, auto-download/channel/signature config, cancel/rollback/staging, and a pure staged-rollout helper. The score is `solid` not `authoritative` for the reason the depth review already named — an authoritative _updater_ owns the mechanism (manifest fetch, signature verification, differential download, staging, rollback), and all of that legitimately lives behind `UpdaterBackend` in a host adapter. As a _seam_ it is close to authoritative-for-a-seam; the gap to 100 is the items that genuinely require a host backend to be meaningful, plus a `-formats` neighbor, docs, and the Rust mirror — none in this package's hands alone. The status doc's self-estimate of 92 is optimistic against this review's distance-to-authoritative bar (it counts host-side and cross-package work the package only _contracts_), but its inventory is real and verified.

## Present capabilities (verified against source)

**Command surface** — flat free functions over the active backend (`67dc46d64:updater.ts`): `checkForAppUpdate`, `downloadAppUpdate`, `checkAndDownloadAppUpdate`, `cancelAppUpdateDownload`, `quitAndInstallUpdate`, `rollbackAppUpdate`, `setUpdaterFeedUrl`, `setUpdaterChannel`/`getUpdaterChannel`, `setUpdaterConfig`/`getUpdaterConfig`, `setUpdaterSignatureConfig`. The backend seam is `getUpdaterBackend`/`setUpdaterBackend(backend|null)` / `createWebUpdaterBackend`, with a lazily-created web default and the null-to-fallback reset. 25 exported functions in `dist/updater.d.ts`, alphabetized, each with a matching `describe` block in `updater.test.ts` (23 `describe`s, 38 `it`s — confirmed by grep).

**Event surface** — `AppUpdater` is an entity of **ten** signals (`createAppUpdater`): `onChecking`, `onDownloadProgress`, `onError`, `onUpdateAvailable`, `onUpdateCancelled`, `onUpdateDownloaded`, `onUpdateNotAvailable`, `onUpdateRolledBack`, `onUpdateStaging`, `onUpdateVerified`. `attachAppUpdater` wires every backend `subscribe*` to its matching signal (idempotent — it calls `detachAppUpdater` first), `detachAppUpdater` tears down the single combined unsubscribe stored in a module-level `WeakMap`, and `disposeAppUpdater` correctly delegates to `detachAppUpdater` (signals are plain GC memory — nothing to `destroy`).

**Queryable state** (the depth review's "single most impactful gap", now closed). `attachAppUpdater` writes each delivered event into a per-entity `UpdaterState` held in a second module-level `WeakMap<AppUpdater, UpdaterState>` _before_ emitting the signal, so `getAppUpdaterState(updater)` always reflects the latest phase without a listener having been attached. The state machine is explicit: Checking → UpdateAvailable → Downloading → Downloaded → Staging, with Error setting the `Error` phase, and cancel/rollback/not-available resetting to `Idle` (rollback also clears info/progress/error). A private `_setState` helper accepts either a full replacement or a `(prev) => next` updater function and is alias-safe by construction (reads `prev` from the map, writes `next`). `getAppUpdaterState` returns `createUpdaterState()` for a never-attached updater rather than `undefined` — a sentinel-shaped fallback. Covered by per-phase transition tests and a per-entity independence test (two updaters track state separately).

**Config & constructors.** `createUpdaterConfig` (safe defaults: manual download, no auto-install, no prerelease), `createUpdaterState` (zeroed Idle snapshot), both explicit-allocation constructors. `createWebUpdaterBackend` no-ops every command, stores channel/config locally, and returns inert unsubscribes for all ten `subscribe*` — matching the suite rule that web fallbacks degrade to sentinels rather than throw. Tests assert the no-op/inert behavior and the channel/config round-trip.

**Pure helper.** `isAppUpdateEligible(info, rolloutSeed)` — `rolloutSeed * 100 < info.stagedRolloutPercent`, a deterministic, I/O-free staged-rollout gate (Gold item). Boundary conditions tested (0, 50, 100, seed at/above threshold).

**Types** (`67dc46d64:types/src/Updater.ts`, grown from 33 to 116 lines). `UpdaterPhaseKind`, `UpdaterErrorKind` (string unions), `UpdaterError`, `UpdateProgress` (`bytesPerSecond`, `isDelta`, `percent`, `totalBytes`, `transferredBytes`), an enriched `UpdateInfo` (`downloadSizeBytes`, `deltaFromVersion`, `isMandatory`, `minimumOsVersion`, `sha512`, `stagedRolloutPercent` added to `version`/`notes`/`releaseDate`), `UpdaterState`, `UpdaterConfig`, `UpdaterSignatureConfig`, the ten-signal `AppUpdater`, and a `UpdaterBackend` of 22 methods. All in `@flighthq/types`, per the header-layer rule.

**Host wiring** (out of this package, but in the bundle). `host-electron`'s `createElectronUpdaterBackend` (`67dc46d64:host-electron/src/electronUpdater.ts`) was updated to implement the full 22-method backend, with no-op stubs for the methods Squirrel does not expose (cancel/rollback/staging/verified) and `subscribeError` wrapping the Electron error as `UpdaterError { kind: 'Unknown', message }`. Its test file was extended to the new API.

## Gaps (vs the AAA target; charter is a stub, so codebase-map standard applies)

Most are gaps-by-design for a _seam_ — the mechanism belongs in a host — but they bound what the package can claim and what "authoritative-for-a-seam" still needs:

- **`checkAndDownloadAppUpdate` is a sequencing shim, not a real combined flow.** It reads `getUpdaterConfig()`, calls `checkForUpdates()`, then immediately calls `downloadUpdate()` if `autoDownload` — two unconditional backend calls in the same tick. For a Squirrel-style backend both are instant triggers so this is harmless; for an electron-updater backend the download should start only _after_ the `update-available` event fires. The status doc flags this as a known simplification, and the function comment documents it, but the contract has no clean way to express "download once available" — the convenience can misfire on a real async backend.
- **`'Staging'` and `onUpdateVerified` are wired but unreachable through the only real host.** The state machine handles `subscribeUpdateStaging`/`subscribeUpdateVerified`, but Squirrel (the built-in Electron `autoUpdater` the current host uses) has no staging/verified event, so these only fire under a backend that does not yet exist (electron-updater wiring is deferred). Present infrastructure, no live producer.
- **No `-formats` neighbor.** Feed/manifest parsers (`latest.yml`, Tauri/Sparkle JSON, appcast XML) that hosts share are not present. The maturation roadmap recommends `@flighthq/updater-formats`; the status correctly parks it pending the new-package decision. A real gap toward a tooling-grade updater, deferred for the right reason.
- **No Rust `flighthq-updater` mirror.** The conformance map lists `updater` as a host-web-validated seam; no `crates/` exists in this worktree (the Rust port lives in the `rust` worktree). The pure `isAppUpdateEligible` and the future `updater-formats` parsers are the mixable value-typed leaves and the first conformance targets.
- **No package-level docs.** No lifecycle diagram, host-registration guide, or host-electron mapping table. The status names this as a deliberately deferred Gold item.
- **`UpdaterSignatureConfig` is configuration-only.** The package owns the algorithm enum + public key + the `onUpdateVerified` / `UpdaterError{kind:'Signature'}` result path, but verification _executes_ in the host — correct for a seam, but means the security surface is a contract with no in-package teeth (as intended).

## Charter contradictions

None. The charter's "What it is" line ("Application auto-update lifecycle — checking, downloading, installing … with progress and error events surfaced to the app") matches the code exactly, and the package stays inside that boundary: the hard mechanism is delegated to `UpdaterBackend`, no updater engine is implemented here. North star, Boundaries, Decisions, and Open directions are all `TODO` stubs, so there is no blessed rule to contradict — which is itself the main finding for the charter (see Candidate open directions).

## Contract & docs fit

**Lives up to the contract:**

- **Full unabbreviated names**, object-qualified and now symmetric: `checkForAppUpdate` / `downloadAppUpdate` / `cancelAppUpdateDownload` / `quitAndInstallUpdate` all carry the object word. This closes the depth review's named asymmetry (the old `checkForUpdates`/`downloadUpdate` were the weakest names) — the base file had `checkForUpdates`/`downloadUpdate`; the head renames both. Good.
- **Types-first in `@flighthq/types`** — every type lives in `types/src/Updater.ts`; the package imports only types from there and `createSignal`/`emitSignal` from `@flighthq/signals`.
- **Sentinels, not throws** — `getAppUpdaterState` returns an idle `UpdaterState` for an unknown entity; the web backend no-ops/returns inert unsubscribes; nothing throws on the expected paths.
- **`dispose` vs `destroy`** — `disposeAppUpdater` delegates to detach (GC memory, nothing to free), correct per the teardown-verb rule. No `destroy*` (there is no non-GC resource).
- **`Readonly<>`** — `UpdaterState`/`UpdateInfo`/`UpdaterProgress`/`UpdaterError` references are `Readonly` at the signal payloads, the state fields, and the `set*Config` parameters.
- **Single `.` export**, `sideEffects: false`, barrel is a thin `export * from './updater'`. Deps limited to `@flighthq/signals` + `@flighthq/types`. `crate: flighthq-updater` named in the charter front matter. Loose module state (`_backend`, `_states`, `_subscriptions`, `_setState`) sits at the bottom of the file after the exported functions, per source style.
- **No module-top-level side effects** — the web backend is created lazily on first `getUpdaterBackend`, not at import.

**Candidate revisions / observations (the user's gate, not the reviewer's):**

- **`UpdaterConfig` field order is not alphabetized vs. its construction.** In `types/src/Updater.ts` the interface lists `autoDownload`, `autoInstallOnAppQuit`, `allowPrerelease`; `createUpdaterConfig` returns them alphabetized (`allowPrerelease`/`autoDownload`/`autoInstallOnAppQuit`). Cosmetic, not a defect, but the interface declaration order reads oddly against the otherwise-alphabetized codebase.
- **`UpdaterBackend` grew 7 → 22 methods.** The status flags that any third-party host outside the monorepo would need to add 15 methods (all no-op-able). Pre-release this is fine, but the `UpdaterBackend` type comment does not yet spell out "web/native no-op defaults are acceptable for unsupported methods" — worth a doc line on the interface so the no-op-stub expectation is explicit.
- **`enableAppUpdaterSignals` is correctly absent.** The maturation seed asks whether signal allocation should be gated behind an `enable*` to match the suite. Verified against the live suite: `network`, `power`, `lifecycle`, `sensors`, and `keyboard` all allocate their signals unconditionally in `create*` with **no** `enable*` gate. So updater's unconditional ten-signal allocation **matches** suite convention — this maturation item resolves to "no change needed", not a gap. (The `enable*DisplayObjectSignals` pattern in the codebase map is for graph-node subsystems, not the platform-suite event capabilities.)
- **Package Map line is stale.** The codebase map describes `@flighthq/updater (event)` as "checking/available/progress/downloaded/error signals plus check/download/quit-and-install commands" — the pre-this-bundle six-signal shape. The package now has ten signals plus cancel/rollback/staging/verified, channels, config, signature config, and a queryable state. The Package Map entry should be refreshed to match (candidate revision for the map owner).

## Candidate open directions (charter is a stub — these are the questions it should settle)

1. **North star.** Confirm the durable bar: this is a **seam, not an engine** — "good" is a complete, queryable, host-fillable _contract_, with all real mechanism (signing, differential download, staging, rollback) behind `UpdaterBackend`. Bless this so future work is judged against "make the contract authoritative" rather than "implement an updater."
2. **`@flighthq/updater-formats` neighbor.** Approve/deny the feed/manifest parser package (`parseUpdaterFeedYaml` for `latest.yml`, `parseUpdaterFeedJson` for Tauri/Sparkle, `parseAppcastXml` for Sparkle appcast), returning `UpdateInfo[]`. Matches the established `-formats` triad pattern and the plurality guard is satisfied (≥2 formats). Cross-package, needs the user's new-package gate.
3. **`checkAndDownloadAppUpdate` semantics.** Keep it as a documented fire-both convenience, or require the backend to expose a real `checkAndDownload`/await-available method so it sequences correctly on async hosts? This is a contract-shape decision.
4. **`UpdaterSignatureConfig` algorithm enum.** Bless the `'ed25519' | 'minisign' | 'rsa-sha512'` set and `sha512` (vs a generic `checksum`) as the committed integrity contract, since it lives in the header layer and any host must fill it.
5. **host-electron deeper integration (Silver completion).** Wiring `host-electron` to the `electron-updater` npm package (not the built-in Squirrel `autoUpdater`) to expose real progress, cancel, channels, and staging/verified events. A `host-electron` task with a new dependency — surface it there, not here.
6. **Rust `flighthq-updater` parity.** When the Rust port advances: backend trait + `set_*_backend`, commands as free functions, the value structs in `flighthq-types`, the `*Kind` unions as Rust enums, and `is_app_update_eligible` + the `updater-formats` parsers as the first mixable conformance leaves. The Gold seed notes a native default backend (self-replace + relaunch) is viable behind the `native` feature.

## Notes for status verification (as-claimed → verified)

The worker status checks out against the diff. Verified: 38 tests in `updater.test.ts` (grep), 25 exported functions in `dist/updater.d.ts`, the two renames (`checkForUpdates`→`checkForAppUpdate`, `downloadUpdate`→`downloadAppUpdate`) present in head and absent (old names) in base, all ten signals present in `createAppUpdater`, the `WeakMap<AppUpdater, UpdaterState>` state machine, the 22-method `UpdaterBackend`, the enriched `UpdateInfo`, and the `host-electron` backend update + its test. The status's two concerns are accurate and worth keeping live: (a) the 7→22 backend-method growth burdens out-of-monorepo hosts, and (b) `checkAndDownloadAppUpdate` is a fire-both shim that can misfire on an async host. The status's `enableAppUpdaterSignals` deferral is moot — the suite does not use that pattern (verified above). The self-estimated 92 over-counts host-side and cross-package work; the in-package inventory it claims is real.
