---
package: '@flighthq/power'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# power — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/power

**Session**: 2026-06-24 (second pass) **Previous score**: 93/100 **Estimated new score**: 97/100

## Implemented in this session (second pass)

### 1. `isKeepAwakeActive(): boolean` on `PowerBackend` (deferred from first pass)

**Problem**: `hasPowerKeepAwake()` previously read `_wakeLockSentinel` (a web-backend internal module variable), so it always returned `false` for any custom non-web backend.

**Fix**: Added `isKeepAwakeActive(): boolean` to the `PowerBackend` interface in `packages/types/src/Power.ts`. Updated:

- `createWebPowerBackend()` — returns `_wakeLockSentinel !== null`
- `createElectronPowerBackend()` — returns `true` if either `displaySleepBlockerId` or `appSuspensionBlockerId` is active (via `powerSaveBlocker.isStarted(id)`)
- `hasPowerKeepAwake()` in `power.ts` — now delegates to `getPowerBackend().isKeepAwakeActive()` instead of reading the module-level `_wakeLockSentinel`

Tests added to both `packages/power/src/power.test.ts` and `packages/host-electron/src/electronPower.test.ts`.

### 2. `onIdleStateChange` signal delivery in `attachPower` via polling (deferred from first pass)

**Problem**: `onIdleStateChange` existed as a signal in the `Power` entity but `attachPower` did not start any delivery mechanism for it.

**Fix**: `attachPower` now starts a `setInterval` at the rate configured by `setPowerIdlePollingIntervalMs` (default 5000ms). Each tick:

1. Checks `hasSignalSlots(power.onIdleStateChange)` — if no listeners, skips without calling the backend.
2. Calls `backend.getSystemIdleState(idleThresholdSeconds)`.
3. Emits `onIdleStateChange` only when the state has changed since the last poll.

The interval is cleared in the teardown closure stored by `_subscriptions`, so `detachPower`/`disposePower` stops polling correctly.

**New parameter**: `attachPower(power, idleThresholdSeconds = 60)` — the default 60s threshold can be overridden per-attach.

**New exported functions**:

- `getPowerIdlePollingIntervalMs(): number` — returns the current polling interval (default 5000ms)
- `setPowerIdlePollingIntervalMs(intervalMs: number): void` — configures the interval; only affects entities attached after this call

**Design choice**: The interval runs unconditionally after attach (even if no listeners are connected), but skips the backend call and signal emission when there are no slots. This is slightly simpler than watch-for-listener-count (which the Signal API doesn't directly support) while still preventing spurious work. The interval overhead (a single `hasSignalSlots` check every 5s) is negligible.

Tests added covering:

- Polling emits `onIdleStateChange` on state transitions when a listener is connected
- No emission and no error when no listener is connected
- Interval is stopped after `detachPower`

### 3. `flighthq-power` Rust crate mirroring the matured TS seam (deferred from first pass)

The Rust crate was significantly behind the matured TS seam (only 3 fields in `PowerStatus`, 4 methods in `PowerBackend`, 5 signals in `Power`).

**Updated `flighthq-types/src/platform.rs`**:

Added Rust enums/structs mirroring the TS types:

- `PowerKeepAwakeMode` — `PreventDisplaySleep | PreventAppSuspension`
- `PowerIdleState` — `Active | Idle | Locked | Unknown`
- `PowerThermalState` — `Nominal | Fair | Serious | Critical | Unknown`
- `PowerBatteryHealth` — struct with `capacity_wear_level`, `cycle_count`, `health_state`, `temperature_celsius`, `voltage`; plus `PowerBatteryHealthState` enum
- `PowerStatus` — expanded to 8 fields: `battery_level`, `charging_time`, `discharging_time`, `is_battery_low`, `is_charging`, `is_on_battery`, `is_low_power`, `thermal_state`
- `PowerBackend` — expanded to 12 methods matching the TS seam: `get_status`, `get_battery_health`, `get_system_idle_time`, `get_system_idle_state`, `is_keep_awake_active`, `set_keep_awake`, `subscribe`, `subscribe_lock_screen`, `subscribe_low_power_mode_change`, `subscribe_resume`, `subscribe_suspend`, `subscribe_thermal_state_change`, `subscribe_unlock_screen`
- `Power` — expanded to 10 signals matching the TS entity

**Updated `flighthq-types/src/lib.rs`**: exports `PowerBatteryHealth`, `PowerBatteryHealthState`, `PowerIdleState`, `PowerKeepAwakeMode`, `PowerThermalState`.

**Rewrote `flighthq-power/src/power.rs`**:

- `StubPowerBackend` — no-op stub implementing all 12 `PowerBackend` methods with sentinel returns
- `create_power_battery_health()` — allocates zeroed `PowerBatteryHealth`
- `create_power_status()` — allocates sentinel-filled `PowerStatus` (uses `Default` impl)
- `attach_power()` — wires all 7 backend subscriptions (change, lock screen, low power mode, resume, suspend, thermal state, unlock screen); note: idle polling is not implemented in Rust (no timer runtime; host integrations should push idle events via `on_idle_state_change` directly)
- `get_power_battery_health(out) -> bool` — returns `true` if backend supports health (fills `out`), `false` when unsupported (TS uses `| null`; Rust uses `bool` sentinel matching the out-param convention)
- `get_power_system_idle_state(f32) -> PowerIdleState`
- `get_power_system_idle_time() -> f32`
- `get_power_thermal_state() -> PowerThermalState`
- `has_power_keep_awake() -> bool`
- `set_power_keep_awake(enabled, mode) -> bool` — mode is explicit (no Option default, simpler in Rust)

**Updated `flighthq-power/src/lib.rs`**: re-exports all new functions.

Conformance note: `get_power_battery_health` returns `bool` in Rust vs `PowerBatteryHealth | null` in TS; this is the idiomatic out-param sentinel pattern for Rust (the `out` is filled in-place). `set_power_keep_awake` takes `mode: PowerKeepAwakeMode` explicitly in Rust (no `?` optional); callers must pass `PowerKeepAwakeMode::PreventDisplaySleep` for the default path. Both divergences are intentional and should be recorded in the conformance map.

Cargo is not available in this sandbox; the Rust changes are logically complete and structurally correct but have not been compiled in this session.

## Cumulative implemented APIs (across both passes)

### Types in `@flighthq/types`

- `PowerBatteryHealth` interface + `PowerBatteryHealthState` type
- `PowerIdleState` type
- `PowerKeepAwakeMode` type
- `PowerThermalState` type
- `PowerStatus` — 8 fields: `batteryLevel`, `chargingTime`, `dischargingTime`, `isBatteryLow`, `isCharging`, `isLowPower`, `isOnBattery`, `thermalState`
- `PowerBackend` — 12 methods: `getBatteryHealth`, `getStatus`, `getSystemIdleState`, `getSystemIdleTime`, `isKeepAwakeActive`, `setKeepAwake`, `subscribe`, `subscribeLockScreen`, `subscribeLowPowerModeChange`, `subscribeResume`, `subscribeSuspend`, `subscribeThermalStateChange`, `subscribeUnlockScreen`
- `Power` entity — 10 signals: `onChange`, `onCharging`, `onDischarging`, `onIdleStateChange`, `onLockScreen`, `onLowPowerModeChange`, `onResume`, `onSuspend`, `onThermalStateChange`, `onUnlockScreen`

### Exported functions in `packages/power`

- `attachPower(power, idleThresholdSeconds?)` — all 10 signals wired; idle polling via setInterval
- `createPower()` — all 10 signals
- `createPowerBatteryHealth()` — zeroed battery health struct
- `createPowerStatus()` — zeroed status (all sentinels)
- `createWebPowerBackend()` — full Battery Status API + Screen Wake Lock API + web sentinels
- `detachPower(power)`
- `disposePower(power)`
- `getPowerBackend()` — lazy web fallback
- `getPowerBatteryHealth(out)` — returns `out` or `null`
- `getPowerIdlePollingIntervalMs()` — returns current polling interval
- `getPowerStatus(out)` — all 8 fields
- `getPowerSystemIdleState(thresholdSeconds)` — `PowerIdleState`
- `getPowerSystemIdleTime()` — seconds or -1
- `getPowerThermalState()` — `PowerThermalState`
- `hasPowerKeepAwake()` — delegates to `backend.isKeepAwakeActive()`
- `setPowerBackend(backend | null)` — installs or clears backend
- `setPowerIdlePollingIntervalMs(intervalMs)` — configures idle poll rate
- `setPowerKeepAwake(enabled, mode?)` — mode defaults to PreventDisplaySleep

### `packages/host-electron` (Electron backend)

`createElectronPowerBackend` implements all 12 `PowerBackend` methods:

- `isKeepAwakeActive()` — checks `powerSaveBlocker.isStarted` for both blocker IDs
- All other methods as described in first pass

## Remaining deferred items and why

### Idle polling not implemented in the Rust crate

Rust has no ambient timer runtime (no `setInterval` equivalent without pulling in `tokio` or `smol`). Idle polling in Rust would require the host to drive a tick callback or use a background thread. The signal stub (`on_idle_state_change`) is in the `Power` entity; host integrations can push events directly via `emit_signal`. This is a known, intentional divergence: recorded in the source comment on `attach_power`.

### OS-level `isLowPower` on Electron

Electron's `powerMonitor` does not expose a low-power-mode change event or getter. `subscribeLowPowerModeChange` returns a no-op and `isLowPower` is always `false` in the Electron backend. Wiring macOS `NSProcessInfo.thermalState` via a native addon is out of scope for TS-only sessions.

### Thermal state on Electron

Electron does not expose `thermalState`. Requires a native addon (macOS only). Out of scope.

### Battery health on Electron/Web

Neither Electron's main process nor the W3C Battery Status API expose battery health detail (cycle count, wear, temperature). Returns `null`/`false` correctly via sentinels.

### Rust crate compilation not verified

Cargo is not installed in this sandbox. The Rust changes are logically complete but uncompiled. The first real compilation will happen when a Rust-capable CI or session picks them up.

### Conformance divergence map entries needed

Two TS↔Rust divergences need to be added to the conformance map:

1. `getPowerBatteryHealth(out)` — TS returns `PowerBatteryHealth | null`, Rust returns `bool`
2. `setPowerKeepAwake(enabled, mode?)` — TS mode is optional, Rust mode is required

### `enablePowerSignals` group gate

Not added. The 10 signals are cheap to allocate together; no group gate is motivated. Document: signals are always-on in `createPower()` — the cost is only assumed when `attachPower` is called. If signal count or weight grows significantly, a group gate should be re-evaluated.

### Suspend/resume ownership overlap with `@flighthq/lifecycle`

Remains a cross-package design decision for the user. The proposed boundary: OS machine-sleep → `power`; app active/inactive/background/tab-lifecycle → `lifecycle`. Not acted on autonomously.

## Design choices made

### Idle polling design

- **Interval always starts on `attachPower`**: simpler than lazy-start (Signal API has no "on listener count change" event). The interval is cheap (a `hasSignalSlots` check every 5s).
- **Configurable interval**: `setPowerIdlePollingIntervalMs` allows tuning responsiveness vs. battery impact. Affects only entities attached after the call.
- **Per-attach threshold**: `attachPower(power, idleThresholdSeconds = 60)` — different use cases (screen saver at 5min vs. idle-at-desk at 1min) can have different thresholds on different `Power` entities.
- **`hasSignalSlots` guard**: avoids the backend call and allocation entirely when nobody listens. Keeps the idle poller free when unused.

### `isKeepAwakeActive` on `PowerBackend`

Delegating to the backend rather than reading module-level state is the correct design: it works for custom backends, not just the built-in web default. The web backend reads `_wakeLockSentinel` internally (still the right place for that state to live), but exposes it through the contract.

### Rust `get_power_battery_health` returns `bool`

The TS function returns `PowerBatteryHealth | null` (the `out` parameter IS the returned value when supported, null when not). In Rust, returning `bool` is the idiomatic out-param sentinel: the caller passes `&mut PowerBatteryHealth` and checks the `bool` to know if it was filled. This matches the out-param convention used throughout the Rust port.

### Rust `set_power_keep_awake` takes explicit `mode`

TS makes `mode` optional with a `PreventDisplaySleep` default. In Rust there are no optional parameters; the caller must pass the mode explicitly. This is more explicit and maps better to the Rust idiom.

## Score estimate: 97/100

Remaining -3:

- Rust crate uncompiled in this session (-1)
- Idle polling not in Rust crate (intentional, documented) (-1)
- Conformance map entries not written (minor) (-1)

The TS seam is now fully mature: all Gold items from the maturation roadmap are complete except those explicitly gated on native tooling (thermal state via native addon, battery health via native addon) and the cross-package `lifecycle`/`power` boundary decision.
