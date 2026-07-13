---
package: '@flighthq/power'
status: solid
score: 80
updated: 2026-07-13
ingested:
  - source
  - tests
  - charter.md
  - status.md
  - prior review (2026-06-25, refreshed 2026-07-09)
---

# power — Review (live-tree survey, 2026-07-13)

> Supersedes the 2026-06-25 merge-gate review (`partial — 35/45, DO NOT MERGE`). Its single decisive finding — the `@flighthq/types` power header missing from the integration — is resolved: `packages/types/src/Power.ts` now defines the widened `PowerStatus` (8 fields), `PowerBackend` (13 members), the nullable-signal `Power` (10 slots), plus `PowerIdleState`/`PowerKeepAwakeMode`/`PowerThermalState`, and `PowerBatteryHealth`/`PowerBatteryHealthState` live in `packages/types/src/PowerBatteryHealth.ts`. The package compiles, and the 2026-07-09 refresh note (signals gated behind `enablePowerSignals`, commit 1c1e6dc1) is verified in source.

## Verdict

**solid — 80/100.** A complete live-energy-state cell: 19 exports over a 13-member backend seam covering battery status (level, charging/discharging time, low-battery, on-battery), OS low-power mode, thermal state, system idle state/time with configurable polling, lock/unlock-screen, suspend/resume, battery health, and two-mode keep-awake. The suite conventions all hold, including the one the charter's sole Decision mandated: `createPower` now allocates 10 **null** slots and `enablePowerSignals(power)` idempotently allocates them (`power.ts:80-93, 295-306`), matching the 2026-07-02 suite-wide signal opt-in decision. The prior assessment's one Approved item is **implemented**. What keeps it out of authoritative territory is honest web-platform poverty (most of the surface is sentinel-only on web) plus a few undecided seam semantics the charter already tracks.

## Spot-verified capabilities

- **Exports (19):** `attachPower`, `createPower`, `createPowerBatteryHealth`, `createPowerStatus`, `createWebPowerBackend`, `detachPower`, `disposePower`, `enablePowerSignals`, `getPowerBackend`, `getPowerBatteryHealth`, `getPowerIdlePollingIntervalMs`, `getPowerStatus`, `getPowerSystemIdleState`, `getPowerSystemIdleTime`, `getPowerThermalState`, `hasPowerKeepAwake`, `setPowerBackend`, `setPowerIdlePollingIntervalMs`, `setPowerKeepAwake`. All fully type-worded, correct `get*/has*/set*` verbs; test file mirrors with 19 describes.
- **Web backend fidelity:** Battery Status API with per-field caches and `Infinity → -1` normalization; Screen Wake Lock with visibility-aware re-acquire on browser auto-release (`power.ts:179-190`); `freeze`/`resume` for suspend/resume. Sentinels everywhere the web has no API: `getBatteryHealth → null`, idle state `'Unknown'`, idle time `-1`, thermal `'Unknown'`, lock-screen/low-power/thermal subscriptions return inert unsubscribers with explanatory comments.
- **Signal gating:** every emit site in `attachPower` null-checks its slot; the idle poller additionally guards with `hasSignalSlots` before reading the backend.
- **Teardown:** `detachPower` is WeakMap-keyed and safe when unattached; `disposePower` = detach (correct `dispose*` semantics — nothing non-GC to free).

## Gaps (why not higher)

- **Web can serve only ~half the surface.** Thermal, idle, lock/unlock, low-power mode, and battery health are all native-only; on web the package is effectively battery + wake-lock + freeze/resume. The seam is shaped so an Electron/Tauri host reaches full fidelity (13 flat backend members, each independently fillable), but no native backend in-repo exercises the widened members yet — the native half is designed, not proven.
- **Idle poll runs even when the backend cannot answer.** `attachPower` starts the `setInterval` unconditionally; the web backend's `getSystemIdleState` always returns `'Unknown'`, so on web the timer ticks forever with no possible transition. Cheap, but a capability probe (or a backend `hasIdleDetection`) would let attach skip the timer entirely. Related: the poll-vs-push fork is still an undecided charter Open direction (Rust omits the poller).
- **`onIdleStateChange` emits no payload** — a listener learns *that* the state changed but must call `getPowerSystemIdleState(threshold)` (re-supplying the threshold) to learn *what* it became. Asymmetric with `onChange`, which carries the status snapshot.
- **Thermal/idle asymmetry** (charter Open direction): idle has a dedicated backend method; thermal reads through the `getStatus` snapshot. Undecided, not drifted — but it shows at the seam.
- **`_wakeLockSentinel` is module-level, not per-backend.** Two `createWebPowerBackend()` instances share one sentinel slot (`power.ts:369`), so backend instances are not independent. Harmless under the singleton `getPowerBackend` pattern; a latent aliasing surprise for anyone constructing a second web backend directly.
- **Vacuous alias-safety comment** at `power.ts:136` ("out may be the same object as an input") — `getStatus(out)` has no object input; the comment guards an impossible case. Carried from the prior review; still present.
- **Rust mirror unverified** (crate exists per charter front matter; conformance entries unwritten). Cross-tree note.

## Charter fit

The charter's single Decision (enablePowerSignals gate) is implemented. All four Open directions remain genuinely open and are the right list: suspend/resume ownership vs `lifecycle`, idle poll-vs-push, thermal/idle symmetry, sentinel-everywhere posture. No contradictions found between charter and source.

## Candidate open directions

- Idle capability probe / conditional poller (folds into the poll-vs-push fork).
- Payload on `onIdleStateChange` (carry the new `PowerIdleState`).
- Per-backend wake-lock state (move `_wakeLockSentinel` into the backend closure) — sweep-safe; listed in the assessment.
