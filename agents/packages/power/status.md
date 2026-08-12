---
package: '@flighthq/power'
updated: 2026-08-08
by: principal
---

# power — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/power/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **`onChange` hands every listener the same mutable object.** `attachPower` reads into the
  module-level `_scratch` and emits it as the payload (`power.ts:24-25`, `_scratch` at `:370`), and
  `getPowerThermalState` writes the same scratch (`:341`). A listener that retains the status sees it
  change under it on the next event or read.
- **The suite's event-capability shape is not uniform across these three cells.** `createPower`
  leaves all ten signals `null` and defers allocation to `enablePowerSignals` (`power.ts:80-93`,
  `:295`), while `createApp` (`packages/app/src/app.ts:72`) and `createSoftKeyboard`
  (`packages/keyboard/src/keyboard.ts:55`) allocate eagerly and have no `enable*` twin. One of the
  two shapes is wrong; which is a ruling.
- **The public `.` lane cannot allocate its own out-params or install a backend.** `index.ts` exports
  `getPowerStatus` and `getPowerBatteryHealth` but not `createPowerStatus` /
  `createPowerBatteryHealth`, and omits `getPowerBackend` / `setPowerBackend` /
  `createWebPowerBackend` entirely (`power/src/index.ts:1-16`). `device` and `keyboard` have the same
  shape, so this is a lane policy question, not a one-package slip.
- **`setPowerKeepAwake`'s `mode` has no backend that honors it.** The parameter is typed
  `'PreventDisplaySleep' | 'PreventAppSuspension'` (`packages/types/src/Power.ts:9`); the web backend
  rejects `PreventAppSuspension` outright (`power.ts:165`) and `createElectronPowerBackend` ignores
  the argument, always starting `'prevent-display-sleep'`
  (`packages/host-electron/src/electronPower.ts:70-71`).
- **Idle polling runs on a timer that attach starts unconditionally.** `attachPower` opens a
  `setInterval` at `_idlePollingIntervalMs` even when `onIdleStateChange` is never
  enabled; the tick is guarded by `hasSignalSlots` but the timer is not. Poll-versus-push is still
  unruled, and the web backend returns the `'Unknown'` sentinel for every poll (`power.ts:156`).
- **Suspend/resume ownership overlaps `@flighthq/lifecycle`.** `power.onSuspend` / `onResume`
  (`power.ts:38-43`) sit beside `Lifecycle.onPause` / `onResume`
  (`packages/types/src/Lifecycle.ts:32-33`). The proposed split — OS machine-sleep to `power`, app
  foreground/background to `lifecycle` — is a cross-package ruling, not this cell's to take.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two headline claims checked out
  **false**: "`enablePowerSignals` group gate — not added; signals are always-on in `createPower()`"
  is contradicted twice over by `power.ts:295` (the function exists) and `:80-93` (`createPower`
  allocates nothing); and every Rust/`flighthq-power`/conformance-map item is unverifiable here —
  there is no `crates/` directory and no `Cargo.toml` in this repo, so the crate is downstream, not
  a power gap. The Electron thermal/battery-health/low-power notes were dropped as web-and-host
  sentinel behavior, which is the design.
- **2026-06-25** — Coalescing guard for chatty native subscriptions parked: collapsing bursts would
  change `onChange` from synchronous to deferred delivery, an unblessed contract change.
- **2026-06-24** — `isKeepAwakeActive()` moved onto `PowerBackend` so `hasPowerKeepAwake` works for
  custom backends instead of reading the web backend's module state.
- **2026-06-24** — `attachPower(power, idleThresholdSeconds)` gained idle-state polling with
  `get`/`setPowerIdlePollingIntervalMs`, cleared by `detachPower`.
