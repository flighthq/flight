---
package: '@flighthq/render'
status: partial
score: 58
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - changes.patch (packages/render slice)
  - source (head vs base)
  - status.md (as-claimed)
---

# render — Review

> Merge-gate survey. Judges ONLY the **delta** of `@flighthq/render` in the integration bundle (`incoming/integration-b2824e3d8/head/`) against the **approved baseline** `origin/main` (`eb73c3d74`, `…/base/`). The baseline is the blessed floor and is **not** reviewed. Findings cite `b2824e3d8:<path>`. The score scores the _incoming change_, not the package's lifetime maturity.

## What actually landed (scope reconciliation)

The `status.md` and the draft `charter.md` in this bundle describe a large two-pass effort — a shared draw driver (`drawRenderProxy`/`flushRenderBatch`/`registerRenderBatchFlush`/`submitRenderProxy`), a retained sortable `RenderQueue`, a blend save/restore stack, a stats snapshot, and 2D viewport culling, plus a cross-backend parity suite. **None of that is in this delta.** Diffing `base/packages/render/src` against `head/packages/render/src` and the `packages/render/` slice of `changes.patch`, the entire incoming change is three files:

- `b2824e3d8:packages/render/src/renderViewport.ts` (new, 58 lines)
- `b2824e3d8:packages/render/src/renderViewport.test.ts` (new, 104 lines)
- `b2824e3d8:packages/render/src/index.ts` — one added line: `export * from './renderViewport';`

There is no `renderDriver.ts`, `renderQueue.ts`, or `renderBlendState.ts` in either `base` or `head`. The status log is therefore **as-claimed and contradicted by the merged artifact**: the review below judges the viewport file alone, and flags the doc/delta mismatch as an honesty finding.

## Verdict

**partial — 58/100, REVISE before merge.** The delta is a small, self-contained, tree-shakable 2D viewport-culling primitive with a clean export shape, alphabetized exports/tests, and correct sentinel/`out`-param/`Readonly<>` form. It would be a clean low-risk merge — except its core function lies about what it computes. `computeRenderProxyWorldBounds` is named and documented as a **world-space bounding box** but writes the source's _local_ `x`/`y` with a hardcoded zero size, never consulting the real world-bounds path (`getNodeWorldBoundsRectangle`) that already exists in `@flighthq/node` and that the charter explicitly names for this exact culling concern. The tests only exercise the degenerate at-origin/zero-size cases, so they confirm the stub rather than the contract. As shipped, `isRenderableInViewport` mis-culls any object with real geometry or a non-identity ancestor transform. Two smaller delta nits compound it: a doc/code contradiction on edge inclusivity, and an entity-typed `Rectangle` built from a bare literal cast instead of `createRectangle`.

## Axis-by-axis (delta only)

### 1. Composition / bedrock — PASS

The file is a small composition: a trait sniff, a bounds writer, a constructor, an overlap test, and a proxy-dispatch wrapper. No config-gated branches, no fused subjects. `isRenderProxyInViewport` correctly delegates to `isRenderableInViewport(proxy.source, …)` (`b2824e3d8:packages/render/src/renderViewport.ts:52-54`) rather than duplicating the math. Decomposition is at the right grain.

### 2. Naming clarity — FAIL (semantic, not lexical)

Lexically the names are full and self-identifying (`computeRenderProxyWorldBounds`, `createRenderViewport2D`, `isRenderableInViewport`, `isRenderProxyInViewport`). But the most important name is **untrue to its behavior**: `computeRenderProxyWorldBounds` promises world-space bounds and delivers a local-position point.

```ts
// b2824e3d8:packages/render/src/renderViewport.ts:14-22
export function computeRenderProxyWorldBounds(out: Rectangle, source: unknown): boolean {
  if (!hasTransform2D(source)) return false;
  const s = source as HasTransform2D;
  out.x = s.x;
  out.y = s.y;
  out.width = 0;
  out.height = 0;
  return true;
}
```

`s.x`/`s.y` are the node's **local** transform fields (`HasTransform2D` carries `x, y, pivotX, scaleX, rotation, …`), not a world AABB. The package already has the canonical accessor — `getNodeWorldBoundsRectangle(target: Spatial2DNode): Readonly<Rectangle>` in `@flighthq/node` (`boundsRectangle.ts:137`) — which returns the actual world bounds rectangle. A name that means "world bounds" must compute world bounds; either rename it to what it does or, better, make it compute real bounds.

### 3. Tree-shaking / bundle invariant — PASS

Pure free functions, no new dependency, no eager registration, no module-top side effect. The one barrel line is a thin re-export; `package.json` is unchanged and stays `"sideEffects": false`. The module-level `_scratchBounds` is a grow-once scratch consistent with the package's existing scratch pattern, allocated at load with no side effect. No new hot-loop branch or shared `switch` case is imposed on any other importer.

### 4. Registry vs closed union (fork B) — N/A

No `kind`/handler family is introduced or switched over. `hasTransform2D` is a single structural predicate, not a dispatch table.

### 5. Subject triad + plurality guard — PASS

No format codec or backend leaf is mis-homed here; this is core 2D culling math living in the core. Correctly placed.

### 6. Contract hygiene — MIXED

- **`out`-param + sentinel: PASS.** `computeRenderProxyWorldBounds` writes `out` and returns `false` for the no-trait case; `isRenderable*` return `boolean`. No throws on expected failure. Conservative "unknown source → in-viewport" is a defensible sentinel default.
- **`Readonly<>`: PASS.** `viewport: Readonly<RenderViewport2D>` and `proxy: Readonly<RenderProxy2D>` are correctly immutable.
- **Types-first: PASS.** `RenderViewport2D` lives in `@flighthq/types` (`RenderViewport2D.ts`); the implementation imports it.
- **Entity literal cast: FAIL.** `b2824e3d8:packages/render/src/renderViewport.ts:57` —
  ```ts
  const _scratchBounds = { x: 0, y: 0, width: 0, height: 0 } as Rectangle;
  ```
  `Rectangle extends Entity` (`@flighthq/types/Rectangle.ts`) and carries runtime/binding identity beyond its public fields. The source-style rule is explicit: use `createRectangle(...)` over a bare literal for entity-backed types. This scratch should be `createRectangle()`.
- **Trait detection is a brittle duck-type.** `hasTransform2D` sniffs a single field —
  ```ts
  // b2824e3d8:packages/render/src/renderViewport.ts:6-8
  return source !== null && typeof source === 'object' && 'pivotX' in (source as object);
  ```
  Keying spatial-ness off one property name (`pivotX`) is fragile and couples the predicate to a field that could be absent on a future `HasTransform2D` shape or present coincidentally. This disappears entirely if the function resolves bounds through the node's real bounds path instead of hand-rolling field access.

### 7. Tests & honesty — FAIL

- **Order/mirroring: PASS.** Exports are alphabetized (`computeRenderProxyWorldBounds`, `createRenderViewport2D`, `isRenderableInViewport`, `isRenderProxyInViewport`); the `describe` blocks mirror that order.
- **Tests confirm the stub, not the contract: FAIL.** Every assertion uses a fresh `createDisplayObject()` at the origin with zero-size bounds (`b2824e3d8:packages/render/src/renderViewport.test.ts:34-48, 68-82`). No test moves, scales, nests, or parents an object — i.e. no test exercises a case where local `x/y` and the true world AABB diverge. The suite would pass identically whether the function returned real bounds or the current degenerate point, so it provides **zero** coverage of the function's stated purpose. The "returns false … outside the viewport" test (`:75-82`) is satisfied only because the object sits at `(0,0)` and the viewport is far away — it proves the point-vs-rect test, not bounds correctness.
- **Doc/code contradiction (honesty): FAIL.** The header comment claims an asymmetric edge rule —
  ```
  // b2824e3d8:packages/render/src/renderViewport.ts:30-33
  // available, uses an inclusive-left/top, exclusive-right/bottom overlap test so that a zero-size
  // object touching the viewport's top-left corner is considered in-viewport.
  ```
  but the implementation is **inclusive on all four edges**: `!(objMaxX < vpMinX || objMinX > vpMaxX || objMaxY < vpMinY || objMinY > vpMaxY)` (`:47`) uses strict `<`/`>`, so an object exactly at the right/bottom edge (`objMinX === vpMaxX`) is _kept_, not excluded. The comment says exclusive-right/bottom; the code is inclusive-right/bottom. The status.md "design choices" note (inclusive overlap) agrees with the _code_, making the in-file comment the lie.
- **Status/charter overclaim (honesty):** the `status.md` in this bundle attributes a driver, queue, blend stack, parity suite, and stats snapshot to this change; the merged artifact contains none of them. The pre-existing `review.md` (`solid` 86/100) was written against that as-claimed scope. The integration delta does not earn that.

## What the charter says, and where this lands against it

The draft charter's North star — "Contracts and preparation, not pixels," "Types-first," "no hidden per-frame allocation" — this delta honours mechanically (no allocation in the hot test path; type in `@flighthq/types`). But Open direction #8 in the charter already named the live tension this file walks into: viewport culling that "swallows a throw from `getNodeWorldBoundsRectangle` as a conservative 'in-view'." The integration's answer is worse than swallowing the throw — it **never calls** `getNodeWorldBoundsRectangle` at all and substitutes a fabricated zero-size point, so culling is silently wrong rather than conservatively safe. The charter ruling that question (where world-bounds resolution for 2D culling lives, and whether the conservative path is a sentinel-probe or a real bounds read) should be made before this primitive is blessed.

## Bottom line

A merge-ready _shape_ wrapped around a function that does not do what its name and doc claim, with tests that cannot catch the gap. Low blast radius (nothing in `base` consumes it yet — it is a fresh export), so this is REVISE, not REJECT: fix the bounds computation (or honestly rename and re-scope it to "position-only"), reconcile the inclusivity comment, and use `createRectangle`.
