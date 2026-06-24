---
package: '@flighthq/power'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/power.md
  - source
  - incoming/builder-67dc46d64/changes.patch
---

# Review: @flighthq/power

## Verdict

solid — 90/100. A well-formed event-style platform cell that, in this second pass, closed nearly every gap the prior depth review (70/100) flagged: it now carries the full canonical power surface — AC/on-battery source, idle/lock-screen events, OS low-power-mode notification, thermal state, battery time-remaining, and battery health — over a swappable backend with a degrade-to-sentinel web default and a real Electron backend proving the seam. It is held back from `authoritative` only by native-gated capabilities that no TS-only session can land (true thermal/health reads on Electron/web), the uncompiled Rust crate, and a couple of small internal asymmetries (idle state polled, thermal folded into the status snapshot). The architecture is correct and idiomatic; what remains is mostly host backends and conformance bookkeeping, not redesign.

The status doc's self-estimate of 97/100 is optimistic on two counts a verified review must discount: the Rust crate is in the patch but admittedly **uncompiled** (so its conformance is unproven, not merely "structurally correct"), and the two TS↔Rust divergences it introduces are **not yet recorded** in the conformance map. Those are real open items, not rounding error.

## Status-doc verification (as-claimed → verified)

Every substantive claim in `status.md` was checked against the diff and head source; all verified:

- **10 signals on `Power`** — confirmed in `packages/types/src/Power.ts` and `createPower()` (`onChange`, `onCharging`, `onDischarging`, `onIdleStateChange`, `onLockScreen`, `onLowPowerModeChange`, `onResume`, `onSuspend`, `onThermalStateChange`, `onUnlockScreen`).
- **12 `PowerBackend` methods** — confirmed in `Power.ts` and both `createWebPowerBackend()` and the Electron backend.
- **8 `PowerStatus` fields** — confirmed; `createPowerStatus()` seeds every one with its sentinel.
- **`isKeepAwakeActive()` on the backend** — confirmed; `hasPowerKeepAwake()` now delegates to `getPowerBackend().isKeepAwakeActive()` (`power.ts:320-322`) rather than reading the module-level `_wakeLockSentinel`, so custom backends report their own state. The prior depth review's implicit "module-internal keep-awake state" limitation is resolved.
- **Idle polling in `attachPower`** — confirmed (`power.ts:46-54`): a `setInterval` at `_idlePollingIntervalMs`, guarded by `hasSignalSlots(power.onIdleStateChange)`, emitting only on state transitions, cleared in the `_subscriptions` teardown closure. `getPowerIdlePollingIntervalMs` / `setPowerIdlePollingIntervalMs` and the `attachPower(power, idleThresholdSeconds = 60)` parameter are all present.
- **Four new one-concept-per-file types** — `PowerBatteryHealth.ts` (carrying `PowerBatteryHealthState`), `PowerIdleState.ts`, `PowerKeepAwakeMode.ts`, `PowerThermalState.ts` — all new files in the patch, all re-exported from the types barrel (`index.ts:280-284`).
- **Rust crate** — `crates/flighthq-power/src/{lib,power}.rs` and `crates/flighthq-types/src/platform.rs` are in the patch. Per the status doc, Cargo was unavailable; **uncompiled** is the honest state.

## Present capabilities

- **Status snapshot** — `getPowerStatus(out)` over `PowerStatus { batteryLevel, chargingTime, dischargingTime, isCharging, isOnBattery, isLowPower, isBatteryLow, thermalState }`. The split the prior review asked for is realized: `isOnBattery` (power source) is distinct from `isCharging`, and `isBatteryLow` (the 20%-and-discharging heuristic) is distinct from `isLowPower` (the real OS low-power flag, sentinel `false` on web). `chargingTime`/`dischargingTime` are now surfaced from the Battery Status manager instead of discarded, with `Infinity` normalized to `-1`.
- **Battery health** — `getPowerBatteryHealth(out): PowerBatteryHealth | null` with `createPowerBatteryHealth()` allocating a fully-sentinel struct. Correctly `null` on web (the W3C API has no health detail).
- **Idle / lock** — `getPowerSystemIdleTime()` (`-1` sentinel), `getPowerSystemIdleState(threshold)` (`PowerIdleState`), `onIdleStateChange` delivered by the polling loop, and `onLockScreen` / `onUnlockScreen` signals (native-only; web no-ops).
- **Thermal** — `getPowerThermalState(): PowerThermalState` and `onThermalStateChange`.
- **Keep-awake** — `setPowerKeepAwake(enabled, mode?)` with `PowerKeepAwakeMode` (`PreventDisplaySleep` default / `PreventAppSuspension`), closing the prior review's "only display-sleep modeled" gap. The web backend honors only `PreventDisplaySleep` (Screen Wake Lock) and returns `false` for `PreventAppSuspension`, and re-acquires the lock on visibility restore.
- **Event-entity quartet** — `createPower` / `attachPower` / `detachPower` / `disposePower`, idempotent attach (tears down a prior subscription first), charging-edge latch (`wasCharging`), `disposePower` delegating to `detachPower` (correct: release-to-GC, nothing to `destroy`). Subscriptions tracked in a `WeakMap`.
- **Backend seam** — `PowerBackend` + `getPowerBackend` (lazy web default), `setPowerBackend(null → web)`, `createWebPowerBackend`, with a real `createElectronPowerBackend` in `host-electron`. The web backend guards every API surface and degrades rather than throwing.
- **Tests** — `power.test.ts` (567 lines) covers every exported function, every signal path, the idle poller (emits on transition, silent with no listener, stops after detach — all via fake timers), the alias-safe `getStatus(out)` case, and both `setKeepAwake` modes. A faithful, behavior-level suite, not a surface smoke test.

## Gaps vs an authoritative power library

These are now mostly native-host or conformance gaps rather than missing surface:

- **Native-gated reads are sentinel-only.** Thermal state, battery health, OS low-power-mode, and idle/lock events are all wired through the contract but return sentinels on both the web backend _and_ (per the status doc) the Electron backend, because Electron's `powerMonitor` exposes none of thermal/health/low-power and the rest need a native addon. The _seam_ is complete; the _coverage_ is not, and no current backend exercises thermal/health/low-power for real. Honest, but worth stating: these fields are presently sentinel-everywhere.
- **Rust conformance is unproven.** The crate is uncompiled, and the two intentional divergences (`get_power_battery_health` returning `bool` vs TS `… | null`; `set_power_keep_awake` taking a required `mode` vs TS optional) are not yet in the conformance map. Idle polling is absent in Rust by design (no ambient timer), documented on `attach_power` — a legitimate divergence that also belongs in the map.
- **No `enablePowerSignals` group gate.** Defensible (the 10 signals are cheap and cost is only assumed at `attachPower`), but it is a silent departure from the codebase-map signal-group convention; see candidate directions.

## Charter contradictions

The charter is a stub — only **What it is** is filled; **North star**, **Boundaries**, **Decisions**, and **Open directions** are all `TODO`. With no stated principle, boundary, or decision to violate, there are **no charter contradictions** — but that is because the charter is silent, not because the package was measured against a real rubric. Every judgement above falls back to the codebase-map AAA standard; the silences are collected as candidate directions below.

## Contract & docs fit

Strong alignment with the artifact contract:

- **Types-first** — all shared types live in `@flighthq/types` as one-concept-per-file (`Power.ts`, `PowerBatteryHealth.ts`, `PowerIdleState.ts`, `PowerKeepAwakeMode.ts`, `PowerThermalState.ts`), filename = type name, string-literal unions (open contracts, no `Symbol()` kinds). `PowerBatteryHealthState` correctly cohabits `PowerBatteryHealth.ts` as its qualifier rather than getting a thin file of its own.
- **Full unabbreviated names** — every export self-identifies (`getPowerSystemIdleState`, `createWebPowerBackend`, `setPowerIdlePollingIntervalMs`).
- **Out-params & alias-safety** — `getPowerStatus(out)` / `getPowerBatteryHealth(out)` follow the convention; the web `getStatus` reads all inputs into locals before writing (commented as alias-safe) and a test asserts the aliased case.
- **Sentinels not throws** — `-1` / `false` / `null` / `'Unknown'` / no-op unsubscribers throughout; no thrown errors for expected-absent platform APIs.
- **Single root export** (`index.ts` re-exports `./power`), `"sideEffects": false`, no top-level side effects (the lazy `getPowerBackend` default, module state at file bottom). `package.json` description is accurate.
- **Rust mirror** present (`flighthq-power`), pending compilation.

**Candidate doc revisions (user's gate, not mine to act on):**

- The Package Map line for `@flighthq/power` reads "battery/charging status, low-power and keep-awake" — it now materially understates the cell, which also owns idle/lock-screen, thermal, suspend/resume, and battery health. Worth widening to match the shipped surface.
- The codebase map's "Inbound host events" paragraph lists power's inbound events as `onSuspend`/`onResume` only; the backend now has seven `subscribe*` channels (`subscribeLockScreen`, `subscribeLowPowerModeChange`, `subscribeThermalStateChange`, `subscribeUnlockScreen`, plus suspend/resume and the base `subscribe`). Stale.

## Candidate open directions

These are questions the stub charter does not answer that this review had to assume — they feed the charter's Open directions:

1. **Suspend/resume ownership vs `@flighthq/lifecycle`.** Unresolved across two reviews. `power` wires `onSuspend`/`onResume` to web `freeze`/`resume` (a _tab-lifecycle_ event), while `lifecycle` is mapped as owning app active/inactive/background/resume/pause. Proposed line (from the status doc): OS machine-sleep → `power`; app/tab lifecycle → `lifecycle`. This is a cross-package boundary decision and the most important thing the charter should settle.
2. **Idle delivery: poll vs push.** The poll is a deliberate, guarded design (the Signal API has no "listener-count changed" hook), but the interval still fires `getSystemIdleState` at attach to seed `lastIdleState` even when no listener is connected, and the timer runs unconditionally after attach. Is polling the blessed model, or should idle delivery be push-only from native backends (matching how every other power signal is delivered)? Rust already omits the poller — a push-only model would make TS and Rust converge.
3. **Thermal/idle asymmetry.** `getPowerSystemIdleState` has a dedicated backend method, but `getPowerThermalState` reads through `getStatus(_scratch).thermalState`. Is thermal part of the hot status snapshot (a deliberate choice, since it changes slowly and games poll it per-frame) or should it get its own `getThermalState()` backend method for symmetry with idle? Decide and document.
4. **`enablePowerSignals` group gate.** Should `power` follow the documented opt-in signal-group convention, or is "10 cheap signals, cost assumed at attach" the blessed exception? The status doc argues the latter; the charter should ratify it so the next agent does not re-litigate.
5. **Sentinel-everywhere native fields.** Thermal/health/low-power currently return sentinels on every backend. Is shipping a contract ahead of any real implementation the intended posture (seam-first, fill later via native addons / `host-tauri` / `host-capacitor`), or should the charter scope these out until a backend can serve them? Naming the intent prevents a future reviewer from reading the sentinels as an incomplete implementation rather than a deliberate seam.
