---
package: '@flighthq/host-electron'
crate: null
lastDirection: null
draft: true
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# host-electron — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

The Electron main-process **host adapter** — concrete implementations of Flight's platform/host capability seams (`*Backend` traits in `@flighthq/types`) realized over the real `electron` module. It is an _adapter_, not a domain library: it owns no capability semantics of its own, only the translation between a Flight seam and an Electron API call. Each capability is a granular `createElectron<Cap>Backend(electron)` factory, with one-call `registerElectronBackends(electron, options?)` to wire them all. The `electron` module is **injected** (typed against a local `ElectronApi` interface, the exact Electron slice Flight depends on), so the package carries no `electron` dependency and is fake-testable.

Where it ends: it fills sixteen of Flight's host seams (window, app, dialog, clipboard, menu, tray, shortcut, screen, power, notification, shell, protocol, updater, ipc, platform, storage) as one Electron main process can serve them. It does **not** define those seams — they live in their owning capability packages and `@flighthq/types`. It is **not** re-exported from `@flighthq/sdk` (an adapter installed in the host process, not app-facing API). It has no Rust mirror (`crate: null`) — Electron's substrate does not exist in the Rust box. Its siblings (a future `host-tauri`, `host-capacitor`) fill the same seams over different hosts.

## North star (proposed)

_Proposed durable principles, inferred from the design and the structural forks. Confirm or revise in a direction pass; until then these are candidates, not blessed._

- **Exhaustive, faithful seam coverage.** The bar is "every `@flighthq/types` host seam method an Electron main process can serve has a real Electron call or a documented sentinel." Completeness against the seam — not feature invention — is the measure of done. (See Open directions: should this be made mechanical by a committed seam-audit table?)
- **Sentinels at the seam, never throws.** Guard every API; return the documented sentinel (`null`/`false`/`-1`/`''`/`[]`/no-op) when an Electron capability is unavailable or a main process cannot read it. An inert return is honest, not broken.
- **`electron`-free and fake-testable.** Depend only on a local `ElectronApi` (and `ElectronFs`) interface declaring exactly the Electron slice consumed. The host passes `electron` explicitly; the package never imports it (nor `node:fs`). This keeps the adapter unit-testable with a fake and decoupled from the Electron version.
- **Adapter, not authority.** Hold no capability semantics of its own and define no cross-package types — translation only. Types come from the owning capability packages and `@flighthq/types`; `ElectronApi`/`ElectronFs`/`ElectronBalloonOptions` are adapter-local Electron-shape interfaces, not a types-layer leak.
- **Granular factories + one-call registration.** Every seam is an independently usable `createElectron<Cap>Backend` factory, composed by a single `registerElectronBackends`. Side-effect-free (`"sideEffects": false`), single root `.` export, no top-level registration.

## Boundaries (proposed)

_Proposed scope lines, drawn from the review and neighboring packages. Confirm in a direction pass._

**In scope:**

- Electron **main-process** implementations of every host seam Flight defines that a main process can serve, plus the window-identity escape hatches (`getElectronBrowserWindow` / `getElectronWindowId` / `getApplicationWindowForElectronId`).
- The injected `ElectronApi` surface — the curated, version-tolerant slice of Electron the adapter depends on, including the `fs` slice threaded for storage.
- Honest sentinels for capabilities a main process cannot read (battery detail, thermal, inline notification reply, `setTemplate` best-effort).

**Non-goals (proposed):**

- **Not** an owner of seam definitions — those live in the capability packages and `@flighthq/types`.
- **Not** re-exported from `@flighthq/sdk` (it is host-process infrastructure, not app-facing API).
- **Not** a Rust crate (`crate: null`).
- **Not** a full `filesystem` backend — only the `fs` slice needed for storage is injected today; a complete `@flighthq/filesystem` Electron backend is out of scope here (a future node-fs injection / `host-capacitor` covers the broader case).
- **Not** the renderer/preload side — receive-only IPC today; main→renderer messaging is an open design question, not assumed in scope.

## Decisions

None blessed yet.

## Open directions

_The undecided questions. Each is a candidate the review surfaced or a structural fork that touches this package; a direction pass should settle them._

- **Exhaustiveness as the North star — make it mechanical?** Is the bar literally "every `@flighthq/types` host seam method has an Electron call or a documented sentinel," enforced by a committed **seam-audit table** mapping each seam method → its Electron call or sentinel? Such a table would also pin which inert returns are permanent (main-process limits) vs. deferred. (The natural parallel to the Rust conformance/divergence map.)
- **Updater path ruling (design fork).** Is `electron-updater` the blessed production updater — warranting a second `createElectronUpdaterAutoBackend` factory with real progress/channel/cancel/rollback — or does host-electron stay Squirrel-only and richer updates live elsewhere? Today `downloadUpdate` folds into `checkForUpdates` and `subscribeDownloadProgress` is inert.
- **Renderer-targeted IPC (cross-package fork).** IPC is effectively receive-only (`send` no-ops, `invoke` resolves `undefined` — no `webContents` target). Closing this needs either an `IpcBackend` seam change in `@flighthq/types` (a target-window field) or a window-specific factory (`createElectronIpcBackendForWindow`). Is main→renderer messaging in scope for this adapter at all?
- **`WindowBackend` completeness boundary (cross-package fork).** Are macOS/Windows-specific window controls (`setVisibleOnAllWorkspaces`, `setKiosk`, `setRepresentedFilename`, `setOverlayIcon`, `setVibrancy`/`setBackgroundMaterial`) in scope for the seam — i.e. should `@flighthq/types` grow them with web no-ops — or are they deliberately out of the cross-platform window contract?
- **Power battery detail — accept the asymmetry?** `batteryLevel -1`, `isLowPower false`, `getBatteryHealth null`, thermal `Unknown` are genuine main-process limitations, making the Electron power story strictly poorer than the web backend. Accept and document as a seam-audit note, or pursue a richer source?
- **Sibling-host symmetry.** The map names `host-tauri` / `host-capacitor` as future siblings. Should host-electron's seam coverage and the audit table be authored as the **template** every host backend conforms to, so the suite stays symmetric?
- **Structural fork D (runtime backend seam).** host-electron is a canonical instance of the runtime-backend-seam dimension (`*Backend` trait + `set*Backend`). Confirm that this package's charter simply _references_ fork D rather than re-deciding it — and that the seam-audit-table idea is the host-suite's expression of the same exhaustiveness discipline.
- **Doc staleness (review-flagged, user's gate).** The codebase-map Package Map line and `package.json` `description` enumerate the realized seams but omit **storage** (now registered) — stale by one seam. Also worth a note that the `ElectronApi.fs` slice now exists for storage even though a full `filesystem` backend is unbuilt. Settle whether to correct these as part of a direction pass.
