---
package: '@flighthq/haptics'
status: partial
score: 35
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/haptics.md
  - source
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# haptics — Review

> **Merge-gate review.** Judged as the **delta** of `integration-b2824e3d8` (head) against the approved baseline `origin/main (eb73c3d74)` (base), not as a standalone survey. The approved baseline is the blessed floor and is not under review. The prior `solid`/88 review described the package at `67dc46d64`, a _different_ source state in which the supporting `@flighthq/types` surface was present. That surface is **absent** in this integration branch, so this review scores the branch as-shipped, not the worker's claim.

## Verdict

**Reject — the package does not compile in the integration branch.** The incoming `haptics.ts` and `haptics.test.ts` were extended to depend on a `@flighthq/types` surface (`HapticsCapabilities`, an extended `HapticsBackend`, the widened `HapticImpactStyle`) that **was never landed in `b2824e3d8`**. The header layer the implementation compiles against is byte-identical to the approved base. This is a fatal types-first violation (standard 6) and a claim-vs-code dishonesty (standard 7): the embedded worker status report asserts the types were updated; the bytes say they were not. The design of the delta is otherwise sound — flat free functions, tree-shakable, honest sentinels — but a merge gate cannot pass a tree that fails `tsc -b`.

## The fatal finding — implementation depends on absent header surface

`b2824e3d8:packages/haptics/src/haptics.ts:1` imports a type that does not exist in the branch:

```ts
import type { HapticImpactStyle, HapticNotificationType, HapticsBackend, HapticsCapabilities } from '@flighthq/types';
```

But `head/packages/types/src/Haptics.ts` is **identical to base** (md5 `e8e0f6d8…` on both; no hunk for it in `changes.patch`) and still declares only:

```ts
export type HapticImpactStyle = 'light' | 'medium' | 'heavy';
export interface HapticsBackend {
  vibrate(durationMs: number): boolean;
  impact(style: HapticImpactStyle): boolean;
  notification(type: HapticNotificationType): boolean;
  selection(): boolean;
}
```

`HapticsCapabilities` does not exist anywhere in `head/packages/types/src/` (grep: zero hits). Yet the incoming implementation uses it and five other undeclared members against the `HapticsBackend` seam — every one is a compile error in this branch:

- `b2824e3d8:packages/haptics/src/haptics.ts:5` — `getHapticsBackend().cancel()` (no `cancel` on `HapticsBackend`).
- `…:67` — `getHapticsBackend().capabilities(out)` with `out: HapticsCapabilities` (neither exists).
- `…:72` — `getHapticsBackend().isSupported()` (no `isSupported`).
- `…:78` — `getHapticsBackend().prepare?.()` (no `prepare`).
- `…:89` — `getHapticsBackend().impact(style, intensity)` — the seam's `impact` takes one argument.
- `…:112` — `getHapticsBackend().vibratePattern(pattern)` (no `vibratePattern`).
- `…:127-130` — `backend.vibrateWaveform(...)` (no `vibrateWaveform`).
- `…:26` — `style === 'rigid' … style === 'soft'` against a union that is only `'light' | 'medium' | 'heavy'`.

The test file repeats the break at `b2824e3d8:packages/haptics/src/haptics.test.ts:1` (`import type { … HapticsCapabilities } from '@flighthq/types'`) and at `…test.ts:19` (`function makeCapabilities(...): HapticsCapabilities`). `tsc -b` typechecks `src/*.test.ts`, so both source and test fail to build.

This is the integration merge dropping one half of a two-file change: the `packages/haptics` hunks landed, the `packages/types/src/Haptics.ts` hunk did not. The result is an internally inconsistent tree. It must not merge in this state.

## Claim vs. code (standard 7 — honesty)

The status report embedded in the same patch (the haptics status block in `changes.patch`) states verbatim:

> **`HapticImpactStyle`** extended to `'heavy' | 'light' | 'medium' | 'rigid' | 'soft'` … **`HapticsCapabilities` interface** added … **`HapticsBackend` interface fully extended** (`cancel` / `capabilities` / `isSupported` / `prepare?` / `vibratePattern` / `vibrateWaveform?`).

None of that is true of `b2824e3d8`'s `packages/types/src/Haptics.ts`. The continuity narrative describes a state that is not the shipped state. A reviewer trusting the report would wave through a non-compiling tree.

## What the delta gets right (would pass once the header lands)

Judged on design alone — assuming the missing `@flighthq/types` hunk is restored — the incoming change is the right shape:

- **Composition / bedrock (standard 1):** every new capability is a flat free function (`cancelDeviceVibration`, `getHapticsCapabilities`, `isHapticsSupported`, `prepareHaptics`, `vibrateDevicePattern`, `vibrateDeviceWaveform`) delegating to one backend method. No config-gated monolith, no fused subjects, no over-split. `b2824e3d8:packages/haptics/src/haptics.ts:108-131`.
- **Naming (standard 2):** full, unabbreviated, domain-carrying, self-identifying from the barrel — `vibrateDeviceWaveform`, `getHapticsCapabilities`, `isHapticsSupported` (`is*` predicate), `cancelDeviceVibration`. No abbreviations.
- **Tree-shaking / bundle invariant (standard 3):** `package.json` is unchanged — single `.` export, `"sideEffects": false` intact. New functions are independent free functions; none adds a hot-loop branch or shared switch that taxes an existing import. The web backend's `impact` ternary chain (`…:26`) is local to one backend factory, not a shared dispatch.
- **Registry vs. union (standard 4):** N/A — haptics has no growing `kind`/handler family; the impact/notification style sets are small closed string unions, correctly so.
- **Subject triad / plurality guard (standard 5):** no format/backend code is mis-homed; the `-formats` neighbor and a `host-*` native backend are correctly deferred, not prematurely split.
- **Contract hygiene (standard 6), the parts that are present:** `getHapticsCapabilities(out)` is a correct out-param returning the same `out` (`…:66-68`); sentinels (`false` / no-op) everywhere, no throws; `Readonly<number[]>` on pattern/waveform inputs; `prepare?.()` optional-chained so a backend without it is a safe no-op. The empty-pattern / empty-timings guards return `false` (expected-failure sentinel), correct per the contract.
- **Tests (standard 7), modulo the compile break:** colocated, alphabetized, `describe` blocks mirror exports, 31 `it` cases covering forwarding, jsdom-unavailable, empty-input sentinels, intensity clamping, the waveform→pattern fallback, and `prepare`-absent. Good coverage **if it compiled**.

## Minor notes (not blockers, recorded for the eventual re-land)

- `b2824e3d8:packages/haptics/src/haptics.ts:86-87` documents "Intensity defaults to 1 when omitted," but `triggerHapticImpact` forwards `undefined` to the backend rather than substituting `1`. On the web backend this is behaviorally equivalent (`base * 1 === base`); on a native backend the meaning of "undefined intensity" is the backend's call. The doc-comment slightly overstates a guarantee the free function does not enforce. Cosmetic.
- `vibrateDeviceWaveform` documents "timings and amplitudes must have equal length" (`…:116`) but validates neither length nor equality. This is acceptable under the contract (do not validate internal invariants correct usage cannot reach; mismatched length is API misuse), and the empty-timings guard is the one expected-failure case it does check. No action required.

## Standards scorecard (delta only)

| #   | Standard                        | Result                                                                  |
| --- | ------------------------------- | ----------------------------------------------------------------------- |
| 1   | Composition / bedrock           | Pass                                                                    |
| 2   | Naming clarity                  | Pass                                                                    |
| 3   | Tree-shaking / bundle invariant | Pass                                                                    |
| 4   | Registry vs. closed union       | N/A (no growing family)                                                 |
| 5   | Subject triad + plurality guard | Pass (correct deferrals)                                                |
| 6   | Contract hygiene (types-first)  | **Fail — implementation depends on absent `@flighthq/types` surface**   |
| 7   | Tests & honesty (compiles)      | **Fail — does not compile; status report claims types that are absent** |

Two hard fails on the merge-gate axes, both stemming from the single dropped `@flighthq/types` hunk. Score 35 reflects a design that is fundamentally right but a tree that cannot be merged as-is. The fix is mechanical (land the matching `packages/types/src/Haptics.ts` change), after which this returns to the prior `solid` standing.
