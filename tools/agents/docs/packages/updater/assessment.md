---
package: '@flighthq/updater'
updated: 2026-06-24
basedOn: ./review.md
---

# updater — Assessment

Sorted from `review.md` (score `solid — 86`). This bundle already implemented essentially the entire Bronze tier and most of Silver/Gold from `reviews/maturation/depth/updater.md` (queryable state, structured error, rich progress, the name-symmetry renames, config/channels/cancel/rollback/staging, signature config, the staged-rollout helper). That roadmap is therefore largely **absorbed and spent** — what remains is either a host/cross-package task, a new-package decision, the Rust mirror, or docs. So `Recommended` is deliberately small: the genuinely sweep-safe items are in-source doc/declaration hygiene. Everything substantial that is left needs a charter decision or crosses a package boundary, and is routed to the charter's Open directions, not into `Recommended`.

The charter is a stub (North star / Boundaries / Decisions all `TODO`), so "what good means here" — seam vs. engine — is itself an open question that keeps most of the backlog parked.

## Recommended

Strictly sweep-safe: within `@flighthq/updater` (+ its own `@flighthq/types/src/Updater.ts` header), no cross-package coupling, no breaking change, no open design decision.

- **Document the no-op-stub expectation on the `UpdaterBackend` interface.** The backend grew 7 → 22 methods; any out-of-monorepo host would need to add 15, all of which can be no-op stubs. Add a type comment on `UpdaterBackend` (in `types/src/Updater.ts`) stating that web/native backends may no-op any unsupported method and return inert unsubscribes — making the existing `createWebUpdaterBackend` contract explicit rather than implied. Pure doc comment, no signature change. — review.md (Contract & docs fit, "UpdaterBackend grew 7 → 22 methods").

- **Alphabetize the `UpdaterConfig` interface fields.** The interface declares `autoDownload`/`autoInstallOnAppQuit`/`allowPrerelease` while `createUpdaterConfig` returns them alphabetized; align the interface declaration to the codebase's alphabetized-fields convention. Cosmetic, in-file, no behavior change. — review.md (Contract & docs fit, "UpdaterConfig field order").

- **Pin the `checkAndDownloadAppUpdate` simplification in a colocated test.** The fire-both behavior is documented in the function comment and is the chosen behavior for instant-trigger backends; lock it down with a test asserting both `checkForUpdates` and `downloadUpdate` fire under `autoDownload: true` and only `checkForUpdates` under `false` (the existing tests already do this — confirm they stay and add an assertion that no `update-available` gating is expected). Keeps the known simplification honest and prevents a silent semantics drift. Whether to _change_ the semantics is an Open direction (below), not this item. — review.md (Gaps: "checkAndDownloadAppUpdate is a sequencing shim").

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **`@flighthq/updater-formats` neighbor** (feed/manifest parsers: `parseUpdaterFeedYaml` for `latest.yml`, `parseUpdaterFeedJson` for Tauri/Sparkle JSON, `parseAppcastXml` for Sparkle appcast, returning `UpdateInfo[]`). **Parked:** a new package boundary (separate `package.json` / `tsconfig.json` / workspace registration) — the codebase rule forbids creating packages autonomously. It is a well-formed triad `-formats` cell (plurality guard satisfied: ≥2 formats), so it is a real candidate, but it needs the user's new-package gate. Routed to Open directions.

- **host-electron → electron-updater wiring** (real progress, cancel, channels, staging/verified events instead of the built-in Squirrel `autoUpdater`). **Parked:** a `host-electron` task that adds an `electron-updater` dependency — out of `@flighthq/updater` entirely. It is what makes the Staging/Verified infrastructure (wired here, unreachable through the current host) actually fire. Belongs to a `host-electron` session.

- **Rust `flighthq-updater` mirror.** **Parked:** no `crates/` exists in this worktree; the Rust port lives in the `rust` worktree. `isAppUpdateEligible` and the future `updater-formats` parsers are the mixable value-typed leaves and the first conformance targets — but the work is in another worktree.

- **Package-level usage doc** (lifecycle diagram Idle→Checking→Available→Downloading→Downloaded→ Staging→install / Error / Cancelled, host-registration guide, host-electron mapping table). **Parked:** larger than an in-source sweep and partly depends on the host-electron mapping being settled; a Gold docs deliverable, not a within-package code fix.

- **`checkAndDownloadAppUpdate` real sequencing** (await `update-available` before downloading on async backends, via a backend `checkAndDownload`/callback method). **Parked:** a contract-shape design decision — changing it alters `UpdaterBackend`. Routed to Open directions; the Recommended item above only pins the _current_ behavior.

- **Refresh the codebase-map Package Map line for `@flighthq/updater (event)`.** It still describes the pre-bundle six-signal shape. **Parked:** the map is owned by the codebase-map maintainer, not this package; flag as a candidate revision for that owner.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review enumerates these; the assessment confirms they are the forks that keep the bulk of the backlog parked:

1. **North star — seam, not engine.** Bless that "good" is a complete, queryable, host-fillable _contract_, with all real mechanism (signing, differential download, staging, rollback) behind `UpdaterBackend`. This is the rubric that turns every remaining backlog item from "missing feature" into "host/cross-package work the package only contracts."
2. **`@flighthq/updater-formats` neighbor** — approve/deny the feed/manifest parser package and its shape (the `-formats` triad cell; plurality guard satisfied).
3. **`checkAndDownloadAppUpdate` semantics** — keep the documented fire-both convenience, or require a real sequenced `checkAndDownload` on the backend for async hosts?
4. **`UpdaterSignatureConfig` algorithm enum** — bless `'ed25519' | 'minisign' | 'rsa-sha512'` and `sha512` (vs a generic `checksum`) as the committed header-layer integrity contract.
5. **host-electron deeper integration** — schedule the electron-updater wiring (a `host-electron` session) that lights up the Staging/Verified/cancel/channel events the contract already exposes.
6. **Rust `flighthq-updater` parity** — when the Rust port advances, mirror the seam with `is_app_update_eligible` + `updater-formats` parsers as the first mixable conformance leaves.
