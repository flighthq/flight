---
package: '@flighthq/displayobject'
crate: flighthq-displayobject
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

# displayobject — Charter

## What it is

`@flighthq/displayobject` is the **concrete 2D leaf entity layer** — the OpenFL/Flash-style display-object types built as plain entity/runtime quartets. It owns the base `DisplayObject` / `DisplayContainer` from which every renderable 2D node derives, plus the composited leaf surfaces: `Bitmap`, `Stage`, `Video`, `Loader`, `RenderView`, and `HtmlView`. Each kind follows the `create*` / `create*Data` / `create*Runtime` / `get*Runtime` shape, exposes guarded-and-invalidating setters over its data fields, and opts into signals via `enable*`.

Where it **ends** and a neighbor begins is the package's defining edge, and the source comment is explicit about it: hierarchy / display-list mechanics and transforms/bounds live in `@flighthq/node`; vector shapes in `@flighthq/shape`; text display objects in `@flighthq/text`; sprite/tilemap in `@flighthq/sprite`; clip-region producers in `@flighthq/clip`; filters/effects in `@flighthq/filters`; hit testing in `@flighthq/interaction`; and the actual drawing in `@flighthq/render` plus the `displayobject-<backend>` leaves. This package holds the **entities and their source data**, not their graph participation or their rendering.

## North star (proposed)

_Inferred from the design and the structural forks; edit freely. These describe what "good" looks like for this package — they are proposals, not blessed rulings._

1. **Pure entity/runtime quartets, no hidden behavior.** Every kind is `create*` / `create*Data` / `create*Runtime` / `get*Runtime`, with data fields exposed through guarded setters that compare, short-circuit on equality, and invalidate the narrowest correct dimension (local content / local bounds / appearance). Nothing renders, allocates, or fires off-frame that the caller did not invoke.
2. **This package is the data, not the participation.** It owns the leaf entities and their fields; hierarchy, transforms, bounds, clipping, and rendering belong to neighbors. Setters mutate-and-mark; they do not reach across the graph or into a backend.
3. **`@flighthq/types`-first.** Every cross-package type (`Loader`, `Stage*` enums, `HasCacheAsBitmap`, the lifecycle/loader signal payloads) is defined in the header layer and imported here, never declared inline.
4. **Correct teardown and opt-in cost.** `dispose*` detaches and releases to GC (nothing here owns a GPU/native resource to `destroy*`); signal groups cost nothing until an `enable*` is called.
5. **OpenFL feature parity, Flight API shape.** Aim to cover the display-object surface OpenFL/Lime offer (the full `Stage` field set, `Loader`, the compositing hints) while expressing each as plain data + free functions rather than stateful runtime objects.

## Boundaries (proposed)

_In scope vs. non-goals, drawn from the review and the neighbor map. Proposals — confirm or redraw._

**In scope (proposed):**

- The base `DisplayObject` / `DisplayContainer` entity and trait-init sequence.
- The composited leaf surfaces: `Bitmap`, `Stage`, `Video`, `Loader`, `RenderView`, `HtmlView`.
- Compositing-hint _data_: `cacheAsBitmap`(`Matrix`), `scrollRect`, `opaqueBackground`, `clip`, `material` — as settable fields that invalidate, regardless of which backend later honors them.
- Stage-locating helpers and the lifecycle/loader signal _definitions_ + `enable*` opt-ins.

**Non-goals (proposed):**

- Hierarchy / display-list mechanics, transforms, and bounds math — `@flighthq/node`.
- Vector shapes (`Shape`/`MorphShape`), sprite/tilemap, and text display objects — `@flighthq/shape`, `@flighthq/sprite`, `@flighthq/text`.
- Clip-region production and hit testing — `@flighthq/clip`, `@flighthq/interaction`.
- All rendering — including _honoring_ the compositing hints this package merely declares — which lives in `@flighthq/render` and the `displayobject-<backend>` leaves.

## Decisions

None blessed yet.

## Open directions

_Every candidate question the review surfaced, plus the structural forks that touch this package. An agent **asks** here rather than assuming._

1. **Where does the boundary with neighbor entity packages fall?** `Shape`/`Sprite` live elsewhere; `SimpleButton` is deferred to `@flighthq/interaction` (state-swap) and `MorphShape` to `@flighthq/shape`. Does `displayobject` own _only_ the base entity + leaf surfaces, or should it host button/morph entity _shells_ whose behavior lives in neighbors? **(Structural fork A — source-data vs. graph participation.)**

2. **Should declared traits ship before a renderer honors them?** `cacheAsBitmap`/`scrollRect`/ `opaqueBackground` are settable and invalidate today, but no backend reads them — setting them is a silent visual no-op. Is "data field lands here, behavior lands in a `displayobject-<backend>` pass" the blessed sequencing, or should a trait wait until at least one backend honors it? This is the central judgement for scoring the package honestly.

3. **Who emits lifecycle signals, and how is the `node` → `displayobject` hook shaped?** The four signals (`onAdded`/`onAddedToStage`/`onRemoved`/`onRemovedFromStage`) are constructible but emitted nowhere; the originating event fires in `@flighthq/node`'s `addNodeChild`/`removeNodeChild`. A callback slot on `NodeRuntime`, a registry the hierarchy invokes, or display-object-specific emission inside the hierarchy calls? A cross-package design fork that blocks the feature.

4. **Is a URL-driven `Loader` convenience in scope?** OpenFL's `Loader.load(URLRequest)` is decomposed into "build a `ResourceLoader`, wire it, start it." Is that verbose decomposition the deliberate golden path, or should a `loadLoaderFromUrl`-style opt-in convenience exist? The "wraps, not extends" lean points at the former but never states it as a boundary.

5. **Should `setLoaderResourceLoader` own slot lifecycle?** It connects four slots on the new loader but does not disconnect the _previous_ loader's slots on replace. Is wire-once the contract (making the re-wire a documented misuse precondition) or should replace disconnect-then-reconnect (making the current behavior a leak to fix)?

6. **Is `Stage` a privileged graph root or just another `DisplayObject`?** `getDisplayObjectStageDepth` and the `internal.ts` `stage` slot encode stage-specific hierarchy semantics. Should the charter bless `Stage` as a distinguished root kind, or treat it as an ordinary `DisplayObject` that happens to sit at the top?

7. **`fullScreenWidth`/`fullScreenHeight` have no setter** — documented as renderer-set, breaking the "every `stage.ts` data field has a guarded setter" pattern. Is the renderer-only mutation path intentional, or should these gain a first-class setter for symmetry?

8. **Legacy `internal.ts` cast.** `DisplayObjectInternal` is exactly the "do not extend; prefer runtime slots" pattern the codebase map calls out. Inherited debt — should it be migrated to runtime slots, and if so on what schedule?

9. **Stale `@flighthq/textlayout` dependency.** Declared in `package.json` with zero `src/` references. Confirm it is droppable (a sweep-safe hygiene fix) rather than a planned-but-unwired dependency.

10. **Admin-doc drift to settle alongside direction.** The Package Map line in `tools/agents/docs/index.md` still reads "bitmaps, shapes, containers, masks, stages, and videos" — but this package has **no shapes and no masks** and _does_ have `Loader`/`RenderView`/`HtmlView`. And the deferral of `scrollRect`/`opaqueBackground`/`cacheAsBitmap`/clip honoring now belongs to the landed `displayobject-canvas`/`displayobject-dom` leaves, not the pre-reorg `render-canvas`/`render-dom`/`render-webgl` names. Worth correcting when direction is set.

11. **Wasm-mixing posture (structural fork D).** This package carries runtime/graph identity, so it is expected to be **all-or-nothing** rather than a value-typed `-rs` mixable leaf. Confirm that framing so a later agent does not propose a `displayobject-rs` drop-in.
