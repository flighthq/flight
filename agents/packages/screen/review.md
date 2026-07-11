---
package: '@flighthq/screen'
status: partial
score: 42
updated: 2026-07-09
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - status.md
  - source
  - charter.md
---

# Review: @flighthq/screen — merge gate (integration-b2824e3d8 vs approved origin/main)

This is a **merge-gate** review of the incoming change only: `head/packages/screen/` against the **approved** `base/packages/screen/` (`origin/main` `eb73c3d74`), plus the `packages/screen/` hunks of `changes.patch`. The baseline is the blessed floor and is not under review. The question is narrow: **is this delta fit to merge into the approved baseline as the final shape?**

The score (35) is a merge-fitness score for the _delta_, not a maturity score for the feature. The feature design, in isolation, is strong — the prior `builder-67dc46d64` pass aimed at a 93/100 Gold surface. But the integration branch landed only **half** of that work: the screen package `src/` advanced to the 25-field / signals / multi-monitor implementation, while the `@flighthq/types` half it depends on did **not** land. As integrated, the package does not type-check. A non-compiling delta cannot pass a merge gate regardless of design quality.

## Verdict: REJECT (does not build as integrated)

## The blocking finding — the type seam the implementation depends on is missing from the merge

`head/packages/screen/src/screen.ts` imports six Screen-domain types from `@flighthq/types`:

```ts
// b2824e3d8:packages/screen/src/screen.ts:2-13
import type {
  RectangleLike,
  ScreenBackend,
  ScreenChangedMetrics,
  ScreenChangeEvent,
  ScreenColorSpace,
  ScreenInfo,
  ScreenMode,
  ScreenOrientation,
  ScreenSignals,
  Vector2Like,
} from '@flighthq/types';
```

Of these, **only** `ScreenBackend`, `ScreenInfo` (9-field), `RectangleLike`, and `Vector2Like` exist in the integration head's `@flighthq/types`. The other six — `ScreenChangedMetrics`, `ScreenChangeEvent`, `ScreenColorSpace`, `ScreenMode`, `ScreenOrientation`, `ScreenSignals` — and the enabling `ScreenChangeKind` / `ScreenTouchSupport` aliases **do not exist anywhere in head's types**. Grounding:

- `head/packages/types/src/Screen.ts` is **byte-identical** to `base/packages/types/src/Screen.ts`: a 9-field `ScreenInfo` (`id,x,y,width,height,workWidth,workHeight,scaleFactor,isPrimary`) and a 3-method `ScreenBackend` whose `subscribe(listener: () => void)` takes a **bare** callback — no event payload.
- `head/packages/types/src/index.ts:223` still exports only `./Screen` (identical to base line 220); there is **no** `ScreenSignals` module and no other Screen type module.
- `changes.patch` touches `packages/types/.../{FontMetrics,GlyphExtents,Notification,RenderViewport2D,ShapedRun,SpritesheetFormat,TextShaper,index}.ts` — and **not** `Screen.ts`, and creates **no** `ScreenSignals.ts`. The only `screen` hunks in the patch are `packages/screen/{package.json,src/screen.test.ts,src/screen.ts,tsconfig.json}`.

Consequences that block the merge:

1. **`screen.ts` does not type-check.** The six imported types are unresolved; `createScreenInfo()` (b2824e3d8:screen.ts:34-62) sets 16 fields (`rotation`, `orientation`, `refreshRate`, `colorDepth`, `pixelDepth`, `physicalWidth/Height`, `isHdr`, `colorSpace`, `maxLuminance`, `depthPerComponent`, `dpi`, `label`, `internal`, `touchSupport`, `monochrome`) that the base `ScreenInfo` does not declare; the backend's `subscribe` now calls `listener({ kind: 'ScreenAdded', screen, changedMetrics: null })` (b2824e3d8:screen.ts:298) against a base `subscribe(listener: () => void)` contract that passes no argument.
2. **`screen.test.ts` does not type-check either.** Its first line imports `ScreenChangeEvent`, `ScreenMode`, `ScreenSignals` from `@flighthq/types` (`b2824e3d8:packages/screen/src/screen.test.ts:1`) — all absent. `tsc -b` typechecks `src/*.test.ts`, so this is a second independent compile failure.
3. **`package.json` adds `@flighthq/signals` as a dependency** (the one added line in `b2824e3d8:packages/screen/package.json`, `"@flighthq/signals": "*"`) for a signals group whose payload type (`ScreenSignals`) does not exist in the merge. The dependency is correct _for the intended design_; it is dangling in _this_ integration.

This is not a base-quality objection and not a pre-release-latitude question (no back-compat is at issue). It is a straightforward **split-merge**: the implementation half of one feature was integrated without its type-seam half. The contract rule "define its types in `@flighthq/types` first, then implement against them" was honored in the originating work but **inverted by the merge** — the implementation arrived, the header did not.

## Standards scorecard (delta only)

| # | Standard | Verdict | Grounding |
| --- | --- | --- | --- |
| 1 | Composition / bedrock | PASS (contingent) | The web backend is two parallel populators (`buildCurrentScreenInfo` / `buildScreenInfoFromDetailed`, b2824e3d8:screen.ts:144-214), not one config-gated mega-function. Converters/lookups are value-typed leaves. No decomposition smell introduced. |
| 2 | Naming clarity | PASS | New exports are fully type-qualified and self-identifying: `getScreenContainingRect`, `dipToScreenPoint`, `attachScreenSignals`, `getScreenCursorPosition`. `get*`/`is*`/`has*` honored. |
| 3 | Tree-shaking / bundle invariant | PASS | `package.json` keeps `"sideEffects": false` and the single `.` export; `src/index.ts` stays `export * from './screen'`. No top-level side effects; `_backend` is lazily created in `getScreenBackend`. |
| 4 | Registry vs closed union | PASS | The only `kind` dispatch is `attachScreenSignals`'s fixed 3-way branch over `ScreenChangeKind` (b2824e3d8:screen.ts:21-27) — a closed, exhaustive fan-out, not a growing family. Correct to keep closed. |
| 5 | Subject triad + plurality guard | PASS | No format/backend mis-homing. The native host adapter correctly lives in `host-*`, not here; only the web default ships in-package. |
| 6 | Contract hygiene | **FAIL** | Types-first **violated by the merge**: `screen.ts` implements against six `@flighthq/types` exports that are absent (see blocking finding). Sentinels / `Readonly<>` / alias-safety are correct _in the source as written_ (e.g. `dipToScreenPoint` reads inputs into locals before writing, b2824e3d8:screen.ts:381-385), but the package cannot satisfy the contract when its header layer is missing. |
| 7 | Tests & honesty | **FAIL (compile)** | Structurally excellent — 30 exports, 30 alphabetized `describe` blocks, an exact 1:1 mirror, every export tested. But the file imports absent types and cannot compile. Also: divider comments `// --- attachScreenSignals ---` etc. (b2824e3d8:screen.test.ts:86) violate the "avoid structural divider comments" source-style rule. The status.md claims "57 tests... all passing" — false as integrated, since the suite does not compile. |

## Secondary delta observations (not the blocker, real all the same)

- **`getScreenContainingRect` and `getScreenNearestRect` share one body** — `getScreenNearestRect` is `return getScreenContainingRect(rect, out)` (b2824e3d8:screen.ts:600-602): two exported names, identical largest-overlap / nearest-center semantics. A new-in-delta API-shape redundancy. It is a _design fork_ the charter already routes to Open directions (keep as intent-revealing aliases / give distinct semantics / collapse), **not** a merge blocker — but it should not be frozen as the final shape without a ruling.
- **Late-subscribe + upgrade ordering.** `subscribe` captures `const detailsRef = _screenDetails` at subscription time (b2824e3d8:screen.ts:331-337), so a consumer who calls `onScreenChange` _before_ `requestScreenDetails()` never receives post-upgrade `screenschange` events. The status.md documents this as a known edge case. A behavior decision for the charter, not a build blocker.
- **Test divider comments** (above) are a cheap source-style cleanup the integration worker should apply while fixing the build.

## Honesty check against status.md

The ingested `status.md` (as-claimed, builder-67dc46d64) describes a 93/100 surface and states the type seam landed in `@flighthq/types/src/Screen.ts` plus a new `ScreenSignals.ts`. **In this integration branch that claim does not hold** — those type files were not part of the merge. The status entry is "as-claimed, not yet review-verified" by its own header; this review verifies it and finds the type half **absent from the delta**. The Rust-compile-unverified caveat in status.md remains true and is the lesser of the two confidence gaps; the missing TS types are the larger.

## What "fit to merge" would require

The delta becomes mergeable the moment its type-seam half is present in the same integration: the expanded 25-field `ScreenInfo`, `ScreenMode`, `ScreenColorSpace`, `ScreenOrientation`, `ScreenChangeKind`, `ScreenChangedMetrics`, `ScreenTouchSupport`, the payload-carrying `ScreenBackend` (`subscribe(listener: (event: Readonly<ScreenChangeEvent>) => void)` + required `getCursorPosition` + optional `getModes`), and the new `ScreenSignals` module — all exported from `@flighthq/types`. With those present and a clean `npm run check`, the design itself reaches the `solid` / near-Gold the prior pass aimed for. As integrated today, it does not build.

## 2026-07-09 — refreshed

getScreenNearestRect given real contains-else-nearest-by-center-distance semantics distinct from getScreenContainingRect (commit bd412dd6). Verified against source; a full re-review is due.
