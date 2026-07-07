---
package: '@flighthq/scene-gl'
status: solid
score: 75
updated: 2026-06-25
ingested:
  - status.md
  - source
  - changes.patch
  - charter.md
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# scene-gl — Review

> **Merge-gate review.** Baseline is the **approved** `origin/main` (`eb73c3d74`), carried as `incoming/integration-b2824e3d8/base/packages/scene-gl/`; it is the blessed floor and is **not** under review. The judged subject is the **delta** — `head` vs `base` under `incoming/integration-b2824e3d8/`, plus the `packages/scene-gl/` hunks of `incoming/integration-b2824e3d8/changes.patch`. Findings cite `b2824e3d8:<path>` with a quoted snippet. The package's own North star / Boundaries are still a `draft: true` charter, so the delta is judged against the codebase-map AAA standard and the charter's already-authored "What it is" + Open directions.

## Verdict

`solid — 75/100`. The delta is a well-scoped, honest step on top of an already-strong forward renderer: it adds a **two-pass opaque/blended transparency sort**, moves the draw-entry pools/lists off module-level singletons and onto the **per-state `GlSceneRuntime`**, and lands a **`HAS_UV1` second-UV-set shader path** (occlusion-via-`TEXCOORD_1`) with its `hasGlMeshGeometryUv1` detector. The transparency sort and the per-state isolation are correct and well-tested. The score moves only +1 over the base review because the same delta also introduces two delta-grounded smells that a merge gate should name: a **draw-entry "pool" that never recycles** (it allocates fresh every frame after the first), and a **dead `HAS_UV1` feature path** — the entire uv1 shader branch and its detector are reachable only from tests; no production `bind()` ever sets `hasUv1` true. Neither blocks correctness, but both are exactly the "is this the final shape worth keeping?" question this gate exists to ask. Recommend **merge with the uv1 wiring required** (it is within-package and sweep-safe) and the pool semantics routed to the charter's standing Open direction.

## What the delta changes (head vs base)

Non-test source (six files):

- `drawGlScene.ts` — rewritten from a single in-order draw loop into a **partition → opaque pass → back-to-front-sorted blended pass**. Adds the clip-W depth proxy, `isBlendedMaterial`, `compareBlendedEntriesDescending`, the private `DrawEntry` alias, and the `acquireOpaqueEntry`/`acquireBlendedEntry`/`createDrawEntry` pool helpers. Reads its pools/lists from `getGlSceneRuntime(state)` instead of module-level arrays.
- `glSceneRuntime.ts` — adds the exported `GlSceneDrawEntry` interface (fields typed `object` to keep the header free of scene-gl-internal types) and four new runtime fields: `blendedDrawList`, `blendedPool`, `opaqueDrawList`, `opaquePool`.
- `glMeshUpload.ts` — adds `uv1: 5`, `joints0: 6`, `weights0: 7` to `ATTRIBUTE_LOCATION` (skinning channels reserved) and a new exported `hasGlMeshGeometryUv1(geometry)` detector.
- `glPbrPrelude.ts` — adds the `hasUv1` key bit, the `2` slot in the define string, `#define HAS_UV1`, the `a_uv1`/`v_uv1` vertex+fragment plumbing, and routes the occlusion sample through `v_uv1` under `HAS_UV1`.
- `glPbrStandardBlock.ts` — `buildGlPbrStandardDefineKey` gains a third `hasUv1 = false` parameter.
- `glSceneTestHelper.ts` — fake GL2 gains `BLEND`/`SRC_ALPHA`/`ONE_MINUS_SRC_ALPHA` enums and `blendFunc`, and re-sorts its method table.

Tests: new `drawGlScene` cases (blend enable/disable, opaque-before-blended, back-to-front sort, all-opaque no-blend), new `hasGlMeshGeometryUv1` and `glSceneRuntime` pool-isolation cases, the `glPbrPrelude`/`glPbrStandardBlock` key tests for `hasUv1`, and a **mechanical `SceneLightBlock` literal update across ~16 material-renderer test files** adding `hemisphereCount/pointCount/spotCount: 0` to track an upstream `@flighthq/types` change.

## Delta against the seven standards

### 1. Composition / bedrock — pass (with one smell)

The two-pass draw is a clean composition: partition once, then two independent passes sharing the contiguous-run bind cache. No new config-gated feature branch fuses subjects. The smell is the **duplicate acquire helpers**: `acquireOpaqueEntry` and `acquireBlendedEntry` are byte-identical (`b2824e3d8:packages/scene-gl/src/drawGlScene.ts`):

```ts
function acquireOpaqueEntry(pool: GlSceneDrawEntry[]): GlSceneDrawEntry {
  if (pool.length > 0) return pool.pop()!;
  return createDrawEntry();
}
function acquireBlendedEntry(pool: GlSceneDrawEntry[]): GlSceneDrawEntry {
  if (pool.length > 0) return pool.pop()!;
  return createDrawEntry();
}
```

Two names for one function (the pool argument already carries the opaque/blended distinction). One `acquireDrawEntry(pool)` is the bedrock primitive; the split is blood-from-a-stone.

### 2. Naming clarity — pass

New exports read cleanly with full type words: `hasGlMeshGeometryUv1` (correct `has*` prefix, unabbreviated `MeshGeometry`), `GlSceneDrawEntry`, `isBlendedMaterial`, `compareBlendedEntriesDescending`. The `hasUv1` key bit matches the `uv1`/`TEXCOORD_1` vocabulary. No abbreviation or vague name introduced by the delta.

### 3. Tree-shaking / bundle invariant — pass

No new top-level side effect, no eager registration; `index.ts` stays a thin barrel and the new symbols flow through it. `package.json` `sideEffects: false` is unchanged. The transparency sort is inside `drawGlScene` only — it does not add a branch to a shared hot path every importer pays. The `HAS_UV1` plumbing is `#ifdef`-gated GLSL behind a key bit, so the standard program is byte-for-byte unchanged when `hasUv1` is false (the existing define-key invariant holds; the test asserts the new `-------:-------` / `2` slot).

### 4. Registry vs closed union (fork B) — pass

The delta touches no dispatch family. Material resolution still flows through the per-state `Map<Kind, …>` registry; the new blended/opaque split is a property of the material's `alphaMode`, read by `isBlendedMaterial` via structural duck-typing — not a closed `switch (kind)` (`b2824e3d8:packages/scene-gl/src/drawGlScene.ts`):

```ts
function isBlendedMaterial(material: Readonly<Material>): boolean {
  return (material as Readonly<SurfaceMaterial>).alphaMode === 'blend';
}
```

This is correct: alpha mode is a two-valued partition (blend vs not), the closed form is bedrock, and it does not grow with material kinds.

### 5. Subject triad + plurality guard — pass

No format/backend code is mis-homed by the delta. `glMeshUpload`'s reserved `joints0`/`weights0` locations and the `uv1` set stay in the GL leaf where vertex-attribute binding belongs. Nothing here is a premature split.

### 6. Contract hygiene — pass (with one type-laundering note)

Types stay header-first: every cross-package type (`Material`, `MeshSubset`, `SurfaceMaterial`, `SceneLights`, `GlMeshMaterialRenderer`) is imported from `@flighthq/types`; scene-gl defines only its own `GlSceneDrawEntry`/`DrawEntry`. Out-param aliasing is respected — `setMatrix3NormalFromMatrix4` writes into the shared `scratchNormalMatrix`. No throw is introduced; the skip path (`if (renderer === null) continue`) keeps sentinel semantics. The blend pass restores state deterministically (`gl.disable(gl.BLEND)` after the pass).

One note: `GlSceneDrawEntry`'s `object`-typed fields force the draw path to launder through `as DrawEntry` casts. This is the **sanctioned** runtime-slot pattern (the header stays free of scene-gl-internal types), so it is not a regression — but it does mean the entry's field types are unchecked at the cast boundary, which is how the dead-field bug in §7 slipped in unflagged.

### 7. Tests & honesty — partial (two delta-grounded issues)

The new tests are colocated, alphabetized, and mirror exports; the `drawGlScene` and pool-isolation cases genuinely exercise the new behavior. But the delta ships two honesty gaps:

**(a) The "pool" never recycles.** `glSceneRuntime.ts` introduces `opaquePool`/`blendedPool` and `drawGlScene` `acquire`s from them, but **nothing ever returns an entry to a pool**. Entries are pushed onto the draw lists, which are then cleared by reference (`b2824e3d8:packages/scene-gl/src/drawGlScene.ts`):

```ts
opaqueDrawList.length = 0;
blendedDrawList.length = 0;
```

After frame 1 the pools are empty forever, so every subsequent frame calls `createDrawEntry()` per subset — each allocating two matrices (`normalMatrix: createMatrix4()`, `worldMatrix: createMatrix4()`). There is an `acquire*` with no matching `release*`, which inverts the geometry-ownership rule that reserves those verbs for **paired** brackets. The per-state ownership refactor is correct; the recycling it implies is absent. This is delta-introduced (the pool fields are new in this PR) and the charter already lists "Pool semantics" as an Open direction — so it is a **flag**, not a blocker.

**(b) The `HAS_UV1` path is dead surface.** The delta adds the full second-UV-set feature — `hasGlMeshGeometryUv1`, the `hasUv1` key bit, `#define HAS_UV1`, the `a_uv1`/`v_uv1` plumbing, and the occlusion-via-`v_uv1` route — but **no production code path turns it on**. `standardPbrGlMeshMaterialRenderer.bind()` still calls the two-argument form (`b2824e3d8:packages/scene-gl/src/standardPbrGlMeshMaterialRenderer.ts`):

```ts
buildGlPbrStandardDefineKey(pbr, pbr !== null && pbr.alphaMode === 'mask'),
```

A grep across the head package confirms the only caller of `hasGlMeshGeometryUv1` is its own test, and no production `buildGlPbrStandardDefineKey` call passes the third argument. So the entire uv1 shader feature is reachable only from unit tests; a real scene with a `uv1` attribute and an occlusion map still samples occlusion from `v_uv0`. It is **safe** (an unbound attribute reads zero, and the standard program is unchanged when `hasUv1` is false), but it is an implemented-yet-unwired surface — the merge-gate's "no dead exports / unexported-but-implemented surface" line. The detector exists precisely to close this; it just was not threaded into `bind()`.

**(c) Minor: a dead, mistyped entry field.** `createDrawEntry()` allocates `normalMatrix: createMatrix4()` and the partition loop writes `entry.normalMatrix = worldMatrix; // placeholder; filled per-draw from the mesh` (`b2824e3d8:packages/scene-gl/src/drawGlScene.ts`), but both draw passes recompute the normal matrix into `scratchNormalMatrix` and **never read `entry.normalMatrix`**. The field is also a `Matrix4` where the private `DrawEntry` alias declares it `Readonly<Matrix4>` while the proxy consumes a `Matrix3` — a confusion the `object`-typed header hides. The field is dead and should be removed (or the placeholder honored), not left as a self-described "placeholder."

## Honesty check against `status.md`

The `status.md` entries for this delta (`builder-67dc46d64`, as-claimed) verify against the diff: the two-pass sort, the per-state pool isolation, the `GlSceneDrawEntry` export, the `uv1`/`joints0`/`weights0` locations, and the `hasGlMeshGeometryUv1` helper are all present as described. The status is honest — and it openly records the two soft spots this gate independently found: it calls `hasGlMeshGeometryUv1` a helper that a renderer's `bind()` _can_ pass (acknowledging it is not yet passed), and it does not overstate the pool as recycling. The one status action item — the `mesh-blend-transparency` functional baseline is not yet captured — remains open and is the regression gate the new blended pass needs.

## Delta-introduced vs pre-existing

To keep the gate fair: the **no-`destroy*`** teardown gap, the **single-directional+ambient lighting cap**, IBL/shadow/skinning absence, and transmission-as-placeholder are **pre-existing** in the approved base and are charter Open directions — they are _not_ charged against this delta. The `SceneLightBlock` literal churn across the renderer tests is this delta correctly tracking an upstream `@flighthq/types` multi-light _type_ addition; scene-gl only zero-fills the new counts (it does not consume point/spot/hemisphere yet), which is consistent with the lighting cap being a parked cross-package fork, not a regression.

## Score rationale

Base review scored 74. The delta is net-positive (correct transparency sort, correct per-state isolation, real shader breadth groundwork) but ships one dead feature path and one mis-named pool, both delta-grounded. +1 to **75**: the additions raise the ceiling, the two smells hold it just above the base. Wiring the uv1 path (within-package, already Recommended) and resolving the pool semantics (charter Open direction) are the two moves that would carry it toward `authoritative`.
