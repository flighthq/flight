---
package: '@flighthq/resources'
status: partial
score: 58
updated: 2026-06-25
ingested:
  - status.md
  - source
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
---

# resources — Review (merge gate: integration-b2824e3d8 → origin/main)

> Merge-gate survey. Baseline = the **approved** `origin/main` (`eb73c3d74`) at `incoming/integration-b2824e3d8/base/packages/resources/` — not under review. Candidate = the integration head at `incoming/integration-b2824e3d8/head/packages/resources/`. This review judges only the **delta** (head vs base), with the `packages/resources/` hunks of `incoming/integration-b2824e3d8/changes.patch`. Findings cite `b2824e3d8:<path>`.
>
> The score is a merge-readiness score for the **delta**, not a re-grade of the mature base. The base is `solid ~82`; the delta as-shipped is **blocked** by a header/implementation split that does not typecheck, which is why this merge-gate review reads `partial / 58` until that single defect is fixed.

## Verdict

**REVISE — do not merge as-is.** The delta's _intent_ is clean and mostly exemplary: a consistent `AbortSignal` threading across the image/video/tileset loaders, a casing fix (`*FromURLs` → `*FromUrls`), two byte-size accessors, six atlas-region helpers (`getTextureAtlasRegionById`/`ByName`/`Sequence`/`Uv` plus the `name`/trim/rotation fields), and tileset `margin`/`spacing`. Every new function is type-word-complete, `get*`-prefixed, out-param-correct, sentinel-correct, and colocated-tested. If the types landed, this would be an approve-as-is delta worth ~88.

It does **not** land the types. The implementation and tests in `b2824e3d8` write and read new fields on `TextureAtlasRegion` and `Tileset` (`name`, `originalWidth/Height`, `rotated`, `sourceX/Y`, `trimmed`, `margin`, `spacing`) that **were never added to `@flighthq/types`** in this bundle. The head copies of `TextureAtlasRegion.ts` and `Tileset.ts` are byte-identical to base. The result is internally inconsistent and does not typecheck. This is a hard merge-blocker (Contract: types-first; Standard 6/7).

## The blocker, grounded

`@flighthq/types` was **not** updated. `head/packages/types/src/TextureAtlasRegion.ts` and `head/packages/types/src/Tileset.ts` are identical to base — interface `TextureAtlasRegion` still has only `{height,id,pivotX,pivotY,x,y,width}`; `Tileset` still has only `{atlas,columns,rows,tileHeight,tileWidth}`. But the resources delta introduces consumers of the absent fields at multiple independent sites:

- `b2824e3d8:packages/resources/src/textureAtlasRegion.ts` — `createTextureAtlasRegion(obj?: Partial<TextureAtlasRegionLike>)` reads `obj?.name`, `obj?.originalHeight`, `obj?.originalWidth`, `obj?.rotated`, `obj?.sourceX`, `obj?.sourceY`, `obj?.trimmed`. `TextureAtlasRegionLike = EntityWithoutRuntime<TextureAtlasRegion>` has none of these → reading them off `Partial<…>` is `TS2339 Property … does not exist`.
- Same file — `getTextureAtlasRegionByName` / `getTextureAtlasRegionSequence` read `region.name` on a value typed `TextureAtlasRegion`: `if (region.name === name) return region;` and `region.name !== null && region.name.startsWith(prefix)` → `TS2339`.
- `b2824e3d8:packages/resources/src/tileset.ts` — `buildTilesetRegions` destructures the absent fields: `const { atlas, rows, columns, tileWidth, tileHeight, margin, spacing } = target;` where `target: Tileset`; and `createTileset` reads `obj?.margin`, `obj?.spacing` → `TS2339`.
- `b2824e3d8:packages/resources/src/textureAtlasRegion.test.ts` — the new specs assert on the absent fields: `expect(region.name).toBeNull()`, `expect(region.originalWidth).toBeNull()`, `expect(region.rotated).toBe(false)`, `expect(region.sourceX).toStrictEqual(0)`, `expect(region.trimmed).toBe(false)`. `tsc -b` typechecks `src/*.test.ts`, so these are compile errors, not just runtime expectations.
- `b2824e3d8:packages/resources/src/tileset.test.ts` — `expect(tileset.margin).toStrictEqual(0)`, `expect(tileset.spacing).toStrictEqual(0)` → `TS2339`.

The status log itself flags the risk: `head/.../resources/status.md` carries the worker's pass-1 claim that these fields were "added in pass 1" to `@flighthq/types` — but that claim is **as-claimed, not review-verified**, and the head tree contradicts it. The types edit is simply missing from this bundle. (I read a static bundle and cannot run `tsc`; the diagnosis is the unambiguous consequence of the strict-mode type rules, with five independent error sites cited above.)

## Standards scorecard (delta only)

1. **Composition / bedrock — PASS.** The new helpers are bedrock primitives (id/name/sequence lookup, UV-into-`out`, byte-size). No config-gated branch fuses subjects; `getTextureAtlasByteSize` is a one-line composition of `getImageResourceByteSize` (`b2824e3d8:packages/resources/src/textureAtlas.ts`). `margin`/`spacing` fold into the existing grid formula, not a new branch.
2. **Naming — PASS.** `getImageResourceByteSize`, `getTextureAtlasByteSize`, `getTextureAtlasRegionById/ByName/Sequence/Uv` carry the full type word and `get*`. The `*FromURLs → *FromUrls` rename (`audioResourceFrom.ts`, `videoResourceFrom.ts`, `fontFrom.ts`, `fontResourceFrom.ts`) fixes a casing split with `*FromUrl` — the right call.
3. **Tree-shaking / bundle invariant — PASS.** No new top-level side effects; `index.ts` is unchanged `export *`; the `textureAtlas.ts → imageResource.ts` import is within-package and tree-shakes. `AbortSignal` is threaded as an optional trailing param — no new hot-loop cost to non-abort callers.
4. **Registry vs closed union — N/A.** No `kind` switch touched; the atlas-format registry lives in the `resource-formats` neighbor, out of this delta.
5. **Subject triad + plurality guard — N/A for the delta.** No format/backend code moves here. (The standing dissolution direction is a charter question, routed to Open directions, not a delta defect.)
6. **Contract hygiene — FAIL.** Types-first is violated: the implementation precedes its own header. This is the blocker. Sub-points that _do_ pass: `getTextureAtlasRegionUv` (`b2824e3d8:packages/resources/src/textureAtlasRegion.ts`) is exemplary — reads `rx/ry/rw/rh` into locals before writing `out`, documents alias-safety, zero-fills on non-positive dims (sentinel, not throw), takes `Readonly<TextureAtlasRegion>`, returns `out`. The loaders return rejected promises / honor `signal.reason` correctly (`videoResourceFrom.ts`, `imageResourceFrom.ts`).
7. **Tests & honesty — FAIL (consequential).** The tests are well-shaped, alphabetized, and mirror the new exports 1:1 (`getTextureAtlasRegionById/ByName/Sequence/Uv` each get a `describe`; abort cases added for image/video). But they assert on fields the type does not declare, so they do not compile — and the `status.md` "added to `@flighthq/types`" claim is false against the head tree. The honesty gap is the missing types edit, not the tests themselves.

## What is genuinely good in the delta (approve once unblocked)

- **`AbortSignal` threading** is consistent and correct end-to-end: `loadImageResourceFromUrl` guards with `signal?.throwIfAborted()` then races `img.decode()` against an `abort` rejection (`b2824e3d8:packages/resources/src/imageResourceFrom.ts`); `loadVideoResourceFromUrl` adds an `onAbort` that clears `element.src` and rejects with `signal!.reason`, with a `cleanup()` that removes every listener (`b2824e3d8:packages/resources/src/videoResourceFrom.ts`); the `loadTilesetFrom*` / `loadTextureAtlasFrom*` wrappers thread `signal` through to the image loader.
- **`getTextureAtlasRegionUv`** is a model out-param function (see Standard 6).
- **`margin`/`spacing` grid math** in `createTilesetFromAtlas` correctly guards `tileWidth > 0` / `tileHeight > 0` before the new `Math.floor((image.width - margin*2 + spacing)/(tileWidth+spacing))` divisor, avoiding a divide-by-zero the base did not have to consider (`b2824e3d8:packages/resources/src/tilesetFrom.ts`).

## Cross-package note (not a delta defect, surfaced for the charter)

The Rust mirror is out of sync in the same direction: `head/crates/flighthq-types/src/resource.rs` `TextureAtlasRegion`/`Tileset` structs also lack `name`/`rotated`/`trimmed`/`source_*`/`original_*` and `margin`/`spacing`. Conformance-map drift, owned by the Rust worktree — recorded here, not actionable in this package's merge.

## Charter alignment

The delta advances charter North-Star #3 (types-first, atlas-region API) and Open Directions 4 (`getTextureAtlasRegionSequence` name-prefix sequence) and 5 (per-tile-ish region metadata) — the _features_ are wanted. It fails the same North-Star #3's actual rule (the header is the design surface, implemented against, not after). Fixing the types makes the delta charter-aligned.
