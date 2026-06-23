---
id: displayobject
title: '@flighthq/displayobject'
type: depth
target: displayobject
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/displayobject.md
  - tools/agents/docs/reviews/depth/displayobject.md
depends_on: []
updated: 2026-06-23
---

## Summary

partial — 52/100: a clean, idiomatic entity layer (base `DisplayObject` + `DisplayContainer`, `Bitmap`, `Stage`, `Video`, `RenderView`, `HtmlView`) that is solid within its narrowed slice but far short of the authoritative display-list library its description ("bitmaps, shapes, text, masks, blend modes") implies.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable, honest version: fix the lie in the description, wire the stage attributes already declared in the header, and add the per-object display-list properties OpenFL apps reach for first.

- **Correct the package `description`** to name what the package actually owns (base display object + `Bitmap` / `Stage` / `Video` / `RenderView` / `HtmlView` entities), removing "shapes, text, masks, blend modes" which are delegated/trait concerns. Single biggest cause of the expectation mismatch.
- **Consolidate the trailing `import type { MethodsOf }` in `video.ts`** into the top import block (style nit flagged in the depth review).
- **Add a package-level overview comment** in `index.ts` (or a one-line module doc on `displayObject.ts`) stating this is deliberately the "entities-only" layer and pointing readers to `@flighthq/node` (hierarchy/transform/bounds), `@flighthq/shape`, `@flighthq/text`, `@flighthq/sprite` for the rest of the domain.
- **Wire the existing Stage attribute types into `StageData` + setters.** The types are already in the header but unused:
  - extend `StageData` with `align: StageAlign`, `scaleMode: StageScaleMode`, `quality: StageQuality`, `displayState: StageDisplayState` (sensible OpenFL defaults: `'topleft'`, `'showall'`, `'high'`, `'normal'`).
  - add `setStageAlign(source, value)`, `setStageScaleMode(source, value)`, `setStageQuality(source, value)`, `setStageDisplayState(source, value)` with correct invalidation (scale/align → bounds layout; quality → appearance; displayState → emit `onFullscreenChanged` when crossing fullscreen).
  - have `createStageData` accept and default these.
- **`scrollRect` as a per-display-object property**, distinct from `clip` masking (OpenFL exposes both). Define `HasScrollRect { scrollRect: Rectangle | null }` (or fold into the display-object data) in `@flighthq/types` first, then `setDisplayObjectScrollRect(source, rect | null)` here with bounds + content invalidation. Document that the renderer interprets it as a viewport clip + origin offset.
- **`opaqueBackground` as a per-display-object property.** Add `opaqueBackground: number | null` (packed RGBA) to the display-object data/trait in `@flighthq/types`, plus `setDisplayObjectOpaqueBackground(source, color | null)` with appearance invalidation.
- **`createBitmapDataFromImage(image, smoothing?)`** convenience constructor — the single most common bitmap creation path, currently forcing callers through the generic partial.

### Silver

Competitive and solid: the canonical OpenFL leaf kinds that have no home, a real `cacheAsBitmap` toggle as a display-object concern, and the consistency/edge-case coverage a well-regarded display-list library is expected to have.

- **`SimpleButton`** — the canonical OpenFL interactive leaf kind, currently unbuilt with no home. Define `SimpleButton`, `SimpleButtonData` (`upState`, `overState`, `downState`, `hitTestState: DisplayObject | null`, `enabled: boolean`, `useHandCursor: boolean`), `SimpleButtonRuntime`, and `SimpleButtonKind = 'SimpleButton'` in `@flighthq/types`; implement `createSimpleButton`, `createSimpleButtonData`, `createSimpleButtonRuntime`, `getSimpleButtonRuntime`, `setSimpleButtonState(source, state)` and `computeSimpleButtonLocalBoundsRectangle`. State transitions are data; the active-child swap is driven by `@flighthq/interaction` (cross-package wiring — see Sequencing).
- **`MorphShape`** — the OpenFL morph/interpolated-shape leaf kind. Define `MorphShape`/`MorphShapeData` (`startShape`, `endShape`, `ratio: number`) + `MorphShapeKind` in `@flighthq/types`; `createMorphShape`, `setMorphShapeRatio(source, ratio)` with content invalidation. The interpolation of fill/path data is a `@flighthq/shape` concern this leaf references — surface the boundary as a design decision.
- **`cacheAsBitmap` / `cacheAsBitmapMatrix` as display-object properties.** Render caching already exists in the renderer packages keyed off the node; add the _display-object-level toggle_ here: `cacheAsBitmap: boolean` + `cacheAsBitmapMatrix: Matrix | null` on the display-object data/trait (defined in `@flighthq/types`), with `setDisplayObjectCacheAsBitmap(source, enabled)` / `setDisplayObjectCacheAsBitmapMatrix(source, matrix | null)` that flip a render-cache hint slot on the runtime. The renderer reads the hint; this package owns the user-facing switch.
- **`Bitmap` pixel-snapping and `pixelSnapping` attribute** (`'auto' | 'always' | 'never'`) on `BitmapData` — common professional requirement for crisp bitmaps; type in `@flighthq/types`, `setBitmapPixelSnapping` here.
- **`Bitmap.smoothing` and `sourceRectangle` setters** for symmetry: `setBitmapSmoothing(source, value)` (appearance invalidation) and `setBitmapSourceRectangle(source, rect | null)` (bounds + content invalidation). Currently only `setBitmapImage` exists; the others force direct data mutation that skips invalidation.
- **`Video` setters** `setVideoSource(source, value)` (bounds + content invalidation) and `setVideoSmoothing(source, value)` for the same symmetry/invalidation-correctness reason.
- **Display-object signal group** via `enableDisplayObjectSignals(source)` for entity-level lifecycle/appearance changes (e.g. `onAdded`, `onRemoved`, `onAddedToStage`, `onRemovedFromStage`) — the `DisplayObjectInteractionSignals` type already exists in the header; define the non-interaction lifecycle group alongside it, gated and nullable-by-default like `enableStageSignals`. Hierarchy add/remove events are the OpenFL `Event.ADDED_TO_STAGE` family and belong on the entity that owns stage attachment.
- **`getDisplayObjectStage` companions:** `isDisplayObjectOnStage(source): boolean` and `getDisplayObjectStageDepth(source): number` for the common "am I attached / how deep" queries without re-walking via `node`.
- **Cross-backend consistency tests** (functional, not just jsdom unit) for `scrollRect`, `opaqueBackground`, `cacheAsBitmap`, and bitmap `smoothing`/`pixelSnapping` across Canvas/DOM/WebGL — these are exactly the properties that drift between backends.

### Gold

Authoritative / AAA: exhaustive OpenFL leaf-kind coverage, the full stage attribute surface, performance and error-handling discipline, complete docs, and 1:1 Rust-port parity.

- **`Loader` display object** as the canonical OpenFL loadable-content node (`Loader` wrapping a `LoaderInfo`-style descriptor) if in scope — define in `@flighthq/types`, implement the entity here, delegate the actual byte/resource loading to `@flighthq/loader`/`@flighthq/resources` via a pluggable seam, not inline.
- **Complete Stage surface to OpenFL parity:** `stageFocusRect`, `tabChildren`/`mouseChildren` toggles, `fullScreenWidth`/`fullScreenHeight`/`fullScreenSourceRect` accessors, `contentsScaleFactor`, `frameRate`, `showDefaultContextMenu`, `wmodeGPU`/`color` interplay — each as data + `set*`/`get*` with correct invalidation and signal emission, and each documented as "renderer/host honors X". Stage-host-coupled attributes route through the existing `@flighthq/application` window/`@flighthq/screen` seams rather than reimplementing.
- **Full per-display-object property surface for parity:** `name` lookup integration (`getDisplayObjectByName` walking children), `mask` vs `clip` reconciliation note, `filters` attachment helper (data list only; application stays in `@flighthq/filters`), `transform.pixelBounds`, `loaderInfo` accessor where applicable. Each defined in `@flighthq/types` first.
- **`opaqueBackground` + `scrollRect` + `cacheAsBitmap` interaction matrix** fully specified and tested: scrollRect within a cached bitmap, opaqueBackground under a blend mode, cacheAsBitmapMatrix with rotation/scale — the edge cases a reference library must get right and document.
- **Performance:** pooled scratch `Rectangle`s in the `compute*LocalBoundsRectangle` hot paths (via `@flighthq/geometry` `acquire*`/`release*`), zero-allocation invalidation paths, and a documented allocation contract per `create*`/`set*` function.
- **Error-handling discipline pass:** every setter returns/no-ops on no-change (already partial), sentinels (`null`/`false`/`-1`) for all lookups (`getDisplayObjectStage`, name lookup, button hit-state), and `throw` reserved strictly for misuse (e.g. attaching a non-display kind). Documented per function.
- **Exhaustive test coverage:** colocated unit tests for every new export (enforced by `npm run exports:check`), `out`-aliasing tests for all `compute*` bounds functions, functional render baselines for every new visible leaf kind (`SimpleButton`, `MorphShape`, `Loader`) across Canvas/DOM/WebGL, and API-symmetry pass via `npm run api`.
- **Package overview doc** (`tools/agents/docs/` reference page or expanded module doc) enumerating every leaf kind, its data fields, its invalidation semantics, and the delegation map to sibling packages — the navigable "what lives here vs elsewhere" reference.
- **1:1 Rust-port parity:** mirror as `flighthq-displayobject` crate — `create_display_object`, `create_bitmap`, `create_stage`, `set_stage_align`, `set_display_object_scroll_rect`, `create_simple_button`, `create_morph_shape`, etc., over the slotmap `NodeArena`, `KindId` registry, and `&mut … out` convention. All new leaf kinds and stage attributes recorded in the conformance map; the rasterized leaf kinds (`Bitmap`, `MorphShape`, `SimpleButton` states) validated against the `displayobject-skia` deterministic reference per the conformance gate. Entity/runtime split is all-or-nothing (graph-coupled), so this is not a "mixable" leaf — it ports as part of the full Rust runtime.

## Sequencing & effort

Recommended order, with dependencies and cross-package/design items called out.

1. **Bronze, low-effort first (no new types, hours):** description fix, `video.ts` import consolidation, `index.ts` overview comment, `createBitmapDataFromImage`. Pure local cleanup; do these before anything structural.
2. **Bronze stage wiring (low effort, types already exist):** add the four stage attributes to `StageData` + setters. Zero new type files — `StageAlign`/`StageScaleMode`/`StageQuality`/`StageDisplayState` are already in `@flighthq/types`. Run `npm run exports:check` and `npm run order:fix` after.
3. **Bronze `scrollRect` + `opaqueBackground` (medium):** **types-first** — add the trait/data fields to `@flighthq/types` (`HasScrollRect`, display-object data extension), then implement setters here. Renderer interpretation of both is a **cross-package item to surface**: the `@flighthq/render*` packages must read `scrollRect` (viewport clip + offset) and `opaqueBackground` (pre-fill). Flag to the user that this roadmap adds the property surface; the render-side honoring is a coordinated change.
4. **Silver bitmap/video/stage setter symmetry (low):** straightforward, improves invalidation correctness; do early as it's cheap and unblocks consistent testing.
5. **Silver `cacheAsBitmap` toggle (medium):** types-first for the display-object fields; the runtime hint slot couples to the existing render-cache in `@flighthq/render*` — **design decision to surface:** confirm the hint-slot contract (this package owns the toggle, renderer owns the cache) before implementing.
6. **Silver `SimpleButton` (medium-high):** types-first. The state-swap behavior depends on `@flighthq/interaction` (pointer over/down/up driving the active child) and rendering of the active state on `@flighthq/render*`. **Cross-package design decision:** does `SimpleButton` live here as a pure entity with interaction wiring in `@flighthq/interaction`, or does it need a thin behavior helper? Surface before building.
7. **Silver `MorphShape` (medium-high):** types-first. Depends on `@flighthq/shape` for start/end shape interpolation — **surface as a cross-package decision:** the ratio-driven path/fill interpolation almost certainly belongs in `@flighthq/shape`, with this package owning only the leaf entity + ratio setter.
8. **Silver lifecycle signal group (medium):** depends on hierarchy add/remove notifications from `@flighthq/node`. `DisplayObjectInteractionSignals` already exists; the non-interaction lifecycle group is new — define in `@flighthq/types`. Confirm whether added/removed dispatch hooks already exist in `node` or need adding there (**cross-package**).
9. **Gold items** are the genuine frontier and should follow only after Bronze+Silver land and the render-side honoring of scrollRect/opaqueBackground/cacheAsBitmap is in place. `Loader` (step before other Gold work, since it gates `@flighthq/loader` integration), full stage surface, performance pooling pass, exhaustive tests, and the Rust mirror last (the Rust port should mirror a settled TS surface, not chase a moving one).

**Cross-package / design-decision items to surface to the user (do not act on autonomously):**

- Render-side honoring of `scrollRect`, `opaqueBackground`, `cacheAsBitmap` in `@flighthq/render*`.
- Home for `SimpleButton` state-swap behavior (`@flighthq/interaction` vs here).
- Home for `MorphShape` interpolation math (`@flighthq/shape`).
- Whether hierarchy add/removed-to-stage dispatch hooks belong in `@flighthq/node` to feed the new lifecycle signal group.
- Scope confirmation for `Loader` (entity here, loading in `@flighthq/loader`).

**Effort summary:** Bronze ≈ small (most is wiring existing header types + description/cleanup). Silver ≈ medium-high (three new leaf kinds, each types-first with a cross-package boundary to settle). Gold ≈ large (frontier coverage + performance + full test/doc + Rust parity).

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/displayobject` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
