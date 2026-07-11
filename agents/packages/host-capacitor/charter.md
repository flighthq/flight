---
package: '@flighthq/host-capacitor'
crate: null
draft: false
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# host-capacitor — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions, and [`host-electron`](host-electron/charter.md) for the sibling-adapter template this mirrors.

## What it is

The **Capacitor (mobile) host adapter** — concrete implementations of Flight's platform/host capability seams (`*Backend` traits in `@flighthq/types`) realized over Capacitor's JavaScript plugin API (`@capacitor/core` + official plugins). An adapter, not a domain library: only the translation between a Flight seam and a Capacitor plugin call. `registerCapacitorBackends(capacitor)` calls `set*Backend` for the **mobile seams Capacitor provides**; seams it doesn't cover keep their web defaults. The Capacitor plugins are **injected** (typed against a local `CapacitorApi` interface), so the package carries no `@capacitor/*` dependency and is fake-testable — host-electron's `ElectronApi` pattern. Not re-exported from `@flighthq/sdk`. `crate: null` (Capacitor's substrate is the native iOS/Android host, not the Rust box).

## North star

`registerCapacitorBackends(capacitor)` fills the seams Capacitor's plugin set exposes, mirroring `registerElectronBackends` but for a **mobile** capability subset (which differs from Electron/Tauri's desktop subset). Target coverage (confirm each against the real `@capacitor/*` plugin surface at build time; map only where a genuine plugin call exists): **app** (`@capacitor/app`), **clipboard** (`clipboard`), **dialog** (`dialog`), **notification** (`local-notifications`), **storage** (`preferences`), **share** (`share`), **filesystem** (`filesystem`), **geolocation** (`geolocation`), **haptics** (`haptics`), **connectivity** (`network`), **device** (`device`), **statusbar** (`status-bar`), and **keyboard** (`keyboard`). Thin per-file adapters (`capacitorClipboard.ts`, …) + a `capacitorRegister.ts` aggregator, mirroring host-electron's layout.

## Boundaries

- **A `host-*` package** (`crate: null`, TS-only, not in the sdk barrel). Injected `CapacitorApi`, no `@capacitor` hard dep.
- **Adapter only** — provides backends to capability packages; not itself a `*Backend`.
- **Mobile seam subset; sentinel the rest.** Desktop-only capabilities (menu, tray, window-management, updater, global shortcuts) are outside Capacitor's model — do NOT fabricate them; leave the web default (honest sentinel). This is why the covered set differs from host-electron/host-tauri.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] Injected `CapacitorApi`, no hard dep.** The Capacitor plugin objects are passed to `registerCapacitorBackends`, typed against a local `CapacitorApi` interface; builds and fake-tests without `@capacitor/*` installed.
- **[2026-07-11] Mobile subset by design.** The covered seams are the mobile-relevant ones Capacitor plugins provide; the desktop-only seams host-electron fills are deliberately absent (not a gap — Capacitor's platform doesn't have them).

## Open directions

1. **Capacitor community plugins.** Beyond the official core plugins, community plugins (e.g. in-app-purchase, biometrics) could back `purchase`/`biometrics` seams once those capability packages exist.
2. **Web fallback overlap.** Capacitor plugins themselves fall back to web on the web platform; document the interaction with Flight's own web backends so double-wrapping is avoided.
3. **Seam-coverage audit table.** Seam→plugin-call (or documented-omission) completeness table, as host-electron flags.
