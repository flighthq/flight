---
package: '@flighthq/power'
status: partial
score: 45
updated: 2026-07-09
ingested:
  - status.md
  - reviews/depth/power.md
  - source
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# Review: @flighthq/power

Merge-gate review of the **delta** (`incoming/integration-b2824e3d8/head` vs the approved baseline `incoming/integration-b2824e3d8/base`, i.e. `origin/main` `eb73c3d74`). Findings cite `b2824e3d8:<path>`. This is a merge gate, not a survey: the question is whether this incoming change is fit to land on the blessed floor. The baseline is not under review.

## Verdict

**partial — 35/100. DO NOT MERGE AS-IS.** The `packages/power/` source delta is, on its own terms, a competent and largely well-shaped expansion of the power cell — but it is **internally incomplete in this branch**: the entire `@flighthq/types` half of the change is absent. The power source imports and uses a `PowerStatus` / `PowerBackend` / `Power` surface and four new type modules that **do not exist** in the head bundle's `@flighthq/types`. The delta cannot typecheck and cannot build. That is a hard merge blocker regardless of the design merits.

The score is not a judgement of the design (which would score far higher with its types present); it is the merge-gate verdict on _this branch as it stands_. A type-incomplete delta that references a non-existent header is unmergeable, and the head bundle's own `review.md`/`status.md` assert the opposite of what the bundle contains.

## Merge blocker: the types-first header was never integrated

The head `packages/power/src/power.ts` imports four types and uses a `PowerStatus`/`PowerBackend`/`Power` surface that the head `@flighthq/types` does not define.

`b2824e3d8:packages/power/src/power.ts:2-10`:

```ts
import type {
  Power,
  PowerBackend,
  PowerBatteryHealth,
  PowerIdleState,
  PowerKeepAwakeMode,
  PowerStatus,
  PowerThermalState,
} from '@flighthq/types';
```

But in the head bundle, `packages/types/src/Power.ts` is **byte-identical to base** — still the 3-field `PowerStatus`, the 5-signal `Power`, and the 5-method `PowerBackend`:

`b2824e3d8:packages/types/src/Power.ts` (head, unchanged from base):

```ts
export interface PowerStatus {
  batteryLevel: number;
  isCharging: boolean;
  isLowPower: boolean;
}
// ... PowerBackend with getStatus/subscribe/subscribeSuspend/subscribeResume/setKeepAwake only
// ... Power with onChange/onCharging/onDischarging/onSuspend/onResume only
```

Confirmed three ways: (1) `diff base/packages/types/src/Power.ts head/packages/types/src/Power.ts` reports **IDENTICAL**; (2) the head `packages/types/src/` directory contains **only** `Power.ts` — no `PowerBatteryHealth.ts`, `PowerIdleState.ts`, `PowerKeepAwakeMode.ts`, or `PowerThermalState.ts`; (3) `changes.patch` contains **no hunk** for `packages/types/src/Power.ts` (its only diff hunks under power are `packages/power/src/power.test.ts` and `packages/power/src/power.ts`).

The concrete things the source uses that have no type definition in this branch:

- The four imported types `PowerBatteryHealth`, `PowerIdleState`, `PowerKeepAwakeMode`, `PowerThermalState` (`b2824e3d8:packages/power/src/power.ts:5-9`) — no source file, not in the barrel (`head/packages/types/src/index.ts:185` has a single `export * from './Power'` and nothing else for power).
- New `PowerStatus` fields written in `getStatus` and `createPowerStatus`: `out.chargingTime`, `out.dischargingTime`, `out.isBatteryLow`, `out.isOnBattery`, `out.thermalState` (`b2824e3d8:packages/power/src/power.ts:99-106, 130-140`) — none exist on the head `PowerStatus`.
- New `Power` signals constructed in `createPower`: `onIdleStateChange`, `onLockScreen`, `onLowPowerModeChange`, `onThermalStateChange`, `onUnlockScreen` (`b2824e3d8:packages/power/src/power.ts:74-80`) — none exist on the head `Power`.
- New `PowerBackend` methods called: `backend.getBatteryHealth`, `backend.isKeepAwakeActive`, `backend.getSystemIdleState`, `backend.getSystemIdleTime`, `backend.subscribeLockScreen`, `backend.subscribeLowPowerModeChange`, `backend.subscribeThermalStateChange`, `backend.subscribeUnlockScreen`, and the two-arg `setKeepAwake(enabled, mode)` (`b2824e3d8:packages/power/src/power.ts:31-40, 117-186, 290-322, 338-339`) — the head `PowerBackend` has none of these.

The head bundle's own `review.md` claims the opposite — "all new files in the patch, all re-exported from the types barrel (`index.ts:280-284`)" and "Added `isKeepAwakeActive()` to the `PowerBackend` interface in `packages/types/src/Power.ts`" (`status.md`). Neither is true of this bundle: the index has one power export line at 185, and `Power.ts` is unchanged. The status doc records the change came from `incoming/builder-67dc46d64/changes.patch`; the integration evidently carried the `packages/power/` worker hunks into this branch **without** the paired `packages/types/` hunks. The power source and its header are out of sync.

This is the single decisive finding. Everything below assumes the types are restored; it judges the design that _would_ land, so the worker knows what else to check once the build is green.

## What the delta does well (assuming the header is restored)

The power-source change is otherwise a careful, idiomatic expansion that follows the contract:

- **Out-params and explicit allocation.** `createPowerBatteryHealth()` allocates a fully-sentinel struct (`b2824e3d8:packages/power/src/power.ts:85-93`); `createPowerStatus()` seeds every new field with its sentinel (`-1`/`false`/`'Unknown'`, `:96-107`); `getPowerBatteryHealth(out)` and `getPowerStatus(out)` write into the caller's struct.
- **Sentinels, not throws.** Every web-degraded path returns a typed sentinel — `getBatteryHealth` → `null`, `getSystemIdleState` → `'Unknown'`, `getSystemIdleTime` → `-1`, the four `subscribe*` no-ops return inert unsubscribers (`b2824e3d8:packages/power/src/power.ts:117-150, 238-263`). No thrown errors for absent platform APIs.
- **Naming.** Every new export carries the full unabbreviated domain word: `getPowerSystemIdleState`, `getPowerSystemIdleTime`, `getPowerBatteryHealth`, `getPowerThermalState`, `setPowerIdlePollingIntervalMs`, `hasPowerKeepAwake` (correct `has*` for the boolean query). Self-identifying.
- **Keep-awake state moved onto the backend.** `hasPowerKeepAwake()` now delegates to `getPowerBackend().isKeepAwakeActive()` (`b2824e3d8:packages/power/src/power.ts:320-322`) rather than reading the module-level `_wakeLockSentinel`, so a custom backend reports its own lock state. Correct fix.
- **Wake-lock re-acquire.** The web `setKeepAwake` re-requests the lock on the sentinel's `release` event when the tab is visible again (`b2824e3d8:packages/power/src/power.ts:170-179`), matching real Screen Wake Lock behavior.
- **`Infinity` normalization.** `chargingTime`/`dischargingTime` from the Battery Status manager are normalized `Infinity → -1` (`b2824e3d8:packages/power/src/power.ts:201-209, 220-221`), so the sentinel convention holds.
- **Tests track the surface.** `power.test.ts` adds colocated, alphabetized `describe` blocks mirroring the new exports, with fake-timer idle-poller coverage, the alias case for `getStatus`, both `setKeepAwake` modes, idempotent `disposePower`, and safe `detachPower`-when-unattached (`b2824e3d8:packages/power/src/power.test.ts`). Behaviour-level, not surface smoke. (They will not compile until the types land, but the intent is right.)

## Secondary findings (not merge-blocking; verify after the build is green)

- **Idle poll seeds at attach with no listener.** `attachPower` reads `backend.getSystemIdleState(idleThresholdSeconds)` to seed `lastIdleState` unconditionally at attach (`b2824e3d8:packages/power/src/power.ts:46`), and starts a `setInterval` that runs for the entity's whole attached life even if `onIdleStateChange` never gains a listener. The per-tick `hasSignalSlots` guard (`:48`) keeps the _backend call_ and _emit_ out of the no-listener case, so the cost is one timer + one cheap check per interval — defensible, but it is the poll-vs-push design fork the charter has not yet settled (Open direction 2). Not a blocker; flagged so it is decided, not defaulted. Note this is **not** a side-effect-free-import violation: the timer starts in the explicit `attachPower` opt-in, never at module top level.
- **`getStatus` alias-safety comment is vacuous.** The comment "Read all input values first (alias-safe: out may be the same object as an input)" (`b2824e3d8:packages/power/src/power.ts:125`) guards an aliasing case that cannot occur: `getStatus(out)` has no object _input_ — it reads module-closure primitives (`cachedLevel`, etc.) into locals, and `out` cannot alias a closure variable. The locals dance is harmless but the comment overstates the invariant. Trim the comment to match reality (the convention genuinely bites for a backend that reads from another object, which the web backend does not).
- **Signal count grew 5 → 10 with no `enablePowerSignals` gate.** `createPower` now allocates 10 signals (`b2824e3d8:packages/power/src/power.ts:70-81`) where base allocated 5, with cost assumed at `createPower`/`attachPower` rather than behind the documented `enable*` opt-in. Pre-release, defensible ("10 cheap signals"), but it is a silent departure from the signal-group convention and is charter Open direction 4 — decide rather than drift.

## Contract / fork checks (the parts that pass)

- **Composition / bedrock** — pass. The change adds fields and backend methods to one cohesive cell; it does not fuse subjects or bundle config-gated feature branches. No decomposition smell introduced by the delta.
- **Tree-shaking** — pass. `index.ts` is still the single `export * from './power'` root; `package.json` keeps `"sideEffects": false`; no eager registration, no module-top-level side effect added (the lazy `getPowerBackend` default and module state at file bottom are unchanged in shape).
- **Registry vs closed union** — n/a. No `kind` switch in this cell; the growing surface is a backend _trait_, which is the blessed seam-fill pattern, not a closed union.
- **Subject triad / plurality** — n/a. No format codecs or backends mis-homed in this package; concrete native backends live in `host-electron`.
- **Rust mirror** — `flighthq-power` is named consistently but, per the status doc, is **uncompiled** in the bundle and is out of scope for this TS merge gate; its intentional divergences are unrecorded in the conformance map (a separate, cross-package item).

## Charter fit

The charter is an unblessed DRAFT (only **What it is** and _proposed_ North star / Boundaries are filled; **Decisions** empty). With no blessed decision to violate, there are no charter contradictions — but the charter's own Open directions (suspend/resume vs `lifecycle`, poll-vs-push idle, thermal/idle asymmetry, `enablePowerSignals`, sentinel-everywhere posture, Rust bookkeeping) are exactly the design questions this delta touches and does not settle. They remain for the user, not for the merge.

## Bottom line

The design is mergeable; **this branch is not**. Restore the `@flighthq/types` power header (the four new type modules + the widened `PowerStatus`/`PowerBackend`/`Power` in `Power.ts` + barrel exports), confirm the package typechecks and tests pass, then the secondary findings are small cleanups and design-fork notes — none of which block a merge once the build is green.

## 2026-07-09 — refreshed

gated all 10 signals behind enablePowerSignals opt-in (Power type nullable), matching the platform-suite signal-cost convention (commit 1c1e6dc1). Verified against source; a full re-review is due.
