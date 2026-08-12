---
package: '@flighthq/scene2d'
updated: 2026-08-08
by: principal
---

# scene2d — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/scene2d/src/` on 2026-08-08. The package is small and
mostly clean — the source is `displayContainer`, `displayObject`, `displayObjectAnimation`, `htmlView`,
`scene2d`, `sceneKindUsage`, `sprite`, and nothing else.

- **Two of the three `Scene2DSignals` are allocated but never emitted.** `createScene2DSignals` builds
  `onFullscreenChanged` and `onOrientationChanged` (`scene2d.ts:39-40`); no `emitSignal` for either
  exists anywhere in `packages/`. Only `onResize` fires, from `setScene2DSize`. A
  caller who connects to the other two gets silence, not a sentinel. Both are also on
  `ApplicationWindow`, where `@flighthq/application` does emit them — so the open question is whether
  Scene2D should mirror them at all, or read the window's.
- **Three manifest dependencies are test-only.** `@flighthq/geometry`, `@flighthq/materials`, and
  `@flighthq/adjustments` are declared in `package.json` `dependencies` and in `tsconfig.json`
  `references`, but no non-test module imports them: geometry appears only in `htmlView.test.ts` /
  `sprite.test.ts`, materials only in `sceneKindUsage.test.ts:1`, adjustments only in
  `displayObject.test.ts:1`.
- **The package description names a surface this package no longer owns.** `package.json` reads
  "Display object tree for composited 2D rendering: bitmaps, shapes, text, masks, blend modes". Bitmap
  is gone (Texture-backed `Sprite` replaced it), shapes live in `@flighthq/shape`, text in
  `@flighthq/text`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The whole 2026-06-24 inventory checked out
  **false**: `Loader`, `Stage`, `Bitmap`, `Video`, and `RenderView` are not in `src/` at all, and the
  headline deferral — "`cacheAsBitmap`, `scrollRect` and `opaqueBackground` are set on the entity but no
  renderer reads them" — is gone in both directions, since `cacheAsBitmap`/`HasCacheAsBitmap`,
  `scrollRect`, and `opaqueBackground` have zero occurrences anywhere in `packages/`. The
  `DisplayObjectLifecycleSignals` group whose emission was "deferred pending a cross-package hook" does
  not exist either; the surviving un-emitted signals are the two Scene2D ones above.
- **2026-08-05** — Post-review reconciliation: package re-centered on containers, scenes, sprites, HTML
  views and render targets; Texture now owns sampler policy and UV cropping, and its revisions drive
  sprite invalidation (`sprite.ts` `isSpriteRendererDirty`).
- **2026-08-02** — MorphShape resolved out of this package: it is a distinct kind in `@flighthq/shape`,
  and scene2d contributes only its generic Node2D factory.
- **2026-06-25** — Dropped the stale `@flighthq/textlayout` dependency from the manifest and tsconfig.
- **2026-06-24** — Second builder pass over the then-current Bitmap/Stage/Loader surface; superseded in
  full by the split above.
