---
package: '@flighthq/host-electron'
crate: null
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# host-electron — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

The Electron main-process host adapter -- concrete implementations of Flight's platform/host capability seams (`*Backend` traits in `@flighthq/types`) realized over the real `electron` module. An adapter, not a domain library: it owns no capability semantics of its own, only the translation between a Flight seam and an Electron API call. `registerElectronBackends(electron)` calls 16 `set*Backend` functions (window, app, dialog, clipboard, menu, tray, shortcut, screen, power, notification, shell, protocol, updater, ipc, platform, storage). The `electron` module is injected (typed against a local `ElectronApi` interface), so the package carries no `electron` dependency and is fake-testable. 55 exports across 19 source files. Not re-exported from `@flighthq/sdk`. No Rust mirror (`crate: null`) -- Electron's substrate does not exist in the Rust box.

## Decisions

- **[2026-07-02] Fix missing `@flighthq/storage` dependency.** `@flighthq/storage` is imported but not listed in `package.json` dependencies. Add it.
- **[2026-07-02] Not a `*Backend` package itself.** `host-electron` is the host that provides backends to capability packages. It is not a backend -- it is the adapter that creates and registers backends. The distinction matters: capability packages define the seam, `host-electron` fills it.
- **[2026-07-02] No Rust crate.** Electron's substrate does not exist in the Rust box. Native Rust hosts are `host-winit` and `host-sdl`.

## Open directions

- Whether an exhaustive seam-audit table (mapping each `@flighthq/types` seam method to its Electron call or documented sentinel) should be committed as a mechanical completeness check.
- Updater path: whether `electron-updater` warrants a second factory alongside the Squirrel-only `createElectronUpdaterBackend`.
- Renderer-targeted IPC: the current IPC backend is main-process receive-only. Main-to-renderer messaging needs a design decision.
- Sibling-host symmetry: whether this package's seam coverage should serve as the template for future `host-tauri` / `host-capacitor` adapters.
