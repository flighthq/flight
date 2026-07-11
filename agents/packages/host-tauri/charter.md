---
package: '@flighthq/host-tauri'
crate: null
draft: false
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# host-tauri — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions, and [`host-electron`](host-electron/charter.md) for the sibling-adapter template this mirrors.

## What it is

The **Tauri (v2) host adapter** — concrete implementations of Flight's platform/host capability seams (`*Backend` traits in `@flighthq/types`) realized over Tauri's JavaScript API (`@tauri-apps/api` + its official plugins). An adapter, not a domain library: it owns no capability semantics, only the translation between a Flight seam and a Tauri API call. `registerTauriBackends(tauri)` calls `set*Backend` for the **desktop seams Tauri provides**; seams Tauri doesn't cover are left to their web defaults (not registered). The Tauri API is **injected** (typed against a local `TauriApi` interface), so the package carries no `@tauri-apps/*` dependency and is fake-testable — exactly host-electron's `ElectronApi` pattern. Not re-exported from `@flighthq/sdk`. `crate: null` — Tauri's JS substrate has no Rust-box mirror (the Rust side is the app's own Tauri backend).

## North star

`registerTauriBackends(tauri)` fills the seams Tauri v2 exposes, mirroring `registerElectronBackends`. Target coverage (confirm each against the real `@tauri-apps/api` v2 + plugin surface at build time; map a seam only where a genuine Tauri call exists, else leave the web default): **window** (`@tauri-apps/api/window`), **app** (`app`), **dialog** (`plugin-dialog`), **clipboard** (`plugin-clipboard-manager`), **notification** (`plugin-notification`), **shell/opener** (`plugin-shell`/`plugin-opener`), **menu** (`api/menu`, v2), **tray** (`api/tray`, v2), **updater** (`plugin-updater`), **platform/os** (`plugin-os`), **shortcut** (`plugin-global-shortcut`), **storage** (`plugin-store`), and **protocol/deep-link** (`plugin-deep-link`) where it maps cleanly. Each backend is a thin per-file adapter (`tauriWindow.ts`, `tauriDialog.ts`, …) + a `tauriRegister.ts` aggregator, mirroring host-electron's file-per-capability layout.

## Boundaries

- **A `host-*` package** (`crate: null`, TS-only, not tree-shaken into a browser bundle, not in the sdk barrel). Injected API, no `@tauri-apps` hard dep.
- **Adapter only.** It provides backends to capability packages; it is not itself a `*Backend` and owns no capability semantics — same distinction host-electron draws.
- **Cover the real Tauri surface, sentinel the rest.** Map only seams with a genuine Tauri call; don't fabricate a backend for a capability Tauri lacks (leave the web default). Web backends already return sentinels, so an uncovered seam degrades honestly.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Injected `TauriApi`, no hard dep.** Mirror host-electron: the Tauri modules are passed to `registerTauriBackends`, typed against a local `TauriApi` interface, so the package builds and fake-tests without `@tauri-apps/*` installed.
- **[2026-07-11] Desktop seam subset; uncovered seams keep the web default.** Tauri v2's surface (window/app/dialog/clipboard/notification/shell/menu/tray/updater/os/shortcut/store/deep-link) is the coverage target; mobile-only or absent capabilities are not forced.

## Open directions

1. **Tauri v2 mobile targets.** Tauri v2 also runs on iOS/Android; a later pass could extend coverage to the mobile-relevant plugins where they overlap `host-capacitor`'s set.
2. **Renderer↔backend eventing.** Tauri's `event`/`invoke` channel as the `ipc` seam backend — the same main↔renderer design question host-electron flagged.
3. **Seam-coverage audit table.** A mechanical seam→Tauri-call (or documented-omission) table as a completeness check, mirroring host-electron's open direction.
