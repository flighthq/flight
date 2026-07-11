---
package: '@flighthq/displayobject'
updated: 2026-06-24
basedOn: ./review.md
---

# displayobject — Assessment

Sorted from `review.md` (solid — 82/100). The prior maturation roadmap `reviews/maturation/depth/displayobject.md` **does not exist** (the review's front matter already records "no prior depth review to supersede"), so there is no Bronze/Silver/Gold seed to absorb — every item below is grounded in the review. The charter is a stub (North star / Boundaries / Decisions all `TODO`), so the larger gaps are design-gated and routed to Open directions rather than Recommended.

## Recommended

Sweep-safe: within `@flighthq/displayobject`, no cross-package coupling, no breaking change, no open design decision. A blanket "do all recommended" can bless this set.

- **Drop the stale `@flighthq/textlayout` dependency.** `package.json` declares it but no source file references it (verified: zero `textlayout`/`TextLayout` hits in `src/`). It inflates the install graph and the potential bundle reach for every consumer. Pure dependency-hygiene removal; non-breaking. Run `npm run packages:check` after. — review.md › Contract & docs fit (a).
- **Add guarded `setStageFullScreenWidth` / `setStageFullScreenHeight` setters.** `fullScreenWidth` / `fullScreenHeight` are the only `Stage` data fields without a first-class mutation path, a small asymmetry against the guarded-setter pattern the rest of `stage.ts` follows. Additive, follows the existing guard-then-invalidate shape; does not change any current signature. — review.md › Gaps.
- **Disconnect the prior loader's slots in `setLoaderResourceLoader`.** The setter connects four slots on the new `ResourceLoader` and never disconnects the previous one's on replace — wire-once is fine, re-wire leaks. Retain the connected slot handles (or the prior `resourceLoader`'s signal refs) and disconnect them before rewiring. Leaking is never the intended behavior, so the fix is safe regardless of how Open direction #5 settles the wire-lifecycle _contract_; it only stops the leak, it does not decide policy. Within-package; no signature change. — review.md › Gaps.

## Backlog

Parked: cross-package coordination, larger within-package refactor, or waiting on an Open direction.

- **Honor the inert compositing traits (`cacheAsBitmap` / `cacheAsBitmapMatrix`, `scrollRect`, `opaqueBackground`).** Settable and invalidating today, but _no renderer reads them_ — visually a no-op. **Parked: cross-package.** The honoring now lives in the `displayobject-<backend>` leaves (`displayobject-canvas`/`-dom`/GL), not in this package, and is gated by Open direction #2 (should a trait ship before a backend honors it?).
- **Emit the lifecycle signals (`onAdded` / `onAddedToStage` / `onRemoved` / `onRemovedFromStage`).** Constructible but emitted nowhere; the originating event fires in `@flighthq/node`'s `addNodeChild` / `removeNodeChild`. **Parked: cross-package design fork** — the `node`→`displayobject` hook shape (callback slot on `NodeRuntime`, a hierarchy-called registry, or display-object-specific emission) is unresolved. Routed to Open direction #3.
- **Classic kinds `SimpleButton` / `MorphShape`.** Deferred to `@flighthq/interaction` (state-swap) and `@flighthq/shape`. **Parked: open boundary decision** — whether `displayobject` hosts any button/morph entity _shell_ at all is unsettled (Open direction #1, structural fork A: source-data vs graph participation).
- **URL-driven `Loader` convenience (`loadLoaderFromUrl`-style).** Loading a display object from a URL is currently the verbose "build a `ResourceLoader`, wire it, `startResourceLoad`" path. **Parked: open design decision** — whether a convenience belongs in scope or the verbose path is the deliberate golden path (Open direction #4). Would also pull in resource-loading surface.
- **Migrate the legacy `internal.ts` cast (`DisplayObjectInternal`) to runtime slots.** The codebase map flags this `Omit<… 'children'|'parent'|'stage'> & writable` cast as the "do not extend; prefer runtime slots" pattern. **Parked: larger within-package refactor** — it reshapes how read-only properties are exposed across the package's write paths, more than a sweep-safe edit, and brushes Open direction #6 (`Stage` as privileged root vs ordinary node, which the `stage` slot encodes).
- **Update the Package Map line for `@flighthq/displayobject`.** `agents/index.md` still says "bitmaps, shapes, containers, masks, stages, and videos" — the package has no shapes/masks (→ `shape` / `clip`) and _does_ have `Loader`/`RenderView`/`HtmlView`. **Parked: edits a shared admin doc**, not the package source tree, so it is outside this cell's sweep-safe boundary; raise with the user / fold into the next index pass.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter (Open directions)

Surfaced from review.md, not acted on here — these need a Boundary / North-star ruling before the parked items above become actionable. Do not edit the charter from this skill; the user settles them.

1. Where the boundary with neighbor entity packages falls (`Shape`/`Sprite` elsewhere; `SimpleButton`/`MorphShape` deferred) — does `displayobject` own only base entity + leaf surfaces, or also button/morph shells? (structural fork A)
2. Should a declared trait (`cacheAsBitmap`/`scrollRect`/`opaqueBackground`) ship before a `-backend` honors it? This is the central judgement for scoring the package honestly.
3. Who emits lifecycle signals and how the `node`→`displayobject` hook is shaped (cross-package fork).
4. Is a URL-driven `Loader` convenience in scope, or is the verbose path the deliberate golden path?
5. Does `setLoaderResourceLoader` own slot lifecycle (the Recommended fix stops the leak; this decides whether re-wire is a supported operation or a documented misuse).
6. Is `Stage` a privileged root kind or just a `DisplayObject` at the top (the `internal.ts` `stage` slot and `getDisplayObjectStageDepth` encode root semantics).
