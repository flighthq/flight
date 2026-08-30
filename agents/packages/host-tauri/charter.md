---
package: '@flighthq/host-tauri'
role: host
crate: null
draft: false
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# host-tauri — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions, and [`host-electron`](../host-electron/charter.md) for the sibling-adapter template this mirrors.

## What it is

The **Tauri (v2) host adapter** — concrete implementations of Flight's platform/host capability seams (`*Backend` traits in `@flighthq/types`) realized over Tauri's JavaScript API (`@tauri-apps/api` + its official plugins). An adapter, not a domain library: it owns no capability semantics, only the translation between a Flight seam and a Tauri API call. `registerTauriBackends(tauri)` returns explicit providers only for the **desktop seams its injected API provides**; other Host slots are absent. The Tauri API is **injected** (typed against a local `TauriApi` interface), so the package carries no `@tauri-apps/*` dependency and is fake-testable — exactly host-electron's `ElectronApi` pattern. Not re-exported from `@flighthq/sdk`. `crate: null` — Tauri's JS substrate has no Rust-box mirror (the Rust side is the app's own Tauri backend).

## North star

`registerTauriBackends(tauri)` fills the seams its injected Tauri v2 facade exposes, mirroring
`registerElectronBackends`. The current `TauriApi` has no updater-plugin transaction, so
`Host.updater` is exactly empty. Each backend is a thin per-file adapter (`tauriWindow.ts`,
`tauriDialog.ts`, …) plus a `tauriRegister.ts` aggregator.

## Boundaries

- **A `host-*` package** (`crate: null`, TS-only, not tree-shaken into a browser bundle, not in the sdk barrel). Injected API, no `@tauri-apps` hard dep.
- **Adapter only.** It provides backends to capability packages; it is not itself a `*Backend` and owns no capability semantics — same distinction host-electron draws.
- **Cover the real injected Tauri surface, omit the rest.** Map only seams with a genuine Tauri call;
  do not fabricate a backend for a capability the injected facade lacks.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Injected `TauriApi`, no hard dep.** Mirror host-electron: the Tauri modules are passed to `registerTauriBackends`, typed against a local `TauriApi` interface, so the package builds and fake-tests without `@tauri-apps/*` installed.
- **[2026-07-11] Desktop seam subset; uncovered seams keep the web default.** Tauri v2's surface (window/app/dialog/clipboard/notification/shell/menu/tray/updater/os/shortcut/store/deep-link) is the coverage target; mobile-only or absent capabilities are not forced.
- **[2026-08-21] Uncovered seams have no implementation; host-web installation is explicit.** The 2026-07-11 web-default clause is superseded under the no-no-op rule: a capability Tauri does not cover has no host implementation, returns a sentinel with `explain*` reporting `'host-does-not-offer'`, and never silently substitutes web. This is the 2026-08-21 user ruling; rationale is recorded in the [host-web architecture](../../host-web-architecture.md).
- **[2026-08-30] Updater is an absent explicit slot.** `TauriApi` has no updater-plugin transaction;
  `registerTauriBackends` returns `updater: {}` rather than an ambient/default provider.
- **[2026-08-30] Shell coverage is an exact explicit Host subset.** Tauri constructs Entity providers for
  external URLs, path open, and path reveal. Trash, Windows shortcut links, and beep are absent slots;
  there is no aggregate Shell backend, ambient setter, or unsupported method.

## Open directions

1. **Tauri v2 mobile targets.** Tauri v2 also runs on iOS/Android; a later pass could extend coverage to the mobile-relevant plugins where they overlap `host-capacitor`'s set.
2. **Renderer↔backend eventing.** Tauri's `event`/`invoke` channel as the `ipc` seam backend — the same main↔renderer design question host-electron flagged.
3. **Seam-coverage audit table.** A mechanical seam→Tauri-call (or documented-omission) table as a completeness check, mirroring host-electron's open direction.
