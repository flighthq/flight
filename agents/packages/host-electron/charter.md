---
package: '@flighthq/host-electron'
role: host
crate: null
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# host-electron — Charter

Screen is registered explicitly as Entity-backed `Host.screen.query` and `Host.screen.change` facets, never through a package-global setter.

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

The Electron main-process host adapter -- concrete implementations of Flight's platform/host capability seams (`*Backend` traits in `@flighthq/types`) realized over the real `electron` module. An adapter, not a domain library: it owns no capability semantics of its own, only the translation between a Flight seam and an Electron API call. `registerElectronBackends(electron)` returns an explicit Host for migrated capabilities, including `Host.updater.command`, while still installing unmigrated package-local seams. The `electron` module is injected (typed against a local `ElectronApi` interface), so the package carries no `electron` dependency and is fake-testable. Not re-exported from `@flighthq/sdk`. No Rust mirror (`crate: null`) -- Electron's substrate does not exist in the Rust box.

## Decisions

- **[2026-08-30] Updater is an explicit Squirrel transaction.** The provider is returned at
  `Host.updater.command`; feed URL is construction policy, native events settle one awaited check, and
  downloaded handles retain exact provider origin. No `@flighthq/updater` ambient registration remains.
- **[2026-07-02] Fix missing `@flighthq/storage` dependency.** `@flighthq/storage` is imported but not listed in `package.json` dependencies. Add it.
- **[2026-07-02] Not a `*Backend` package itself.** `host-electron` is the host that provides backends to capability packages. It is not a backend -- it is the adapter that creates and registers backends. The distinction matters: capability packages define the seam, `host-electron` fills it.
- **[2026-07-02] No Rust crate.** Electron's substrate does not exist in the Rust box. Native Rust hosts are `host-winit` and `host-sdl`.

## Open directions

- Whether an exhaustive seam-audit table (mapping each `@flighthq/types` seam method to its Electron call or documented sentinel) should be committed as a mechanical completeness check. One has since been written — [`seam-audit.md`](seam-audit.md), in this cell — so the question is no longer whether it can be produced but whether it is the blessed check; that ruling is still open.
- Renderer-targeted IPC: the current IPC backend is main-process receive-only. Main-to-renderer messaging needs a design decision.
- Sibling-host symmetry: whether this package's seam coverage should serve as the template for future `host-tauri` / `host-capacitor` adapters.
