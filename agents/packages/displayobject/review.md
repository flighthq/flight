---
package: '@flighthq/displayobject'
status: solid
score: 82
updated: 2026-06-24
ingested:
  - status.md
  - source # incoming/builder-67dc46d64/head/packages/displayobject/src + dist d.ts
  - changes.patch # incoming/builder-67dc46d64/changes.patch
  # reviews/depth/displayobject.md — does not exist (no prior depth review to supersede)
---

# displayobject — Review

## Verdict

**solid — 82/100.** A clean, well-shaped entity layer: every leaf kind (`Bitmap`, `Stage`, `Video`, `Loader`, `RenderView`, `HtmlView`) follows the entity/runtime quartet, setters guard and invalidate correctly, signals are opt-in via `enable*`, and tests are dense (195 claimed; the diff shows substantial new coverage). It falls short of authoritative on two axes: a few classic OpenFL display-object kinds are still absent or deferred to neighbors (`SimpleButton`, `MorphShape`, plain `Shape`/`Sprite` which live elsewhere), and the _behaviors_ the new data fields imply (`cacheAsBitmap`, `scrollRect`, `opaqueBackground`, lifecycle-signal emission) are declared but inert — they are honored by no renderer and emitted by no hierarchy call yet. The status report's score of 88 is slightly generous: it counts declared-but-unwired traits as near-complete.

The status report's claims **check out against the diff**: `loader.ts` is genuinely new, `stage.ts` gained the seven OpenFL fields + setters and the `align: ''` default, `displayObject.ts` gained `cacheAsBitmap`/lifecycle/`getDisplayObjectByName`, and `htmlView`/`renderView` are untouched in the src delta (verified — neither appears in the patch's source hunks). Lifecycle emission is genuinely absent: the four signals are constructed in `createDisplayObjectLifecycleSignals` but no source file emits them (only stage resize/fullscreen and loader forwarding emit at all).

## Present capabilities

Grounded in `<sha>:packages/displayobject/src/`:

- **Base entity (`displayObject.ts`).** `createDisplayObject` / `createDisplayObjectGeneric` compose the trait-init sequence (transform2D, bounds, appearance, cacheAsBitmap, clip, material, opaqueBackground, scrollRect). `createDisplayObjectRuntime` promoted to an `interface` to carry `lifecycleSignals`. `isDisplayObject` via `DisplayObjectTraitsKey`. `getDisplayObjectByName` wraps `findNodeByName`. Compositing-hint setters (`setDisplayObjectCacheAsBitmap[Matrix]`, `setDisplayObjectClip`, `setDisplayObjectOpaqueBackground`, `setDisplayObjectScrollRect`) all guard on equality then `invalidateNodeAppearance`.
- **Stage (`stage.ts`).** Full OpenFL-parity data: `align` (now `''`/center default), `color`, `contentsScaleFactor` (defaults to `devicePixelRatio`), `displayState`, `frameRate`, `fullScreen{Width,Height}`, `mouseChildren`, `quality`, `scaleMode`, `showDefaultContextMenu`, `stageFocusRect`, `stage{Width,Height}`, `tabChildren` — each with a guarded setter. `setStageDisplayState` and `setStageSize` emit `onFullscreenChanged` / `onResize`. Stage-locating helpers `getDisplayObjectStage`, `getDisplayObjectStageDepth`, `isDisplayObjectOnStage`.
- **Bitmap (`bitmap.ts`).** `pixelSnapping`, `smoothing`, `sourceRectangle`, `image`, the `createBitmapDataFromImage` convenience constructor, and a correct invalidation split — image/source changes go to `invalidateNodeLocalContent` + `invalidateNodeLocalBounds`, not appearance.
- **Loader (`loader.ts`, new).** Full quartet + `LoaderSignals`. `setLoaderResourceLoader` forwards a `ResourceLoader`'s `onProgress/onComplete/onError/onCancel` into the loader's own signal group and tracks `loaded`/`total`/`reports`. `setLoaderContent` mounts the loaded root and invalidates bounds. `disposeLoader` correctly uses `dispose*` (detach slots, no resource to free) and `disconnectAllSlots`. `computeLoaderLocalBoundsRectangle` delegates to the content's bounds.
- **Video / HtmlView / RenderView.** Each a complete quartet with a `compute*LocalBoundsRectangle` wired through `defaultMethods`, plus `setVideoSource/Smoothing`, `setHtmlViewSize`, `setRenderViewSize`.
- **DisplayContainer.** Thin runtime-only wrapper over the generic factory.
- **Contract hygiene.** Single root barrel, `sideEffects: false`, no top-level registration, all cross-package types sourced from `@flighthq/types`, `out`-param bounds functions, `Readonly<>` on read paths, sentinel `null` returns (`getDisplayObjectStage`, `get*Signals`, `getDisplayObjectByName`).

## Gaps

What a mature OpenFL-equivalent display-object layer has that this lacks:

- **Declared-but-inert traits.** `cacheAsBitmap`/`cacheAsBitmapMatrix`, `scrollRect`, and `opaqueBackground` are settable and invalidate appearance, but _no renderer reads them_ — setting them is a silent no-op visually. This is the largest gap between the score and reality. (Cross-package to honor; see Contract & docs fit for where that work now lives.)
- **Lifecycle signals never fire.** `onAdded`/`onAddedToStage`/`onRemoved`/`onRemovedFromStage` can be connected but are emitted nowhere. The originating event (parent change / stage entry) fires in `@flighthq/node`'s `addNodeChild`/`removeNodeChild`, so emission needs a cross-package hook. Until then the trait is a constructible group with no producer.
- **Missing classic kinds.** `SimpleButton` (deferred to `@flighthq/interaction` for state-swap) and `MorphShape` (deferred to `@flighthq/shape`) have no presence here. Whether the base `DisplayObject` layer should host _any_ button/morph entity shell, or whether those are wholly neighbor concerns, is unsettled (charter-silent).
- **`Loader` re-wiring leak.** `setLoaderResourceLoader` connects four slots on the new loader but never disconnects the _previous_ loader's slots when replaced. Wire-once is fine; re-wire leaks. The status report flags this honestly; it remains a real defect for the replace path.
- **`fullScreenWidth`/`fullScreenHeight` have no setter** and are documented as renderer-set, leaving a field with no first-class mutation path in-package — a small asymmetry against the "every data field has a guarded setter" pattern the rest of `stage.ts` follows.
- **No `Loader` URL-driven convenience.** OpenFL's `Loader.load(URLRequest)` is reduced to "caller builds a `ResourceLoader`, wires it, calls `startResourceLoad`." That is the correct Flight decomposition, but there is no `loadLoaderFromUrl`-style convenience even as an opt-in, so the common path is verbose. (May be intentional; charter-silent — see open directions.)

## Charter contradictions

**None** — the charter's North star, Boundaries, and Decisions are all still `TODO`, so there is no stated principle for the code to contradict. The "What it is" line (concrete composited 2D node types

- base entity) matches the code exactly. This is a stub-charter case: the absence of contradictions is a measure of the charter's silence, not of the code's alignment. Every judgement below the "What it is" line falls back to the codebase-map AAA standard.

## Contract & docs fit

**(a) How well the package lives up to the contract — strong.**

- `@flighthq/types`-first: every cross-package type (`Loader`, `LoaderData`, `HasCacheAsBitmap`, `DisplayObjectLifecycleSignals`, the `Stage*` enums) is defined in `@flighthq/types`; the package imports them, never declares them inline. ✔
- Naming: full unabbreviated type words throughout (`setDisplayObjectCacheAsBitmapMatrix`, `computeLoaderLocalBoundsRectangle`). `dispose*` vs `destroy*` chosen correctly (`disposeLoader` detaches, frees nothing). `enable*` opt-in for both signal groups. ✔
- `out`-params, `Readonly<>`, sentinel returns, single root export, `sideEffects: false`, no top-level side effects: all hold. ✔
- **Stale dependency.** `package.json` declares `@flighthq/textlayout` but no source file references it (verified: zero `textlayout`/`TextLayout` hits in `src/`). This inflates the install graph and the potential bundle reach for every consumer; it is the kind of dependency-hygiene drift `packages:check` may or may not catch. **Candidate fix:** drop the dependency.
- **Legacy `internal.ts` cast.** `DisplayObjectInternal` (the `Omit<… 'children'|'parent'|'stage'> & writable` cast) is exactly the "legacy `internal.ts` cast — do not extend; prefer runtime slots" pattern the codebase map calls out. It is inherited, not new, but worth noting as a standing debt.

**(b) Where the contract / admin docs are now stale against the work — two real items.**

- **The Package Map line is outdated.** `agents/index.md` still describes `@flighthq/displayobject` as "bitmaps, shapes, containers, masks, stages, and videos." The actual package has **no shapes and no masks** (shapes → `@flighthq/shape`, masks → clip via `@flighthq/clip`), and _does_ have `Loader`, `RenderView`, and `HtmlView` which the line omits. The package's own `index.ts` doc comment is accurate; the map line should be updated to match it. **Candidate revision.**
- **The status report's "deferred to render-canvas/dom/webgl" is mis-homed against the current tree.** The render reorg has landed in the same bundle: `packages/displayobject-canvas`, `packages/displayobject-dom`, and `packages/clip` now exist (confirmed present in `head/packages/`), and the codebase map documents the `displayobject-<backend>` layering. So the honoring of `scrollRect`/`opaqueBackground`/`cacheAsBitmap` and the clip/mask rendering now belong in those `displayobject-<backend>` leaves, **not** in the monolithic `render-canvas`/`render-dom`/ `render-webgl` the status entry names. The deferred-items framing is correct in spirit but points at the pre-reorg package names. This is a status-doc staleness note, not a code defect.

## Candidate open directions

The charter is a stub; each item below is a question the review had to assume an answer to, surfaced for the user to settle into the charter's North star / Boundaries / Decisions / Open directions.

1. **Where does the boundary with neighbor entity packages fall?** `Shape`/`Sprite` live elsewhere, `SimpleButton`/`MorphShape` are deferred to `interaction`/`shape`. Does `displayobject` own _only_ the base entity + leaf surfaces (bitmap/video/html/render/stage/loader), or should it host button/ morph entity shells whose _behavior_ lives in neighbors? (Touches structural fork A: source-data vs graph participation.)
2. **Should declared traits ship before a renderer honors them?** `cacheAsBitmap`/`scrollRect`/ `opaqueBackground` are inert today. Is "data field lands here, behavior lands in a `-backend` pass" the blessed sequencing, or should a trait wait until at least one backend reads it? This is the central judgement for scoring this package honestly.
3. **Who emits lifecycle signals, and how is the `node`→`displayobject` hook shaped?** A callback slot on `NodeRuntime`, a registry the hierarchy calls, or display-object-specific emission inside `addNodeChild`? This is a real cross-package design fork that blocks the lifecycle feature.
4. **Is a URL-driven `Loader` convenience in scope,** or is the verbose "build a `ResourceLoader`, wire it, start it" path the deliberate golden path? The status's "wraps, not extends" decision leans toward the latter but never states it as a boundary.
5. **Should `setLoaderResourceLoader` own slot lifecycle** (disconnect the prior loader on replace), or is wire-once the contract and re-wire a misuse? Settling this turns the leak into either a bug to fix or a documented precondition.
6. **`Stage` as graph root vs. ordinary node.** `getDisplayObjectStageDepth` and the `internal.ts` `stage` slot encode stage-specific hierarchy semantics; the charter should state whether `Stage` is a privileged root kind or just another `DisplayObject` that happens to sit at the top.
