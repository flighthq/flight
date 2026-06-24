---
package: '@flighthq/host-electron'
updated: 2026-06-24
basedOn: ./review.md
---

# host-electron — Assessment

The review verdict is `solid` (90/100): an exemplary host adapter whose three prior real omissions (storage, modal-parent threading, notification close) are already fixed in this bundle. The remaining gap to authoritative is small and is almost entirely **cross-package or design-gated**, not within-package neglect. That shape means `Recommended` is short and `Backlog` carries most of the named work, each item parked for a concrete reason.

The package is an _adapter_, not a domain library, so the bar is exhaustive faithful seam coverage, not feature invention. The structural forks apply only lightly here: there is no growing `kind` switch (fork B), no codec/backend triad to split (the subject triad / plurality guard), and no new package proposed (the bedrock test does not fire). The bundle invariant is satisfied — every backend is a separate `createElectron*Backend` factory, tree-shakable and not re-exported from the SDK.

## Recommended

Strictly sweep-safe: within `@flighthq/host-electron` (or its own manifest), no cross-package coupling, no `@flighthq/types` seam change, no breaking change, no open design decision.

- **Gold seam-audit table (within-package doc).** Add a committed table mapping every `@flighthq/types` host seam method this package implements to its Electron call or its documented sentinel — the natural parallel to the Rust conformance/divergence map. Documentation-only, no code change, high value for host authors and the obvious template for sibling hosts. (review.md#gaps, "Gold seam-audit table") This table is where the otherwise-parked "permanent main-process limit vs. deferred" annotations (power battery detail, IPC receive-only, updater inertness) are recorded in-package without touching any seam.
- **`package.json` description: add the `storage` seam.** The manifest `description` still enumerates the realized seams without `storage`, which is now registered in `registerElectronBackends`. A one-line fix entirely within `packages/host-electron/`, no design decision. (review.md#contract-&-docs-fit)

## Backlog

Parked — each is cross-package, design-gated, lives in another package, or is doc work outside this cell. None belongs in a blanket "do all recommended" sweep.

- **Renderer-targeted IPC.** `send` no-ops and `invoke` resolves `undefined` because the main side has no `webContents` target. Closing it requires either an `IpcBackend` seam change in `@flighthq/types` (a target-window field) or a new window-specific factory shape. _Parked: cross-package design fork — routed to the charter's Open directions; do not act autonomously._
- **Updater fidelity (electron-updater variant).** Squirrel-only today; `subscribeDownloadProgress`/`cancelDownload`/`rollback`/channel-prerelease events are inert. A real `electron-updater`-backed path is a second factory plus an `ElectronUpdaterApi` peer concept. _Parked: design fork (is electron-updater the blessed production updater?) — routed to Open directions._
- **`WindowBackend` depth (`setVisibleOnAllWorkspaces`, `setKiosk`, `setRepresentedFilename`, `setOverlayIcon`, `setVibrancy`/`setBackgroundMaterial`).** Each requires extending `WindowBackend` in `@flighthq/types` plus a web no-op before it can be filled here. _Parked: cross-package — the cross-platform window-contract boundary is a charter Open direction._
- **Power battery detail (`batteryLevel`/`isLowPower`/`getBatteryHealth`/thermal).** Genuine main-process limitations, not neglect; the Electron power story is strictly poorer than the web backend on battery. _Parked: not independently actionable — its only output is a row in the Recommended seam-audit table marking these as permanent limits._
- **Notification web-SW close path.** A service-worker-backed _web_ notification close lives in the web default backend, not in host-electron. _Parked: out of this package's scope._
- **Codebase-map staleness (Package Map seam list + node-fs-for-storage note).** The `tools/agents/docs/index.md` Package Map line for `@flighthq/host-electron` omits the now-registered `storage` seam, and its "filesystem out of scope" note predates the `ElectronApi.fs` injection used for storage. _Parked: edits to the shared codebase map (cross-file, user's doc-revision gate), not to `@flighthq/host-electron` source._

### Routed to the charter's Open directions (not edited here)

The charter is a stub (North star / Boundaries / Decisions / Open directions all `TODO`), so the following — surfaced by the review — are noted for a direction pass rather than acted on:

- **Exhaustiveness as the North star**, made mechanical by the seam-audit table (which inert returns are permanent main-process limits vs. deferred).
- **Updater path ruling** (electron-updater vs. Squirrel-only) — design fork above.
- **Renderer-targeted IPC seam** (extend `IpcBackend` vs. window-specific factory) — cross-package fork above.
- **`WindowBackend` completeness boundary** (are macOS/Windows-specific controls in the cross-platform contract?).
- **Sibling-host symmetry** — should host-electron's coverage + audit table be the template every `host-*` backend conforms to?

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._
