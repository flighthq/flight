# Depth Review: @flighthq/power

**Domain**: Cross-platform power/battery state and screen keep-awake — the live-status counterpart to the platform suite's static `device`/`screen` cells. The canonical comparison set is Electron's `powerMonitor` + `powerSaveBlocker`, the W3C Battery Status API, the Screen Wake Lock API, Capacitor/Cordova battery plugins, and Tauri's battery/power crates.

**Verdict**: solid — 70/100

This is an event-style platform-integration cell, not a sub-library with a sprawling algorithmic surface (unlike `easing` or `path`). Judged against the realistic ceiling for a power-monitoring capability, it covers the two pillars a mature library is expected to expose — battery/charging status with change events, and a screen keep-awake lock — and wires them over the standard swappable backend seam with a working web default. It falls short of "authoritative" because it omits several power signals that Electron's `powerMonitor` and mobile power plugins treat as core: idle/lock-screen events, AC-vs-battery (on-battery) reporting, thermal/low-power-mode notification, and battery time-remaining/health.

## Present capabilities

- **Status snapshot** — `PowerStatus { batteryLevel (0..1 or -1), isCharging, isLowPower }`, read via `getPowerStatus(out)` into a caller-owned struct, with `createPowerStatus()` allocating a zeroed value. The `-1` sentinel for an unreported level is the right convention and matches the project's "return sentinels" rule.
- **Derived low-power heuristic** — the web backend computes `isLowPower` from `level <= 0.2 && !charging`. Reasonable as a fallback, though not a real OS low-power-mode read (see gaps).
- **Event entity** — `Power` carries five signals: `onChange(status)`, `onCharging`, `onDischarging`, `onSuspend`, `onResume`. This is the correct event-capability shape (entity of signals + `create*`/`attach*`/`detach*`/`dispose*`).
- **Lifecycle** — `createPower`, `attachPower` (idempotent; tears down a prior subscription first), `detachPower`, `disposePower`. Charging-transition detection is debounced against a `wasCharging` latch so `onCharging`/`onDischarging` fire only on actual edges. Clean.
- **Keep-awake** — `setPowerKeepAwake(enabled): boolean` over the Screen Wake Lock API, returning whether the request was honored; releases the held sentinel on disable. This is the `powerSaveBlocker` analogue.
- **Backend seam** — `PowerBackend` trait + `getPowerBackend` (lazy web default), `setPowerBackend(null → web)`, `createWebPowerBackend`. Web backend guards every API (`navigator`/`document`/`getBattery`/`wakeLock` absence) and degrades to `-1`/no-op rather than throwing. A real `createElectronPowerBackend` exists in `host-electron`, proving the seam.
- **Suspend/resume** — `subscribeSuspend`/`subscribeResume` wired to the web `freeze`/`resume` document events. This overlaps the OS "system sleep/wake" notion that `powerMonitor` exposes.

## Gaps vs an authoritative power library

Missing-by-omission (would be expected at AAA completeness):

- **AC / on-battery source state.** No `isOnBattery` / power-source field. Electron's `powerMonitor.onBatteryPower`/`on-ac` and the desktop notion of "running on mains vs battery" is a first-class power signal and is absent. `isCharging` is not the same thing (a full battery on AC is not charging).
- **Idle / lock-screen events.** No `getSystemIdleTime` / `getSystemIdleState`, and no `onLockScreen`/`onUnlockScreen`. These are core `powerMonitor` capabilities and a common reason apps reach for a power module at all.
- **OS low-power / battery-saver mode.** `isLowPower` is a homegrown 20%-and-discharging heuristic, not a read of the OS's actual Low Power Mode / battery-saver flag (iOS Low Power Mode, Windows battery saver, GNOME power-saver). A mature library reports the real flag and distinguishes it from a charge-threshold guess.
- **Thermal state.** No thermal-pressure / throttling signal (macOS `NSProcessInfo.thermalState`, Android thermal API). Increasingly expected in power-aware apps and games.
- **Battery time / health detail.** No `chargingTime` / `dischargingTime` (both are in the W3C Battery Status API the web backend already wraps and discards) and no battery health/capacity/temperature. The web backend reads `level`/`charging` from the manager but ignores the two time fields it also exposes.
- **Distinct suspend vs. true system sleep.** The web backend maps suspend/resume to page `freeze`/`resume`, which is a tab-lifecycle event, not a machine sleep/wake. Electron's `suspend`/`resume` are genuine OS sleep events; on web there is no real equivalent, so the naming slightly overpromises (see notes).

Missing-by-design / out of scope (correctly elsewhere):

- **Static device identity** (model, total memory, OS) lives in `@flighthq/device` — correctly not duplicated here.
- **App keep-awake vs. display sleep distinction** — `powerSaveBlocker` has two modes (`prevent-app-suspension` vs `prevent-display-sleep`); only the display/screen lock is modeled. Worth surfacing but a minor gap.

## Naming / API-shape notes

- Names are fully spelled and self-identifying (`getPowerStatus`, `setPowerKeepAwake`, `createWebPowerBackend`); the entity quartet (`create`/`attach`/`detach`/`dispose`) matches the documented event-capability pattern exactly. `disposePower` correctly delegates to `detachPower` (release-to-GC, nothing to `destroy`).
- `getPowerStatus(out)` follows the out-parameter convention; the module reuses a single `_scratch` status internally for transition detection, which is appropriate hidden state.
- `subscribeSuspend`/`subscribeResume` and the `onSuspend`/`onResume` signals read as OS sleep/wake but are backed by page-freeze events on web. The name is honest for a native backend but optimistic for the web default; a doc note (already partially present) is warranted. Consider whether suspend/resume belongs here or in `@flighthq/lifecycle` (the map lists `lifecycle` as owning app active/inactive/background/resume/pause) — there is a plausible overlap to resolve.
- `setKeepAwake` returning `boolean` (honored?) rather than an awaitable is a deliberate, portability-friendly choice consistent with the synchronous backend seam; fine.

## Recommendation

Keep the architecture as-is — the seam, the entity quartet, and the web degrade-to-sentinel behavior are all correct and idiomatic. To reach authoritative for this domain, extend the `PowerBackend` contract and `PowerStatus` with the canonical power signals that the underlying APIs already expose or that `powerMonitor` defines: add `isOnBattery` (power source), surface `chargingTime`/`dischargingTime` (already available from the Battery Status manager), add a real OS-level low-power-mode flag distinct from the charge heuristic, and add idle-time/idle-state plus lock/unlock notifications (native-backed, sentinel on web). Thermal state is a strong follow-on. Finally, resolve the suspend/resume ownership overlap with `@flighthq/lifecycle` so OS-sleep vs. app-lifecycle is unambiguous. These are additive to the existing seam and do not require restructuring.
