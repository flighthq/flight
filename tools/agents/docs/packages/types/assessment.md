---
package: '@flighthq/types'
updated: 2026-06-25
basedOn: ./review.md
---

# types — Assessment

Reasoned over [`./review.md`](./review.md) (merge-gate review of the `integration-b2824e3d8` delta vs the approved `origin/main` floor `eb73c3d74`). Recommended is sweep-safe, within-package, non-design work only; everything cross-package, design-deciding, or larger is Backlog; design forks route to the charter's Open directions. Approved is the user's verbal gate and stays empty.

## Recommended (sweep-safe, within-package)

- **Resolve the `Notification` id/tag seam gap.** The delta's `updateNotification(id, …)` keys on an `id` that the typed `NotificationBackend`/`NotificationRequest` seam never exposes (`notify` returns `Promise<boolean>`, identity elsewhere is `tag`). Make the seam internally consistent. The minimal, within-`types` form is to key the new method on `tag` (`updateNotification(tag: string, …)`), matching `subscribe*` and `NotificationRequest.tag`. _Caveat:_ if the intended model is the impl's id-based one, this becomes a Backlog item (it then touches `notify`'s return type and `@flighthq/notification`) — see Backlog. — review.md §6
- **Share a `TextDirection` alias.** `'LeftToRight' | 'RightToLeft'` is repeated inline in `ShapedRun` and `ShapeRunOptions`. Extract a single `TextDirection` type and reference it from both. Pure within-`types` factoring, no consumer change (structural). — review.md "Soft findings"
- **Document `glyphCount` on `ShapedRun`.** Add a one-line durable comment stating why `glyphCount` coexists with `glyphs.length` (over-allocated result buffer), or drop it if it is always `glyphs.length`. — review.md "Soft findings"

## Backlog (parked)

- **Lift the notification seam to an id-based model** — _why parked:_ if `updateNotification` truly needs a host-assigned handle (the `@flighthq/notification` impl already mints a Flight `id`), the correct fix reshapes `notify` to return that id and adds `id` to `NotificationRequest`, which crosses the package boundary into `@flighthq/notification` and changes a return type. That is a design decision, not a sweep. Route to the user / a notification-seam session.
- **Unify domain region types on a shared `RectangleLike`/`Region2D`** — _why parked:_ `RenderViewport2D` joins a standing family of identically-shaped region types (`SurfaceRegion`, `TextSelectionRectangle`, `TextureAtlasRegion`, `Screen`, …). Consolidating them is an SDK-wide naming/structure decision touching many consumers, not a within-`types` sweep, and may be intentional (domain-named regions read better at the callsite). Charter/Open-directions material.

## Approved

_None. Approval is the user's verbal gate; nothing is moved here without it._

## Notes for the charter's Open directions

- **Author the charter.** `@flighthq/types` — the SDK's most load-bearing package — still has a stub charter (What it is / North star / Boundaries / Decisions all `TODO`). Every finding above is judged against the codebase-map fallback, not blessed intent. Capturing the header-layer North star (full SDK API navigable and pinnable from `@flighthq/types` alone, mechanically enforced) is the highest-leverage open item and predates this delta.
- **Notification identity model.** Decide whether the system-notification seam is keyed by user-supplied `tag` or a host-assigned `id`, and make the whole seam (`notify` return, `subscribe*`, `update*`) speak one vocabulary. The delta surfaced this; it wants a blessed ruling.
- **Region-type policy.** Whether identically-shaped screen/region rects (`RenderViewport2D`, `SurfaceRegion`, `TextSelectionRectangle`, `TextureAtlasRegion`, …) stay domain-named or consolidate onto a shared `RectangleLike`/`Region2D`.
- **Text-direction / bidi vocabulary.** Whether `TextDirection` becomes a shared header type used across the shaping and layout seams (and how it relates to any future bidi level model).
