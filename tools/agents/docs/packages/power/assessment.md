---
package: '@flighthq/power'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/power

The review verdict is **solid — 90/100**. The Bronze/Silver/Gold maturation roadmap is essentially **absorbed**: battery time fields, `isOnBattery`, the `PowerKeepAwakeMode` split, `hasPowerKeepAwake` delegating to the backend, the `visibilitychange` wake-lock re-acquire, system idle, lock/unlock events, the `isLowPower`/`isBatteryLow` split, `onLowPowerModeChange`, thermal state, battery health, and `onIdleStateChange` all landed and are tested. What remains is **native-host coverage**, **Rust conformance bookkeeping**, **shared-doc accuracy**, and a cluster of **design questions** — none of which is sweep-safe within-package work.

The result is a short `Recommended` and a `Backlog` dominated by cross-package / conformance / design items. That is the honest shape of a 90/100 cell: the in-package surface is done; the open work lives at the seams the charter has not yet ruled on.

## Recommended

Sweep-safe: within `@flighthq/power`, no cross-package coupling, no breaking change, no open design decision.

- **Coalescing guard for chatty native subscriptions** — the Gold roadmap's "funnel `timechange`/lock/idle subscriptions through one debounced emit so a burst of OS events does not fan out N `onChange`s." Today's change path reuses a single `_scratch` (good), but there is no coalescing guard if a native backend proves chatty. This is purely internal to `power.ts` (an emit-debounce inside the existing subscription wiring), no API change, no cross-package reach. Add the guard plus a fake-timer test asserting a burst collapses to one `onChange`. (review.md "Gap" performance discipline; roadmap Gold "Performance / allocation discipline".)

> The rest of the roadmap is either already landed (most of Bronze/Silver/Gold) or is parked below — the `Recommended` set is deliberately thin because this cell's remaining work is at the seams, not inside the package.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Compile and prove the `flighthq-power` Rust crate.** The crate (`crates/flighthq-power/src/{lib,power}.rs`
  - `crates/flighthq-types/src/platform.rs`) is in the bundle but **uncompiled** — its conformance is unproven, not merely "structurally correct." _Parked:_ belongs to the Rust port / `rust` worktree and needs a Cargo toolchain this TS session cannot exercise. (review.md "Rust conformance is unproven"; roadmap Gold "`flighthq-power` Rust crate (1:1 parity)".)
- **Record the TS↔Rust divergences in the conformance map.** Three intentional divergences are not yet in the map: `get_power_battery_health` returning `bool` vs TS `… | null`; `set_power_keep_awake` taking a required `mode` vs TS optional; and idle-polling being absent in Rust by design (no ambient timer). _Parked:_ edits the shared `tools/agents/docs/rust/conformance.md` divergence map, a cross-package artifact outside this cell. (review.md "Rust conformance is unproven".)
- **Fill thermal / battery-health / OS-low-power on a real backend.** Thermal state, battery health, OS low-power-mode, and idle/lock events are wired through the contract but return sentinels on _both_ the web backend and the Electron backend (Electron's `powerMonitor` exposes none of thermal/health/low-power; the rest need a native addon). The seam is complete; the coverage is not. _Parked:_ requires a native host (`host-electron` addon, `host-winit`/`host-sdl`, future `host-tauri`/`host-capacitor`) — cross-package, and gated on the "sentinel-everywhere posture" Open direction below. (review.md "Native-gated reads are sentinel-only"; roadmap Gold thermal/health.)
- **Widen the Package Map line for `@flighthq/power`.** The codebase-map entry still reads "battery/charging status, low-power and keep-awake" and now materially understates the cell (also owns idle/lock-screen, thermal, suspend/resume, battery health). _Parked:_ edits the shared `tools/agents/docs/index.md` Package Map — a doc revision the review explicitly flags as the user's gate, not autonomous within-package work. (review.md "Candidate doc revisions".)
- **Correct the codebase-map "Inbound host events" paragraph.** It lists power's inbound events as `onSuspend`/`onResume` only; the backend now has seven `subscribe*` channels (`subscribeLockScreen`, `subscribeLowPowerModeChange`, `subscribeThermalStateChange`, `subscribeUnlockScreen`, plus suspend/resume and the base `subscribe`). _Parked:_ same shared-doc, user's-gate reason as above. (review.md "Candidate doc revisions".)
- **Usage example + web-degraded sentinel doc note.** A short example (poll `getPowerStatus`, attach for change events, keep-awake toggle, thermal-driven quality scaling) plus a doc note making every web-degraded sentinel honest, so the optimistic suspend/resume/idle naming is not misread. _Parked:_ examples live in the top-level `examples/` tree (cross-cutting, and bundle-size-sensitive), not in the package, and the sentinel-honesty wording depends on the "sentinel-everywhere posture" ruling. (roadmap Gold "Docs + examples".)

## Open directions (route to charter)

These are design / cross-package questions the stub charter does not answer. They are **not** Recommended — they need a Boundary/North-star decision and belong in the charter's Open directions (noted here for the charter author; this skill does not edit the charter):

1. **Suspend/resume ownership vs `@flighthq/lifecycle`.** Unresolved across two reviews. `power` wires `onSuspend`/`onResume` to web `freeze`/`resume` (a tab-lifecycle event) while `lifecycle` owns app active/inactive/background/resume/pause. Proposed line: OS machine-sleep → `power`; app/tab lifecycle → `lifecycle`. The most important boundary the charter should settle; blocks adding more sleep-adjacent surface. (Cross-package.)
2. **Idle delivery: poll vs push.** The guarded poll is deliberate (the Signal API has no "listener-count changed" hook), but the timer runs unconditionally after attach and seeds `lastIdleState` even with no listener. Bless polling, or move idle to push-only from native backends (which would converge TS with Rust, where the poller is already omitted)? An API-model decision.
3. **Thermal/idle asymmetry.** `getPowerSystemIdleState` has a dedicated backend method, but `getPowerThermalState` reads through `getStatus(_scratch).thermalState`. Is thermal deliberately part of the hot status snapshot, or should it get its own `getThermalState()` backend method for symmetry?
4. **`enablePowerSignals` group gate.** Should `power` follow the documented opt-in signal-group convention, or is "10 cheap signals, cost assumed at `attachPower`" the blessed exception? The status doc argues the latter; the charter should ratify it so the next agent does not re-litigate.
5. **Sentinel-everywhere native fields — intended posture?** Thermal/health/low-power return sentinels on every current backend. Is shipping a contract ahead of any real implementation the intended posture (seam-first, fill later via native addons), or should the charter scope these out until a backend can serve them? Naming the intent prevents a future reviewer reading the sentinels as an incomplete implementation. (Gates the "fill thermal/health" backlog item and the doc note.)

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._
