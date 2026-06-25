---
package: '@flighthq/power'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/power

The merge-gate review verdict is **partial — 35/100, DO NOT MERGE AS-IS**. The score reflects a single decisive defect: the `packages/power/` source delta references a `@flighthq/types` power header (four new type modules plus widened `PowerStatus`/`PowerBackend`/`Power`) that **does not exist in the integration branch** — so the delta cannot typecheck or build. The _design_ the source expresses is sound; the _branch_ is type-incomplete.

That shapes this assessment unusually. The one thing that must happen is **not** a within-package sweep — it is restoring the missing types half, which lives in `@flighthq/types`. So `Recommended` (sweep-safe, within-`power`) is thin, and the merge-blocking work and most follow-ups are cross-package or design-fork items routed to Backlog and the charter.

## Recommended

Sweep-safe: within `@flighthq/power`, no cross-package coupling, no breaking change, no open design decision. These only matter **after** the build is green; none of them unblocks the merge on its own.

- **Trim the vacuous alias-safety comment on the web `getStatus`.** The comment "Read all input values first (alias-safe: out may be the same object as an input)" (`power.ts:125`) guards a case that cannot occur — `getStatus(out)` has no object input, only `out`, and the values read are module-closure primitives. Reword to state the real invariant (it bites only when a backend reads from another object, which the web backend does not), or drop it. Purely a comment edit inside `power.ts`. (review.md "`getStatus` alias-safety comment is vacuous".)

> The `Recommended` set is deliberately tiny: the merge blocker and every follow-up of substance is cross-package or a design decision, which by the contract are not sweep-safe within-package work.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Restore the `@flighthq/types` power header (THE MERGE BLOCKER).** The branch is missing `PowerBatteryHealth.ts`, `PowerIdleState.ts`, `PowerKeepAwakeMode.ts`, `PowerThermalState.ts`, and the widened `PowerStatus`/`PowerBackend`/`Power` in `Power.ts`, plus their barrel exports — all of which `packages/power/src/power.ts` imports and uses. _Parked from `Recommended` because it edits `@flighthq/types`, a different package: it is cross-package by definition and cannot be a within-`power` sweep._ It is nonetheless the one mandatory action before this can merge; it is carried into the dispatch brief as MUST-FIX. (review.md "Merge blocker: the types-first header was never integrated".)
- **Reconcile the head bundle's `power` admin docs with reality.** The head `review.md`/`status.md` assert the types landed (the four files "all re-exported from the types barrel `index.ts:280-284`", `isKeepAwakeActive` "added to `packages/types/src/Power.ts`") when the bundle contains neither. _Parked:_ the in-tree `review.md`/`status.md` are corrected by this review pass, but auditing why the integration carried the `packages/power/` hunks without the paired `packages/types/` hunks is an ingest-pipeline concern, not within-package source work. (review.md "the head bundle's own `review.md` claims the opposite".)
- **Compile and prove the `flighthq-power` Rust crate.** Per the status doc the crate is in the bundle but **uncompiled**, so its conformance is unproven. _Parked:_ belongs to the `rust` worktree and needs a Cargo toolchain this TS session cannot exercise. (review.md "Rust mirror".)
- **Record the TS↔Rust divergences in the conformance map.** The intentional divergences (`get_power_battery_health` returning `bool` vs TS `… | null`; `set_power_keep_awake` taking a required `mode` vs TS optional; idle-polling absent in Rust by design) are not yet in the map. _Parked:_ edits the shared `tools/agents/docs/rust/conformance.md`, outside this cell.
- **Fill thermal / battery-health / OS-low-power on a real backend.** These fields are wired through the contract but return sentinels on both the web backend and (per the status doc) the Electron backend. _Parked:_ requires a native host (`host-electron` addon, future `host-tauri`/`host-capacitor`) — cross-package, and gated on the "sentinel-everywhere posture" Open direction below.
- **Widen the codebase-map Package Map + "Inbound host events" lines for `@flighthq/power`.** Both still understate the cell (idle/lock-screen, thermal, suspend/resume, battery health, seven `subscribe*` channels). _Parked:_ edits the shared `tools/agents/docs/index.md` — a doc revision the review flags as the user's gate, not autonomous within-package work.

## Open directions (route to charter)

These are design / cross-package questions the DRAFT charter does not answer. They are **not** Recommended — they need a Boundary/North-star decision and belong in the charter's Open directions (the charter already carries them; restated here for traceability; this skill does not edit the charter):

1. **Suspend/resume ownership vs `@flighthq/lifecycle`.** `power` wires `onSuspend`/`onResume` to web `freeze`/`resume` (a tab-lifecycle event) while `lifecycle` owns app active/inactive/background/resume/pause. Proposed line: OS machine-sleep → `power`; app/tab lifecycle → `lifecycle`. Cross-package; the most important boundary to settle. (Charter Open direction 1.)
2. **Idle delivery: poll vs push.** The guarded `setInterval` poller in `attachPower` seeds `lastIdleState` at attach even with no listener and runs unconditionally afterward (`power.ts:46-54`). Bless polling, or move idle to push-only from native backends (which converges TS with Rust, where the poller is already omitted)? (Charter Open direction 2.)
3. **Thermal/idle asymmetry.** `getPowerSystemIdleState` has a dedicated backend method, but `getPowerThermalState` reads through `getStatus(_scratch).thermalState`. Settle whether thermal is deliberately part of the hot status snapshot or should get its own backend method. (Charter Open direction 3.)
4. **`enablePowerSignals` group gate.** `createPower` now allocates 10 signals with no `enable*` opt-in. Ratify "10 cheap signals, cost assumed at attach" as the blessed exception, or adopt the documented signal-group gate. (Charter Open direction 4.)
5. **Sentinel-everywhere native fields — intended posture?** Thermal/health/low-power return sentinels on every current backend, including Electron. Name whether the seam-first "complete contract ahead of any real implementation" posture is intended, so a future reviewer does not read the sentinels as an incomplete implementation. (Charter Open direction 5; gates the "fill thermal/health" backlog item.)

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here yet._
