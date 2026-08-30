---
package: '@flighthq/power'
updated: 2026-08-30
by: principal
---

# power — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/power/src/` on 2026-08-30, after the R3 slot split.
A file:line here is a claim about this tree, not about a session.

- **Two `make*` value allocators set a precedent more than they follow one.** `makePowerStatus` /
  `makePowerBatteryHealth` (`power.ts`) were renamed off `create*` because they return VALUES, not
  entities, and `create*` is reserved for Entity results. The census behind the choice was thin:
  `make*` had two genuine value-struct allocators in-tree (`makeShaderLoc`,
  `makeWgpuSkinningAdapter`) and `empty*` one, while sibling out-param structs (`WindowBounds`,
  `ConnectivityStatus`, `SoftKeyboardInfo`) still use `create*`. Whether `make*` is the SDK-wide
  convention is unruled; if another name wins, these two move with it.
- **Suspend/resume ownership still overlaps `@flighthq/lifecycle`.** `power.onSuspend` / `onResume`
  now come from the `suspension` bracket slot, and `Lifecycle.onPause` / `onResume`
  (`packages/types/src/Lifecycle.ts:32-33`) still exist beside them. The proposed split — OS
  machine-sleep to `power`, app foreground/background to `lifecycle` — remains a cross-package
  ruling, not this cell's to take.
- **Electron battery health is a slot with nothing behind it.** `batteryHealth` exists on the
  Electron host but its `getBatteryHealth` returns the caller's `out` untouched
  (`packages/host-electron/src/electronPower.ts`), because the main process reports no battery
  detail. The slot is kept because Electron is the host that would carry it once available; if that
  never lands, the honest move is to omit the slot as web does.
- **Tauri and Capacitor have no power provider at all.** Both ship `power: {}` with a named gap
  comment (`tauriRegister.ts`, `capacitorRegister.ts`). Whether power is deliberately web+electron
  only, or those two are a real gap to fill, is unruled.

RESOLVED BY THE R3 SLICE, listed so the previous entries are not re-reported as open:
`onChange` no longer hands out a shared `_scratch` (a fresh `PowerStatus` per event); the idle timer
only exists when the host offers the `idle` slot, so nothing polls a constant `Unknown`; `mode` is
now honored — web reports `unavailable` for `PreventAppSuspension` and Electron starts
`prevent-app-suspension`; the `.` lane exports its own value allocators; and the ambient
resolver/sentinel/diagnostic/enabler family is gone, which removes the install-from-the-public-lane
question entirely.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-30** — R3: power split into a top-level Host group with eight optional slots (status,
  change, keepAwake, idle, sessionLock, suspension, batteryHealth, thermal); `lowPowerModeChange`
  deleted because every provider was inert. Keep-awake is now awaited with method-tight reasons, so a
  denied Wake Lock is reported as `denied` instead of the old synchronous `true` — an attempt is never
  an outcome. Electron thermal repaired rather than dropped: the facade now exposes
  `getCurrentThermalState` (electron 31.7.7, `electron.d.ts:9923`) and the subscription delivers the
  level as its payload; the slot is omitted where the getter is absent. Whole ambient family deleted.
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
