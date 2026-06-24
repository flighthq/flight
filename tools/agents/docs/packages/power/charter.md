---
package: '@flighthq/power'
crate: flighthq-power
lastDirection: null
draft: true
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# power — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/power` is the **live-status** platform cell for power: battery level and charging state, AC/on-battery power source, OS low-power mode, thermal state, system idle and lock-screen events, machine suspend/resume, battery health, and screen/app keep-awake. It is the dynamic counterpart to the static `device`/`screen` cells in the platform-integration suite — `device` answers "what is this hardware," `power` answers "what is its energy state _right now_ and how is it changing."

It is an **event-style** platform capability: an entity of signals (`Power`) wired through the suite's standard quartet — `createPower` / `attachPower` / `detachPower` / `disposePower` — paired with flat command/query functions (`getPowerStatus(out)`, `setPowerKeepAwake`) over a swappable `PowerBackend`. A web/DOM backend (W3C Battery Status, Screen Wake Lock, `freeze`/`resume`) is always lazily available; native hosts (`host-electron`, future `host-tauri`/`host-capacitor`) replace it via `setPowerBackend`. Web backends guard every API and degrade to sentinels rather than throwing.

Where it ends and a neighbor begins is the open boundary the charter must settle: `power` owns **OS/machine power state** (battery, thermal, machine sleep), while `@flighthq/lifecycle` owns **app/tab lifecycle** (active/inactive/background, pause/resume, back button). The suspend/resume seam straddles that line and is the first thing to nail down (Open direction 1).

The canonical comparison set: Electron's `powerMonitor` + `powerSaveBlocker`, the W3C Battery Status API, the Screen Wake Lock API, Capacitor/Cordova battery plugins, and Tauri's battery/power crates.

## North star (proposed)

_Durable principles inferred from the design and the SDK-wide forks. Proposed, not blessed — edit or move any of these to Open directions if they overreach._

- **Seam-first, fill-by-backend.** The package's job is a _complete, canonical contract_ over a swappable `PowerBackend` — the full power surface a mature app expects, exposed once and degrading honestly. Coverage of any one field (thermal, health, low-power) is a backend's responsibility, not a reason to omit the field from the contract. This is fork D's runtime-backend seam applied to power.
- **Honest sentinels over thrown errors.** Every absent platform capability returns a typed sentinel (`-1`, `false`, `null`, `'Unknown'`, no-op unsubscriber). A missing reading is an expected outcome on the web, not an error condition. Callers branch on values, never catch exceptions for platform absence.
- **Plain data, explicit allocation, out-params.** Status is a value struct filled into an `out` (`getPowerStatus(out)`, `getPowerBatteryHealth(out)`), alias-safe (inputs read into locals before any write). `create*` allocates a fully-sentinel struct; queries do not allocate. No wrapper objects, no hidden runtime state.
- **One canonical event-entity, mirrored 1:1 in Rust.** `Power` is the single signal entity; the TS shape is authoritative and the Rust crate (`flighthq-power`) conforms, with every intentional divergence recorded in the conformance map. Native-first is the production target; the web backend is the always-available fallback and conformance instrument.
- **Self-identifying, unabbreviated names; types-first.** Every export carries its full domain word (`getPowerSystemIdleState`, `createWebPowerBackend`, `setPowerKeepAwake`); all shared types live in `@flighthq/types` as one-concept-per-file open string-union contracts.

## Boundaries (proposed)

_In scope / non-goals, drawn from the review and the neighbor cells. Proposed — adjust the line with `lifecycle` once Open direction 1 is settled._

**In scope (proposed):**

- Battery: level, charging state, charging/discharging time, on-battery vs charging, battery-low heuristic, battery health.
- OS power state: real OS low-power mode, thermal state.
- Power events: charge/discharge edges, idle-state change, lock/unlock screen, low-power-mode change, thermal-state change, and machine suspend/resume.
- Keep-awake: screen wake lock and app-suspension prevention, via `PowerKeepAwakeMode`.
- The `PowerBackend` seam plus its web default; native backends live in the relevant `host-*` packages.

**Non-goals (proposed):**

- Static hardware/OS identity (model, manufacturer, memory, safe-area) — that is `@flighthq/device`.
- Display enumeration / work area / scale factor — that is `@flighthq/screen`.
- App/tab lifecycle (active/inactive/background, pause/resume, back button) — that is `@flighthq/lifecycle`. (The suspend/resume overlap is an open boundary, not a settled non-goal.)
- Concrete native backend implementations — those belong in `host-electron` / future `host-tauri` / `host-capacitor`, not here.

## Decisions

None blessed yet.

## Open directions

_The real questions — every candidate direction from the review, plus the structural fork that touches this package. An agent asks here rather than assuming._

1. **Suspend/resume ownership vs `@flighthq/lifecycle`.** Unresolved across two reviews and the most important boundary the charter should settle. `power` wires `onSuspend`/`onResume` to web `freeze`/`resume` (a _tab-lifecycle_ event), while `lifecycle` is mapped as owning app active/inactive/background/resume/pause. Proposed line: OS machine-sleep → `power`; app/tab lifecycle → `lifecycle`. Cross-package decision — bless the line and the web-event mapping.

2. **Idle delivery: poll vs push.** Idle is currently delivered by a guarded `setInterval` poller in `attachPower` (the Signal API has no "listener-count changed" hook). The interval seeds `lastIdleState` at attach even with no listener and runs unconditionally afterward. Is polling the blessed model, or should idle delivery be push-only from native backends (matching every other power signal)? Rust already omits the poller — push-only would converge TS and Rust.

3. **Thermal/idle asymmetry.** `getPowerSystemIdleState` has a dedicated backend method, but `getPowerThermalState` reads through `getStatus(_scratch).thermalState`. Is thermal deliberately part of the hot status snapshot (it changes slowly; games poll it per-frame), or should it get its own `getThermalState()` backend method for symmetry with idle? Decide and document.

4. **`enablePowerSignals` group gate.** Should `power` follow the documented opt-in signal-group convention (`enable*` before cost is assumed), or is "10 cheap signals, cost assumed at `attachPower`" the blessed exception? The status doc argues the exception; ratify or reject so the next agent does not re-litigate.

5. **Sentinel-everywhere native fields (the seam-first posture).** Thermal, battery health, and OS low-power currently return sentinels on _every_ backend, including Electron (`powerMonitor` exposes none; the rest need a native addon). Is shipping a complete contract ahead of any real implementation the intended posture (seam-first, fill later via native addons / `host-tauri` / `host-capacitor`), or should the charter scope these out until a backend can serve them? This is fork D / the platform-suite seam pattern applied here — name the intent so a future reviewer reads the sentinels as a deliberate seam, not an incomplete implementation.

6. **Rust conformance bookkeeping.** The `flighthq-power` crate is in the bundle but **uncompiled**, and its two intentional TS↔Rust divergences are not yet in the conformance map: `get_power_battery_health` returns `bool` vs TS `… | null`; `set_power_keep_awake` takes a required `mode` vs TS optional. Idle polling is absent in Rust by design (no ambient timer). Decide whether these divergences are accepted-and-recorded or should be reconciled toward identity.

7. **Package Map / codebase-map staleness (doc revision, your gate).** The Package Map line for `@flighthq/power` ("battery/charging status, low-power and keep-awake") and the codebase map's "Inbound host events" paragraph (power listed as `onSuspend`/`onResume` only) both materially understate the shipped surface — which now also owns idle/lock-screen, thermal, suspend/resume, and battery health, with seven backend `subscribe*` channels. Worth widening to match reality.
