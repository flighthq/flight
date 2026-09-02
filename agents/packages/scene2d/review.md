---
package: '@flighthq/scene2d'
status: solid
score: 80
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md (2026-08-25)
  - review.md (2026-08-25, superseded -- multiple claims did not match source)
  - source # live packages/scene2d/src + colocated tests
  - types # @flighthq/types Scene2D, Node2D, Sprite, HtmlView, DisplayObject
---

# scene2d -- Review

## Verdict

**solid -- 80/100.** The package is a small, focused entity layer with clean architecture. It provides the base Node2D factory, three concrete 2D entity kinds (DisplayObject, Sprite, HtmlView), the Scene2D presentation context, animation clip application, and a kind-usage census. Every entity matches the `create*` / `create*Runtime` / `get*Runtime` quartet pattern. Types are defined in `@flighthq/types`. The two export lanes (`.` public, `./contract` full) are correctly shaped. `sideEffects: false` holds. The surface is thin but charter-aligned: nothing the charter's Decisions dropped has reappeared, and the code that exists is well-structured.

**Correction of the 2026-08-25 review:** The prior review described seven entity kinds (DisplayObject, DisplayObject, Bitmap, Stage, Video, HtmlView, RenderView) and a "color-adjustments runtime-slot API." This was false against the source tree then and remains false now. The package has never contained Bitmap, Stage (as a distinct entity), Video, or RenderView source files in its current shape. Color adjustment functions (`addNodeColorAdjustment`, `setNodeColorAdjustments`, `setNodeColorAdjustmentsTint`, `getNodeColorAdjustments`) are exported by `@flighthq/node`, not by this package. The scene2d tests import them from `@flighthq/node/contract` for testing convenience, but scene2d does not re-export them. The prior review also claimed `setBitmapImage`, `setVideoSource`, and `setVideoSmoothing` as existing setters -- none exist anywhere in this package. This review is written entirely from the live source.

The score (80) matches the prior review's number but rests on corrected grounds: a genuinely clean but narrow surface, not the inflated capability list the prior verdict assumed.

## Present capabilities

Grounded in `packages/scene2d/src/` (7 source files, 7 test files, 86 test cases).

- **Base entity factory (`displayObject.ts`).** `createNode2D` composes the trait-init sequence (transform2D, boundsRectangle, appearance, blendMode, material, clip) via `@flighthq/node` init helpers. `createNode2DRuntime` stamps `Node2DTraitsKey` and initializes the `scene2d` back-pointer to `null`. `isNode2D` discriminates by traits key. `setNode2DClip` sets the clip region and invalidates appearance (unconditionally -- no equality guard). `getNode2DRuntime` returns the runtime. Re-exports `createDisplayObject` from `displayContainer.ts` for import convenience.

- **DisplayObject (`displayContainer.ts`).** The concrete generic container kind, using `DisplayObjectKind`. `createDisplayObject` delegates to `createNode2D` with `DisplayObjectKind` and the default runtime. `createDisplayObjectRuntime` and `getDisplayObjectRuntime` complete the quartet. Lightweight -- no custom data fields.

- **Sprite (`sprite.ts`).** Texture-backed leaf kind. `SpriteData` carries a `Texture | null`; bounds derive from texture dimensions scaled by `uvScale`. The runtime tracks `localBoundsTexture` / `localBoundsTextureVersion` to drive `isLocalBoundsRectangleValid`, which causes bounds to refresh after bare `sprite.data.texture = newTexture` assignment without requiring invalidation. `isSpriteRendererDirty` detects texture identity/version changes for the render walk. `createSpriteRendererData` stamps per-state identity for each renderer. `cloneSprite` shares the texture through a fresh entity. No sprite-specific setter exists -- texture assignment is the API (identity-compared, invalidation-free by design).

- **HtmlView (`htmlView.ts`).** DOM-element-embedding entity. `HtmlViewData` carries `element`, `width`, `height`. `setHtmlViewSize` guards on equality before writing and invalidates local bounds. `computeHtmlViewLocalBoundsRectangle` reads dimensions from data. Full quartet.

- **Scene2D (`scene2d.ts`).** Presentation-context Entity (not a Node -- cannot be nested). Owns a display-object `root` (allocated at creation), the fit context (`align: ViewportAlign`, `scaleMode: ViewportScaleMode`), logical dimensions (`scene2dWidth`, `scene2dHeight`), and background `color`. The root's runtime carries a `scene2d` back-pointer; `getScene2DRoot` resolves scene membership by walking to the root and reading it. `setScene2DSize` guards on equality and emits `onResize` when signals are enabled. `enableScene2DSignals` / `getScene2DSignals` implement the opt-in signal pattern. Runtime is lazily allocated on first access.

- **Animation clip application (`displayObjectAnimation.ts`).** `applyAnimationClipToNode2D` samples a bound `AnimationClip` at a given time and applies channels to Node2D targets. Handles Position, Rotation, Scale, Skew, Pivot (and scalar variants), Alpha, Visible. Each path invalidates the appropriate dimension (transform or appearance). Ignores foreign target refs. Uses a module-scoped scratch array to avoid per-sample allocation.

- **Kind-usage census (`sceneKindUsage.ts`).** `getScene2DKindUsage` walks a Scene2D tree and reports every distinct node kind, non-Normal blend mode, material kind, and shape command key present. Deduped, sorted, reusable (caller allocates the record with `createScene2DKindUsage`). Detects shape command streams structurally (any node whose `data` carries a `commands` array) rather than by kind, so it works with future shape kinds. Linear scan dedup keeps it C-portable.

- **Export lane discipline.** Public lane (`index.ts`): 18 functions. Contract lane (`contract.ts`): ~33 functions via wildcard re-exports. Runtime-factory and data-factory functions are contract-only, as expected. `createScene2DKindUsage` and `getScene2DKindUsage` were promoted to the public lane in commit `21b29587a`.

## Gaps

All verified against the current source tree.

- **Two test-only production dependencies.** `@flighthq/adjustments` and `@flighthq/materials` are declared in `package.json` `dependencies` but imported only in test files (`displayObject.test.ts` and `sceneKindUsage.test.ts`). They belong in `devDependencies`. The same class of issue as the `@flighthq/geometry` dependency that was correctly moved to devDependencies (commit `66a8dff55`). The corresponding `tsconfig.json` `references` entries are needed for the test build but the manifest distinction matters for tree-shaking consumers.

- **Package description is still inaccurate.** `package.json` reads "Display object tree for composited 2D rendering: bitmaps, containers, stages, videos, html views, render views." The package has no bitmaps (those are Sprites with Textures), no stages (renamed to Scene2D), no videos, and no render views. An accurate description would name sprites, display objects, html views, and scenes.

- **Two Scene2DSignals with no producer.** `createScene2DSignals` constructs `onFullscreenChanged` and `onOrientationChanged`, but no code in this package or the repository emits either. Only `setScene2DSize` emits `onResize`. The charter Decision moved fullscreen/display-state ownership to `@flighthq/application`, so the emitter is either an application integration or the signals should migrate there. A caller who connects to these signals gets silence.

- **`setNode2DClip` does not guard on equality.** `setHtmlViewSize` and `setScene2DSize` both short-circuit when the new value matches the current value. `setNode2DClip` unconditionally assigns and invalidates. For a reference-typed field where re-set-same-reference is rare, this may be acceptable by policy, but the inconsistency within the package is visible.

- **Kept Stage geometry is partially unimplemented.** The charter Decision (2026-06-25) says Stage keeps `scaleMode`, `align`, `contentsScaleFactor`, and fullscreen dims. Scene2D carries `align` and `scaleMode` (present since the Stage-to-Scene2D rename, commit `e8a93c62c`), but `contentsScaleFactor` and fullscreen dimensions are absent from both the `Scene2D` type and the implementation. The prior review incorrectly claimed that `align` and `scaleMode` were missing; they have been present since creation.

- **Charter prose carries stale references.** North star #3 cites `HasCacheAsBitmap` (dropped by Decision). North star #5 references "the complete Stage field set" and `Loader` (both dropped). Boundaries "In scope" lists `Loader`, `Video`, `RenderView`, and compositing-hint data. The Decisions section itself notes the draft is stale, but a fresh agent reading the charter top-down could re-derive dropped features from the North star prose.

## Charter contradictions

- **Decision vs. code: `contentsScaleFactor` and fullscreen dims are absent.** The Decision blesses these as kept Stage geometry but they are not on the Scene2D type or in the implementation. This is the one substantive gap between what the charter's Decisions bless and what the code delivers.
- **North star #1 partially violated** by `setNode2DClip`'s unconditional invalidation -- minor and mechanical.
- **Charter body carries pre-Decision prose** (North star #3/#5, Boundaries) that names entities the Decisions section explicitly dropped. A charter cleanup pass should reconcile the draft prose with the settled Decisions.

Nothing dropped-on-sight has reappeared: no `cacheAsBitmap`, no `scrollRect`, no `opaqueBackground`, no `Loader`, no lifecycle signals, no `pixelSnapping`. The drop discipline held.

## Contract & docs fit

- **(a) Contract:** strong. Types-first: all interfaces and type aliases live in `@flighthq/types` (Scene2D, Node2D, Sprite, HtmlView, DisplayObject and their runtimes/data, Scene2DSignals, Scene2DKindUsage, ViewportAlign, ViewportScaleMode). Free functions, explicit allocation (`create*`), explicit dependency (no module-scoped mutable state except the animation scratch array, which is allocation-avoidance). `Readonly<T>` used on function parameters. Sentinel `null` returns for scene membership lookup. Side-effect-free imports. The `as unknown as` cast in `createNode2D` for the runtime factory has a comment explaining the constraint. Sprite's `isSpriteRendererDirty` correctly updates its stamp after reading, so a second call returns false.

- **(b) Docs:** the `package.json` description names surfaces the package does not own (bitmaps, stages, videos, render views) and omits the actual entities (sprites, scenes). The Package Map in AGENTS.md lists `scene2d` in the "Scene graph" group, which is accurate at the domain level. The status.md (2026-08-08) is accurate about what is and is not in the source. The prior `review.md` (2026-08-25) contained multiple false claims about the package contents and is superseded by this review.

## Candidate open directions

1. **Move `@flighthq/adjustments` and `@flighthq/materials` to devDependencies.** Same fix class as the already-landed geometry move. Sweep-safe, no cross-package coupling.

2. **Correct the `package.json` description.** Replace "bitmaps, containers, stages, videos, html views, render views" with an accurate listing: "sprites, display objects, html views, scenes, and the Node2D base factory."

3. **Emit or relocate `onFullscreenChanged` / `onOrientationChanged`.** The charter Decision placed fullscreen/display-state in `@flighthq/application`. Either the signals migrate there (where the emitter lives) or an application integration emits them on Scene2D. Cross-package decision.

4. **Re-land `contentsScaleFactor` and fullscreen dimensions** on the Scene2D type and implementation. Blessed by the charter Decision but parked by the no-unhonored-data lean (do not ship fields no backend reads). Requires at least one consuming backend pass, making it a cross-package item.

5. **Settle the setter-guard rule for reference-typed fields.** Is `setNode2DClip`'s unconditional invalidation intentional (re-set-same-clip is rare and identity comparison is cheap but not always meaningful for mutable clip regions), or should North star #1's guard rule be absolute? A one-line ruling settles the inconsistency.

6. **Charter prose cleanup** -- reconcile North star #3/#5 and Boundaries with the settled Decisions. The charter is the user's file; queue for the next direction pass.
