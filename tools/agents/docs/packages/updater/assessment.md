---
package: '@flighthq/updater'
updated: 2026-06-25
basedOn: ./review.md
---

# updater — Assessment

Sorted from `review.md` (merge-gate re-baseline, `partial — 38`, **REJECT for merge**). This assessment re-baselines the prior `solid — 86` assessment (written against bundle `67dc46d64`) onto the `b2824e3d8` integration delta, where the updater source rewrite landed **without** its `@flighthq/types/src/Updater.ts` header. The dominant item is therefore not a feature gap but a **merge blocker**: the package does not compile in this tree. Most of the prior backlog (host wiring, `-formats`, Rust mirror, docs) is unchanged and still parked; it is moot until the bundle builds.

The charter is a stub (North star / Boundaries / Decisions all `TODO`), so "what good means here" — seam vs. engine — remains an open question that keeps the substantive backlog parked.

## Recommended

Strictly sweep-safe: within `@flighthq/updater` (+ its own `@flighthq/types/src/Updater.ts` header), no cross-package coupling, no open design decision. **Note:** the headline blocker (landing the type contract) is _not_ sweep-safe — it co-changes `@flighthq/types` and `host-electron` and is a merge-integration directive, so it lives in the dispatch brief, not here. These three are the cleanup the in-package source should carry once it builds.

- **Land the `UpdaterConfig` interface alphabetized.** When the `@flighthq/types/src/Updater.ts` rewrite is brought in (per the dispatch brief), declare `UpdaterConfig` fields alphabetized (`allowPrerelease`/`autoDownload`/`autoInstallOnAppQuit`) to match `createUpdaterConfig`'s return order (`updater.ts:108-112`) and the codebase's alphabetized-fields convention. In-file, no behavior change. — review.md (What the design gets right; carries over from prior assessment).

- **Document the no-op-stub expectation on the `UpdaterBackend` interface.** The backend grows from 10 to ~22 methods; any out-of-monorepo host would need to add the difference, all no-op-able. Add a type comment on `UpdaterBackend` (in the landed `types/src/Updater.ts`) stating that web/native backends may no-op any unsupported method and return inert unsubscribes — making the existing `createWebUpdaterBackend` contract (`updater.ts:127-181`) explicit rather than implied. Pure doc comment, no signature change. — review.md (What the design gets right).

- **Pin the `checkAndDownloadAppUpdate` fire-both simplification in its colocated test.** The two existing tests (`updater.test.ts:357-375`) already assert both `checkForUpdates` and `downloadUpdate` fire under `autoDownload: true` and only `checkForUpdates` under `false`; keep them and add an assertion comment that no `update-available` gating is expected, so the known simplification (`updater.ts:72-78`) stays honest. Whether to _change_ the semantics is an Open direction, not this item. — review.md (Gaps, carried over).

## Backlog

Parked: blocked on the merge fix, needs a charter decision, crosses a package boundary, or is larger than a sweep. Each carries why.

- **Everything substantive is blocked on the type contract landing.** Until `@flighthq/types/src/Updater.ts` (and `host-electron/src/electronUpdater.ts`) land in the same merge, the package does not build, so no in-package recommendation can be verified or applied. This is the gate; see the dispatch brief.

- **`@flighthq/updater-formats` neighbor** (feed/manifest parsers: `parseUpdaterFeedYaml` for `latest.yml`, `parseUpdaterFeedJson` for Tauri/Sparkle JSON, `parseAppcastXml` for Sparkle appcast, returning `UpdateInfo[]`). **Parked:** a new package boundary — the codebase rule forbids creating packages autonomously. A well-formed `-formats` triad cell (plurality guard satisfied: ≥2 formats), so a real candidate, but it needs the user's new-package gate. Routed to Open directions.

- **host-electron → electron-updater wiring** (real progress, cancel, channels, staging/verified events instead of the built-in Squirrel `autoUpdater`). **Parked:** a `host-electron` task adding an `electron-updater` dependency — out of `@flighthq/updater`. Note: the prior review claimed this wiring landed in `67dc46d64`; in `b2824e3d8` `host-electron/src/electronUpdater.ts` is **not** touched, so the 22-method backend has no host implementation in this tree. Belongs to a `host-electron` session.

- **Rust `flighthq-updater` mirror.** **Parked:** no `crates/` exists in this worktree; the Rust port lives in the `rust` worktree. `isAppUpdateEligible` and the future `updater-formats` parsers are the mixable value-typed leaves and the first conformance targets — but the work is in another worktree.

- **Package-level usage doc** (lifecycle diagram Idle→Checking→Available→Downloading→Downloaded→Staging→install / Error / Cancelled, host-registration guide, host-electron mapping table). **Parked:** larger than an in-source sweep and partly depends on the host-electron mapping being settled; a Gold docs deliverable, not a within-package code fix.

- **`checkAndDownloadAppUpdate` real sequencing** (await `update-available` before downloading on async backends, via a backend `checkAndDownload`/callback method). **Parked:** a contract-shape design decision — changing it alters `UpdaterBackend`. Routed to Open directions; the Recommended item above only pins the _current_ behavior.

- **Refresh the codebase-map Package Map line for `@flighthq/updater (event)`.** It still describes the pre-bundle six-signal shape. **Parked:** the map is owned by the codebase-map maintainer, not this package; flag as a candidate revision for that owner — and only after the richer surface actually lands.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review enumerates these; the assessment confirms they are the forks that keep the bulk of the backlog parked:

1. **North star — seam, not engine.** Bless that "good" is a complete, queryable, host-fillable _contract_, with all real mechanism (signing, differential download, staging, rollback) behind `UpdaterBackend`. This is the rubric that turns every remaining backlog item from "missing feature" into "host/cross-package work the package only contracts."
2. **`@flighthq/updater-formats` neighbor** — approve/deny the feed/manifest parser package and its shape (the `-formats` triad cell; plurality guard satisfied).
3. **`checkAndDownloadAppUpdate` semantics** — keep the documented fire-both convenience, or require a real sequenced `checkAndDownload` on the backend for async hosts?
4. **`UpdaterSignatureConfig` algorithm enum** — bless the integrity-config set (`algorithm` + `publicKey`, and the `sha512` field on `UpdateInfo`) as the committed header-layer integrity contract, once the type lands.
5. **host-electron deeper integration** — schedule the electron-updater wiring (a `host-electron` session) that lights up the Staging/Verified/cancel/channel events the contract exposes.
6. **Rust `flighthq-updater` parity** — when the Rust port advances, mirror the seam with `is_app_update_eligible` + `updater-formats` parsers as the first mixable conformance leaves.
