# Depth Review: @flighthq/displayobject

**Domain**: The OpenFL/Flash-style display object tree — the concrete, composited 2D node types (bitmaps, the stage, video, embedded HTML/render surfaces) plus the base `DisplayObject` / `DisplayContainer` entity from which all renderable 2D nodes derive.

**Verdict**: partial — **52/100**

The package is a clean, correct, idiomatic implementation of _exactly_ the slice it owns, but that slice is much narrower than its package description ("bitmaps, shapes, text, masks, blend modes") advertises. Most of the canonical display-object domain has been intentionally relocated to sibling packages (`@flighthq/node`, `@flighthq/shape`, `@flighthq/text`, `@flighthq/sprite`, `@flighthq/clip`), which is the right architecture for a tree-shakable SDK but leaves _this_ package, taken alone, as a small set of entity constructors rather than an authoritative display-list library. Within its own narrowed scope it is solid; against the full domain its description names, it is partial.

## Present capabilities

Source is seven entity files plus a small `internal.ts`. Each type follows the same disciplined entity/runtime quartet (`create*`, `create*Data`, `create*Runtime`, `get*Runtime`, `compute*LocalBoundsRectangle`):

- **Base `DisplayObject`** (`displayObject.ts`): `createDisplayObject`, the generic factory `createDisplayObjectGeneric<R>` that wires the five shared traits (Transform2D, BoundsRectangle, Appearance, Material, Clip) onto a node, `createDisplayObjectRuntime`, `getDisplayObjectRuntime`, the `isDisplayObject` traits-key type guard, and `setDisplayObjectClip` (the masking setter that invalidates appearance). This is the real spine of the package.
- **`DisplayContainer`** (`displayContainer.ts`): a thin runtime variant over the base — no container-specific logic of its own (hierarchy ops are delegated; see Gaps).
- **`Bitmap`** (`bitmap.ts`): `BitmapData` with `image`, `smoothing`, `sourceRectangle`; `setBitmapImage` with correct content/bounds invalidation; bounds derive from `sourceRectangle` or the image dimensions.
- **`Stage`** (`stage.ts`): `StageData` (color, stageWidth/Height), `setStageSize`, `getDisplayObjectStage` (root lookup), and an opt-in `StageSignals` group (`onResize`, `onFullscreenChanged`, `onOrientationChanged`) enabled via `enableStageSignals` — correctly gated, nullable-by-default, side-effect-free.
- **`Video`** (`video.ts`): `VideoData` (source, smoothing) with bounds from `videoWidth/Height`.
- **`RenderView`** (`renderView.ts`): an embedded render-target surface node with a pluggable `renderer` and explicit `setRenderViewSize`.
- **`HtmlView`** (`htmlView.ts`): an embedded `HTMLElement` node with `setHtmlViewSize`.

Quality signals are strong: every file has a colocated `*.test.ts`, all functions are `out`-param / allocation-explicit per the house rules, traits are composed rather than hand-rolled, invalidation is precise (content vs bounds vs appearance), and the only `internal.ts` cast is a tiny nullable-children/parent/stage view rather than a sprawling internal surface. `"sideEffects": false` holds — no top-level registration.

## Gaps vs an authoritative display-object library

An authoritative Flash/OpenFL `DisplayObject` library (the bar the description's "bitmaps, shapes, text, masks, blend modes" implies) is expected to provide the full display-list surface. Measured against that, the following are absent _from this package_. Most are **missing-by-design** (delegated to a sibling and reachable via `@flighthq/sdk`), which is legitimate; a few are genuine omissions.

Missing-by-design (delegated — correct for the architecture, but means this package alone is not the domain library):

- **Hierarchy / display-list management** — `addChild`, `removeChild`, `addChildAt`, `setChildIndex`, `swapChildren`, `getChildByName`, `contains`, `numChildren`. All live in `@flighthq/node` (`addNodeChild`, `swapNodeChildren`, …). `DisplayContainer` here adds nothing of its own; the container _behavior_ is entirely in `node`.
- **Transforms** — `x`/`y`/`scale`/`rotation`/`skew`/`matrix`, local↔global conversion, world matrix. In `@flighthq/node` (`getNodeWorldTransformMatrix`, `convertNodeVector2*`).
- **Bounds** — `getBounds`/`getRect`/local-to-target bounds. The `HasBoundsRectangle` machinery and `computeLocalBoundsRectangle` plumbing are in `@flighthq/node`; this package only supplies the per-kind leaf computers.
- **Shapes / vector graphics** — `@flighthq/shape` (the description's "shapes" is not here at all).
- **Text display objects** — `@flighthq/text`.
- **Sprite / interactive container / tilemap** — `@flighthq/sprite`.
- **Masking** — `setDisplayObjectClip` exists here, but the `ClipRegion` primitive and its producers live in `@flighthq/types` / `@flighthq/clip`.
- **Blend modes, color transform, filters, alpha/visible** — Appearance + Material traits are attached here but defined/operated on in `@flighthq/node` / `@flighthq/materials` / `@flighthq/filters`. The description's "blend modes" is a trait, not package code.
- **Hit testing / interaction** — `@flighthq/interaction` (`hitTestDisplayObjects`).
- **Rendering** — all `draw*`/`prepare*`/`render*` are in `@flighthq/render*`.

Plausible genuine omissions worth flagging (would belong in this package or be surfaced as cross-package suggestions):

- **`MorphShape` / `SimpleButton`** — canonical OpenFL display kinds with no home; if in scope they are unbuilt.
- **`scrollRect`** as a distinct viewport-clip concept (separate from `clip` masking) — OpenFL exposes both; only the mask form (`clip`) is modeled.
- **`cacheAsBitmap` / `cacheAsBitmapMatrix`** as a display-object property — render caching exists in the renderer packages keyed off the node, but there is no display-object-level cache toggle/entity here. Likely intentional (cache is a render concern) but worth a one-line note in the package.
- **`opaqueBackground`** — a per-display-object property in OpenFL; absent.
- No package-level barrel doc / overview comment establishing that this package is deliberately the "entities only" layer; a reader landing here from the description will expect shapes/text/masks.

## Naming / API-shape notes

- Naming is exemplary and fully consistent with the house style: full unabbreviated type words (`computeBitmapLocalBoundsRectangle`, `getDisplayObjectStage`), the entity/runtime quartet per type, `set*Size`/`set*Image` mutators with correct invalidation, and `enable*Signals` opt-in.
- `createDisplayObjectGeneric` is the right factory shape (kind + data factory + runtime factory), and `isDisplayObject` keying off `DisplayObjectTraitsKey` is the correct traits-based guard.
- `video.ts` has a stray second `import type { MethodsOf }` at the bottom of the file instead of in the top import block — minor style nit, should be consolidated.
- The **package `description` is misleading**: "bitmaps, shapes, text, masks, blend modes" describes the _domain_, but shapes and text are separate packages and masks/blend modes are traits. The description should reflect what this package actually owns (the base display object + bitmap / stage / video / render-view / html-view entities) to avoid implying depth that lives elsewhere.

## Recommendation

Keep the architecture — splitting hierarchy/transform/bounds into `@flighthq/node` and shapes/text/sprite into their own packages is the correct tree-shakable design and is _not_ a depth defect. Treat this as the "concrete 2D leaf entities + base display object" cell and judge it on that.

Concrete actions:

1. **Fix the package description** so it stops advertising shapes/text/masks/blend-modes as contents; describe the actual entity set. This is the single biggest cause of an "authoritative-library" expectation mismatch.
2. **Decide and document the home for the remaining canonical kinds** — `SimpleButton`, `MorphShape`, `scrollRect`, `opaqueBackground`, `cacheAsBitmap` as a display-object property. If in scope, add them here; if a render/interaction concern, note the delegation. These are the only true completeness gaps for the slice this package owns.
3. **Consolidate the trailing `import type` in `video.ts`.**

With the description corrected and the handful of OpenFL leaf kinds (`SimpleButton` especially) resolved, this package is a solid, authoritative _entity layer_ for its slice — but as a standalone "display object library" it remains partial because the bulk of the domain it names is, by deliberate design, elsewhere.
