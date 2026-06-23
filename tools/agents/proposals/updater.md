---
id: updater
title: '@flighthq/updater'
type: depth
target: updater
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/updater.md
  - tools/agents/docs/reviews/depth/updater.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 72/100; a well-shaped event-capability seam over a host updater, complete for the lifecycle but event-only, with a thin `UpdateInfo`, an untyped error, and no queryable state, channels, policy, or integrity contract.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum to make the seam queryable and the contract honest. These are the highest-leverage gaps from the depth review.

- **Queryable state surface** (the single most impactful gap). Add to `@flighthq/types`:
  - `UpdaterPhaseKind` string union — `'Idle' | 'Checking' | 'UpdateAvailable' | 'Downloading' | 'Downloaded' | 'Error'` (string `*Kind` identifiers, not a numeric enum).
  - `UpdaterState { phase: UpdaterPhaseKind; info: Readonly<UpdateInfo> | null; progress: Readonly<UpdateProgress> | null; error: Readonly<UpdaterError> | null }`.
  - `getAppUpdaterState(updater: AppUpdater): Readonly<UpdaterState>` — lets a late subscriber or UI read status without having listened. Maintained in `attachAppUpdater` by writing each delivered event into a runtime slot (see entity/runtime note in Sequencing). `createAppUpdater` initializes phase to `'Idle'`.
- **Structured error type.** Replace `onError(message: string)` with a typed payload:
  - `UpdaterErrorKind` string union — `'Network' | 'Signature' | 'Disk' | 'Cancelled' | 'NotSupported' | 'Unknown'`.
  - `UpdaterError { kind: UpdaterErrorKind; message: string }`.
  - `onError: Signal<(error: Readonly<UpdaterError>) => void>` and `subscribeError(listener: (error: Readonly<UpdaterError>) => void)`.
- **Richer progress payload.** Replace the single `percent: number` with:
  - `UpdateProgress { transferredBytes: number; totalBytes: number; bytesPerSecond: number; percent: number }`.
  - `onDownloadProgress: Signal<(progress: Readonly<UpdateProgress>) => void>` and matching `subscribeDownloadProgress`.
- **Name symmetry fix** (pre-release, no migration cost). Rename `checkForUpdates` → `checkForAppUpdate` and `downloadUpdate` → `downloadAppUpdate` so all four commands carry the object word and match `quitAndInstallUpdate` / `setUpdaterFeedUrl`. Keep backend method names as the host's vocabulary; the public free functions are object-qualified.
- **`enableAppUpdaterSignals` convention check.** Confirm the signal-group opt-in matches the rest of the suite; if other event capabilities gate signal allocation behind an `enable*`, mirror it here rather than allocating six signals unconditionally in `createAppUpdater`.

Effort: small–medium. All type-layer shape + thread-through; web backend stays a no-op (returns the inert/idle defaults). No host work required to ship Bronze.

### Silver

Competitive with `electron-updater` / Tauri-updater at the _contract_ level — covers the configuration and lifecycle a real shipping app needs, with the web default no-opping gracefully.

- **Auto-download / auto-install policy.** Add to `@flighthq/types`:
  - `UpdaterConfig { autoDownload: boolean; autoInstallOnAppQuit: boolean; allowPrerelease: boolean }`.
  - `createUpdaterConfig(): UpdaterConfig` (explicit-allocation constructor with sane defaults: manual download, install-on-quit off, no prerelease).
  - `setUpdaterConfig(config: Readonly<UpdaterConfig>): void` + `getUpdaterConfig(): Readonly<UpdaterConfig>`, delegating to the backend.
- **Update channels.** `setUpdaterChannel(channel: string): void` / `getUpdaterChannel(): string` (`'stable'` / `'beta'` / `'alpha'` are conventional values, but it is a free string so hosts and apps can define their own). Layered over the feed-URL config, not replacing it.
- **Cancellable download.**
  - `cancelAppUpdateDownload(): void` command.
  - `onUpdateCancelled: Signal<() => void>` + `subscribeUpdateCancelled` on the entity/backend.
  - Cancel maps to `UpdaterError { kind: 'Cancelled' }` only if a backend reports it as an error; the dedicated signal is the clean path.
- **Enriched `UpdateInfo`** (crosses the package boundary, lives in `@flighthq/types`):
  - `downloadSizeBytes: number`, `sha512: string` (checksum), `isMandatory: boolean`, `minimumOsVersion: string | null`, `stagedRolloutPercent: number` (0–100, `100` = full rollout).
- **Combined convenience command.** `checkAndDownloadAppUpdate(): void` — single call that respects `autoDownload`; still resolves through signals, not a promise (keep the event shape).
- **`-formats` neighbor for manifest shapes.** Introduce `@flighthq/updater-formats` for the feed/manifest parsers that hosts share — e.g. `parseUpdaterFeedYaml` (electron-updater `latest.yml`), `parseUpdaterFeedJson` (Sparkle/Tauri JSON), `parseAppcastXml` (Sparkle appcast). Pure value-in/value-out parsers returning `UpdateInfo[]` + channel metadata; keeps the core package free of any feed-format coupling and stays tree-shakable.
- **Backend contract completeness.** Extend `UpdaterBackend` with the matching methods (`setConfig`, `getConfig`, `setChannel`, `getChannel`, `cancelDownload`, `subscribeUpdateCancelled`) so a host has a single complete interface to fill. `createWebUpdaterBackend` no-ops all of them and returns idle/inert.

Effort: medium. The type-layer work is straightforward; the real test of Silver is wiring it through `host-electron` (electron-updater already exposes `autoDownload`, `allowPrerelease`, channels, `cancel`, and `latest.yml`), so this tier is the natural pairing point with a host adapter.

### Gold

Authoritative-for-a-seam: nothing a domain expert reaching for an updater contract finds missing, full cross-host coverage, complete tests, docs, and Rust parity.

- **Integrity/security contract** (the canonical reason updaters are hard — modeled as contract, verified by host).
  - `UpdaterSignatureConfig { publicKey: string; algorithm: 'ed25519' | 'rsa-sha512' | 'minisign' }`, `setUpdaterSignatureConfig(config: Readonly<UpdaterSignatureConfig>): void`.
  - `onUpdateVerified: Signal<() => void>` and a distinct `UpdaterError { kind: 'Signature' }` path so verification failure is never silently treated as a generic error.
  - Document that verification _executes_ in the host; the package owns the configuration + result events.
- **Staging & rollback hooks.**
  - `onUpdateStaging: Signal<() => void>` (extraction/staging phase between Downloaded and install) and a `'Staging'` `UpdaterPhaseKind`.
  - `rollbackAppUpdate(): void` + `onUpdateRolledBack` for hosts that support post-install rollback (Squirrel/MSIX), no-op web default.
- **Differential / delta-download awareness.** `UpdateProgress` gains `isDelta: boolean`; `UpdateInfo` gains an optional `deltaFromVersion: string | null` so UI can communicate a small patch vs full download. Mechanism stays in the host.
- **Staged-rollout gating.** A pure helper `isAppUpdateEligible(info: Readonly<UpdateInfo>, rolloutSeed: number): boolean` (deterministic seed → eligible if `seed*100 < stagedRolloutPercent`) so apps honor staged rollout without host support; lives in core, no I/O.
- **Multiple-updater correctness.** Document and test that the global backend is shared (one OS updater); ensure `getAppUpdaterState` is per-entity (each `AppUpdater` tracks its own last-seen events) while commands route to the single backend.
- **Exhaustive tests.** Beyond the existing colocated file: attach idempotency, detach-when-not-attached, state transitions for every phase, error-kind mapping, progress accumulation, cancel mid-download, config round-trip, channel switching, and the web backend returning idle state for every query. Add an integration test exercising the full `create → attach → check → progress → downloaded → quitAndInstall` flow against a fake backend.
- **Docs.** A package-level usage doc: the seam philosophy, how a host registers a backend, the full lifecycle diagram (Idle→Checking→Available→Downloading→Downloaded→Staging→install / Error / Cancelled), and the `host-electron` mapping table (each Flight function → electron-updater call/event).
- **Rust parity — `flighthq-updater`.** 1:1 crate mirror per the conformance map (`updater` is listed as a host-web-validated seam). `UpdaterBackend` → a Rust trait with `set_*_backend`; commands as free functions (`check_for_app_update`, `download_app_update`, `cancel_app_update_download`, `quit_and_install_update`); `UpdaterState`/`UpdateInfo`/`UpdateProgress`/`UpdaterError` as plain structs in `flighthq-types`; `UpdaterPhaseKind`/`UpdaterErrorKind` as enums (Rust `*Kind` form). Native default backend can be a real updater path (e.g. self-replace + relaunch) gated behind the `native` feature, since std can serve more than the browser; the browser fill is no-op in `host-web`. The pure helpers (`is_app_update_eligible`, the `updater-formats` parsers) are mixable value-typed leaves and the first conformance targets.

Effort: large, and most of Gold's _value_ is realized only when paired with at least one real host backend; the package-side additions are mostly type shape + small pure helpers + tests/docs.

## Sequencing & effort

Recommended order:

1. **Bronze, type-layer first.** Land `UpdaterPhaseKind`, `UpdaterState`, `UpdaterError`/`UpdaterErrorKind`, `UpdateProgress` in `@flighthq/types/src/Updater.ts`, then update the package: thread state into `attachAppUpdater`, add `getAppUpdaterState`, swap the two signal payloads, do the `checkForAppUpdate`/`downloadAppUpdate` renames. Run `npm run api updater`, `npm run exports:check`, `npm run order`, `npm run check`. No host dependency — fully shippable alone.
2. **Silver type + backend contract**, then pair with `host-electron`. The `UpdaterConfig`/channel/cancel additions are cheap in types but only meaningful once a host implements them, so schedule the `host-electron` wiring alongside (electron-updater maps almost 1:1). Split `@flighthq/updater-formats` out at this point and run `npm run packages:check` for the new package shape.
3. **Gold**: security/staging/rollback contract + tests + docs, then the Rust `flighthq-updater` mirror and the mixable `updater-formats` / `is_app_update_eligible` conformance leaves.

**Entity/runtime decision to surface.** Today `AppUpdater` is a pure entity of signals with subscription bookkeeping in a module-level `WeakMap`. `getAppUpdaterState` needs per-entity last-seen storage. Per the codebase's entity/runtime split, this should be a nullable runtime slot (e.g. an `AppUpdaterRuntime` paired with the entity, or an additional `WeakMap<AppUpdater, UpdaterState>`) rather than new public fields on the `AppUpdater` entity. Decide the slot shape before Bronze, since it sets the pattern the later tiers extend.

**Cross-package / design-decision items to raise with the user (do not act autonomously):**

- Whether to add `@flighthq/updater-formats` (new package boundary) — recommended, matches the established `-formats` neighbor pattern.
- The `UpdaterError`/`UpdateProgress` payload change touches `@flighthq/types` and any `host-*` adapter that fills the backend — a coordinated change across the host packages.
- The Bronze renames (`checkForAppUpdate`, `downloadAppUpdate`) are a public-API reshape; trivial pre-release but worth confirming since they ripple to `@flighthq/sdk` re-exports and examples.
- Signature/security and rollback are genuinely host territory; the package only owns the _contract_. Confirm the contract shape (algorithm enum, `sha512` vs generic `checksum`) before committing it to the header layer.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/updater` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
