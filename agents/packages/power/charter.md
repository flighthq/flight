---
package: '@flighthq/power'
crate: flighthq-power
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# power — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

`@flighthq/power` is the live-status platform cell for power: battery level and charging state, AC/on-battery power source, OS low-power mode, thermal state, system idle and lock-screen events, machine suspend/resume, battery health, and screen/app keep-awake. It is the dynamic counterpart to the static `device`/`screen` cells — `device` answers "what is this hardware," `power` answers "what is its energy state right now and how is it changing." It is an event-style platform capability: a `Power` entity of signals wired through the suite's standard quartet, paired with flat command/query functions (`getPowerStatus(out)`, `setPowerKeepAwake`) over a swappable `PowerBackend`. A web/DOM backend (W3C Battery Status, Screen Wake Lock, `freeze`/`resume`) is always lazily available; native hosts replace via `setPowerBackend`.

## Decisions

- **[2026-07-02] Add `enablePowerSignals` opt-in gate.** `createPower` currently eagerly allocates 10 signals with no `enablePowerSignals` gate. Per the shared signal opt-in convention, add an `enablePowerSignals` function so signal cost is not assumed until opted in.

## Open directions

- Suspend/resume ownership vs `@flighthq/lifecycle` — proposed line: OS machine-sleep in `power`, app/tab lifecycle in `lifecycle`.
- Idle delivery model: poll (`setInterval`) vs push-only from native backends. Rust already omits the poller.
- Thermal/idle asymmetry: `getPowerSystemIdleState` has a dedicated backend method, but `getPowerThermalState` reads through the status snapshot. Decide on symmetry.
- Sentinel-everywhere native fields (thermal, health, low-power) — seam-first posture (fill later via native backends) or scope out until a backend can serve them.
