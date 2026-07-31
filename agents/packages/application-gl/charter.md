---
package: '@flighthq/application-gl'
crate: flighthq-application-gl
draft: true
lastDirection: null
status: unblessed — cell authored 2026-07-31 to close a tracking gap; pending user ratification
review: ./review.md
assessment: ./assessment.md
---

# @flighthq/application-gl — Charter (DRAFT)

> **This is an unblessed design draft.** The package has shipped code and tests but had **no cell at
> all** until 2026-07-31, so it was invisible to the review → assess → approve pipeline and to the
> `AGENTS.md` Package Map. This charter transcribes what the code already commits to, plus the
> harness direction the user gave on 2026-07-31. Nothing here is authoritative until blessed.

## What it is

`@flighthq/application-gl` is the **WebGL realization of `ApplicationRenderView`** — the composition
point where an `ApplicationWindow` meets a `GlRenderState`, a `GlRenderTarget`, and a device-pixel
`Viewport`, and where the canvas backing store is kept in sync with the window.

It exists because of a package-arrow constraint, not because the assembly is inherently
backend-specific: `@flighthq/application` must stay below the render backends, and a render backend
must not import `@flighthq/application` merely to offer an assembly helper. `application-gl` is the
one layer that legitimately sits **above both**, so it is where the two can be joined.

3 source files, 1 test file. Dependencies (all `/contract` lane): `application`, `node`, `render-gl`,
`types`.

## North star

1. **Batteries included — the point is a running app, not a struct.** The harness gets a caller from
   "I have a page" to "I have a main loop and a render-ready surface" in one step. Linking four
   objects is the mechanism; the batteries are the point. (User direction, 2026-07-31 — recorded in
   full in the [`application` charter](../application/charter.md) Decisions.)
2. **Convenience without concealment.** The harness removes ceremony, never a semantic the caller
   needs to control. All four linked objects stay independently accessible, the caller still names
   the harness and still starts the loop. This is the earned exception to Flight's accepted
   verbosity: bootstrap ceremony teaches the reader nothing about the feature being demonstrated.
3. **Arrows point downward.** This package may depend on `application` and `render-gl`; neither may
   ever depend on it. If a helper here would require a backward arrow, the helper is in the wrong
   package.
4. **Explicit ownership and teardown.** `createGlApplicationRenderView` owns the state and target it
   allocates; `destroyGlApplicationRenderView` frees them deterministically. The canvas and the
   `ApplicationWindow` remain caller-owned and are never destroyed here. Creation does not attach the
   resize signal — `attachApplicationRenderView` is a separate, explicit call.
5. **Idempotent, window-authoritative synchronization.** Never assign the canvas backing size when
   the dimensions are unchanged: the assignment resets WebGL state even when the target resize then
   no-ops. The supplied `ApplicationWindow.devicePixelRatio` is the source of truth; ambient global
   state never silently replaces it.

## Boundaries

**In scope:**

- The GL realization of the view: allocate `GlRenderState`, `GlRenderTarget`, and device-pixel
  `Viewport` from an `ApplicationWindow`, and deterministically destroy what it allocated.
- Canvas backing-store synchronization and the resize path, including GL state-cache invalidation
  when the backing store actually changed.

**Non-goals:**

- The main loop itself — `@flighthq/application` owns start/stop/pause/resume/step and the
  `LoopBackend` seam. This package composes the loop; it does not reimplement it.
- Windowing and window state — `@flighthq/application`.
- Drawing anything — the leaf renderers (`scene2d-gl`, `scene3d-gl`) and `render-gl` primitives.
- WGPU parity. Deliberately deferred: settle the window/target/state/viewport contract and prove its
  GL behavior with raster evidence before mirroring it into an `application-wgpu`.

## Decisions

- **[2026-07-31 · drafted, unblessed] The cell exists to close a tracking gap.** The package had
  shipped code and tests with no `charter.md`, so it produced no `Recommended` items and appeared in
  no queue. Authoring this draft makes it visible to the pipeline; it does not bless its contents.

## Open directions

1. **Does this package own the harness entry point, or only the view?** Today it exports the view
   assembly (`createGlApplicationRenderView` / `destroyGlApplicationRenderView`) and nothing that
   starts a loop — so the batteries-included promise is currently unmet here. If the harness lands
   here it is backend-specific by construction and `application-wgpu` must mirror it; the
   alternative is a backend-agnostic harness in `application` that accepts an already-built view.
   Mirrored in the [`application` charter](../application/charter.md) Open directions, where the
   fork is stated in full — resolve it in one place, not two.
2. **Does `createGlApplicationRenderView` satisfy the `create*` Entity invariant?** The repo-wide
   rule is that every public `create*` returns an `Entity`. `GlApplicationRenderView` should be
   audited against that contract alongside the `application`-domain Entity migration, rather than
   separately.
3. **Is the name right?** `application-gl` follows the `<subject>-<backend>` convention, but the
   subject here is the *render view*, not the application. If a sibling ever needs a non-view GL
   application concern, the name will over-claim.
