---
package: '@flighthq/device'
status: partial
score: 35
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/device/{src,package.json}
  - head/packages/types/src/Device.ts
  - head/packages/{device-formats,platform-formats}/src
  - changes.patch (packages/device slice)
  - structural-forks.md
  - charter.md (draft)
---

# device — Review (MERGE GATE: integration-b2824e3d8 → origin/main)

> Merge-gate survey. The **approved baseline** is `origin/main` (`eb73c3d74`) under `base/packages/device/` and is NOT under review. The judged unit is the **delta** — `head` vs `base` — i.e. the incoming change `integration-b2824e3d8` proposes to land on the blessed floor. Findings cite `b2824e3d8:<path>`. The prior `review.md` (score 78, against the `builder-67dc46d64` bundle) reviewed the device runtime in isolation and is superseded here: against the actual integration head, the delta **does not compile**, which the prior survey did not catch.

## Verdict

**REJECT for merge — partial / 35.** The `device` runtime rewrite is well-crafted in isolation (the prior review's praise stands for the code's intent), but the integration is **internally inconsistent and does not build**. The delta rewrites `@flighthq/device` to a much richer API — `DeviceCapabilities`, `DeviceDisplayMetrics`, `getDeviceId`, `refreshDeviceInfo`, `enableWebSafeAreaInsets`, and ~20 new `DeviceInfo` fields — and adds two new packages (`device-formats`, `platform-formats`), **but never lands the corresponding `@flighthq/types` header changes.** Every new type the delta consumes is absent from the integration's `types` package. On top of that compile-blocking gap, the delta makes `@flighthq/device` depend on `@flighthq/device-formats`, a package the SDK structural-forks register names **explicitly as rejected**. This is not a final shape worth keeping; it is a half-landed change missing its header commit.

## What the delta changes (head vs base)

Base (`eb73c3d74`) `device` is a small, self-contained leaf: `createDeviceInfo`/`createSafeAreaInsets`/`createWebDeviceBackend`/`getDeviceBackend`/`getDeviceInfo`/`getSafeAreaInsets`/`setDeviceBackend`, an inline `detectWebOsName`, no formats dependency, and a narrow `DeviceInfo` (model/manufacturer/osName/osVersion/platform/isVirtual/memory). It compiles against the base `types`.

The delta (`b2824e3d8`):

- **Expands the API surface** (`b2824e3d8:packages/device/src/device.ts`): adds `createDeviceCapabilities`, `createDeviceDisplayMetrics`, `enableWebSafeAreaInsets`, `getDeviceCapabilities`, `getDeviceDisplayMetrics`, `getDeviceId`, `refreshDeviceInfo`; expands `getInfo` to fill `arch`, `cpuCores`, `gpuVendor/Renderer`, `formFactor`, `osBuild`, `supportedAbis`, `totalMemory`, etc.
- **Adds two new packages** `@flighthq/device-formats` and `@flighthq/platform-formats` (`b2824e3d8:packages/device-formats/`, `packages/platform-formats/`), and **adds them as dependencies** of `device` (`b2824e3d8:packages/device/package.json:30-31`).
- **Does NOT change** `@flighthq/types/src/Device.ts`: the integration head file is byte-identical to base and still declares only the 7-field `DeviceInfo` and the 2-method `DeviceBackend`.

## Blocking findings (merge gate)

### 1. The delta does not compile — the types header was never landed. (BLOCKER)

`b2824e3d8:packages/device/src/device.ts:3-10` imports type `DeviceCapabilities`, `DeviceDisplayMetrics` and value `DeviceFormFactorUnknown` from `@flighthq/types`:

```ts
import type {
  DeviceBackend,
  DeviceCapabilities,
  DeviceDisplayMetrics,
  DeviceInfo,
  SafeAreaInsets,
} from '@flighthq/types';
import { DeviceFormFactorUnknown } from '@flighthq/types';
```

`b2824e3d8:packages/device/src/device.test.ts:8` additionally imports `DeviceFormFactorDesktop, DeviceFormFactorPhone`, and `b2824e3d8:packages/device-formats/src/userAgentParse.ts:1-10` imports `DeviceFormFactor` plus all seven `DeviceFormFactor*` constants.

**None of these symbols exist in the integration's `@flighthq/types`.** `b2824e3d8:packages/types/src/Device.ts` (whole file, 27 lines) defines only:

```ts
export interface DeviceInfo {
  model;
  manufacturer;
  osName;
  osVersion;
  platform;
  isVirtual;
  memory;
}
export interface SafeAreaInsets {
  top;
  right;
  bottom;
  left;
}
export interface DeviceBackend {
  getInfo(out): DeviceInfo;
  getSafeAreaInsets(out): SafeAreaInsets;
}
```

A `grep` across the entire head `types` package for `DeviceCapabilities`, `DeviceDisplayMetrics`, and `DeviceFormFactor` returns nothing, and `changes.patch` contains **no hunk that adds** `+export interface DeviceCapabilities`, `+export const DeviceFormFactor*`, or the new `DeviceInfo` fields (`+arch:`, `+cpuCores:`, …). Consequently:

- `device.ts` references a `DeviceInfo` shape (`out.arch`, `out.cpuCores`, `out.gpuVendor`, `out.formFactor`, `out.supportedAbis`, …) whose fields do not exist on the declared `DeviceInfo` → type errors throughout `getInfo`.
- `DeviceBackend` in head `types` has no `getCapabilities`/`getDisplayMetrics`/`getId`, yet the web backend and `getDeviceBackend()` callers assume them.
- Both new `-formats` packages import `DeviceFormFactor*` constants that do not exist.

This is a hard, mechanical merge blocker: `tsc -b` cannot succeed. Per the contract ("define its types in `@flighthq/types` first, then implement against them"), the header commit is the missing half of this change. **The integration must land the `Device.ts` expansion before this delta is mergeable.** Until then the prior review's claim "Types-first in `@flighthq/types` ✓ — all shapes in `Device.ts`" is false against this head.

### 2. `device` now depends on a rejected package. (BLOCKER for "final shape")

`b2824e3d8:packages/device/package.json:30` adds `"@flighthq/device-formats": "*"` and `b2824e3d8:packages/device/src/device.ts:1` imports from it:

```ts
import { parseUserAgentFormFactor, parseUserAgentOsName, parseUserAgentOsVersion } from '@flighthq/device-formats';
```

`structural-forks.md:22` (the plurality guard, bedrock for the triad) names this exact split as a rejection: _"`device-formats`/`platform-formats` failed exactly this: they split a subject with no plurality."_ The upstream-library oracle (`structural-forks.md:23`) confirms it: _"No library for 'UA-parsing split by consumer' → not a subject."_ A UA string is not a `-format`, and there is exactly one of it — so the `-formats` suffix is misnamed (fork E, honest-naming gate, `structural-forks.md:57`). The blessed resolution is to collapse UA parsing into a single shared `useragent` value-leaf consumed by the web backends of both `device` and `platform`.

The base did not have this dependency edge; the delta introduces it. Merging it ships a package the register exists to prevent and bakes a `device → device-formats` edge that the `useragent` collapse will then have to unwind. This is a cross-package design fork — it requires the user's bless (see the brief's open questions), but the merge gate position is: do not land the delta in its current `-formats`-dependent shape.

## Non-blocking findings (grounded, within-delta)

### 3. Cross-boundary regex duplication — `detectDesktopUa`.

`b2824e3d8:packages/device/src/device.ts:285-287` adds:

```ts
function detectDesktopUa(ua: string): boolean {
  return /win(?:dows)?nt|macintosh|mac os x|linux(?!.*android)|cros|x11/i.test(ua);
}
```

This re-implements the desktop branch that `parseUserAgentFormFactor` already owns in the sibling package (`b2824e3d8:packages/device-formats/src/userAgentParse.ts:40`): `/win(?:dows)?nt|macintosh|mac os x|linux(?!.*android)|x11/i`. Two copies of the same desktop-UA pattern split across the package boundary — a `useragent` home collapses both. Introduced by this delta (base had only `detectWebOsName`). Cleanup, entangled with finding 2.

### 4. `refreshDeviceInfo` casts past its own backend type.

`b2824e3d8:packages/device/src/device.ts:266-270` duck-types an optional `refresh()` via `backend as unknown as { refresh?: () => void }` because `DeviceBackend` does not declare `refresh`. This is a deliberate, honestly-commented optional-method seam (so backends needn't implement an unused method), and it is sound in isolation. Minor: once the header is landed, prefer declaring `refresh?(): void` on `DeviceBackend` so the cast disappears. Not a blocker.

## What is genuinely good in the delta (for the rebuild)

These survive the rejection and should be preserved when the change is re-landed correctly:

- **Sentinel discipline is complete and honest.** Every web-unknowable field resolves to `'' / -1 / false / []` (`device.ts:128-161`); `getId` and `readWebGpuInfo` try/catch to a sentinel rather than throw (`device.ts:110-120`, `:299-313`).
- **`out`-param + `create*` quartet hygiene** across all four shapes; reads return `out` (`device.ts:14-71`, `:231-258`).
- **`enableWebSafeAreaInsets` returns a `dispose`** that detaches the `ResizeObserver` and removes the probe element (`device.ts:216-220`) — correct `dispose*` verb (release-to-GC, no native resource freed).
- **No top-level side effects**; `sideEffects: false` honored; web backend lazily built in `getDeviceBackend` (`device.ts:224-227`).
- **Single root `.` export**; `index.ts` is `export * from './device'`.

The runtime is the right target. The problem is the merge state around it: a missing header commit and a rejected dependency edge.

## Contract & docs fit (delta)

- **Types-first ✗ (this delta).** The implementation landed without its `@flighthq/types` header — the contract's stated order is reversed and the result does not compile. This is the single most important correction to the prior review, which scored types-first a pass.
- **Naming ✓.** Exported names are full and unabbreviated (`getDeviceDisplayMetrics`, `createDeviceCapabilities`); `get*`/`has*`/`is*`/`enable*`/`refresh*` verbs are correct; `getDeviceId` correctly omits the `out`-param shape (returns a primitive).
- **Tree-shaking ✓ (intent).** `sideEffects: false`, lazy backend, single barrel. Cannot be confirmed by `npm run size` here (static bundle), but no eager registration or shared hot-loop branch is introduced.
- **Registry vs closed union — n/a.** No `kind` switch family is added; UA parsing is a flat function set.
- **Subject triad / plurality guard ✗.** The delta creates `-formats` cells with no format plurality (finding 2) — the precise mis-split the guard forbids.
- **Tests ✓ (shape), ✗ (will not run).** `device.test.ts` is colocated, alphabetized, mirrors exports, and uses the constructors and the fake-backend pattern. But it imports the absent `DeviceFormFactor*` constants, so it cannot typecheck or run against this head.

## Rust mirror

No `flighthq-device` crate built; expected for a leaf this early. Recorded, not faulted. Note: if/when built, it mirrors whichever shape the `useragent` collapse settles on — another reason to resolve finding 2 before the crate is cut.
