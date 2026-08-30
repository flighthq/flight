# Render View Model — extracting `RenderView` from `ApplicationRenderView`

**Status: proposal, awaiting ruling. Raised 2026-07-31 in a direction session with the user.**

Read before touching `ApplicationRenderView`, `createGlApplicationRenderView`, the `@flighthq/application-gl`
package, or the `render` Directed item that makes `RenderTarget` + `Viewport` the sub-target primitive.
This proposal lands on the same seam as that approved work — see [Relationship to approved work](#relationship-to-approved-work)
before starting either.

## The claim

`ApplicationRenderView` is a rendering primitive with a **window welded onto it**. The weld is what
forced `@flighthq/application-gl` into existence, what makes `attach*` read wrong, and what makes the
headless path impossible. Removing the weld yields a `RenderView` primitive that belongs in
`@flighthq/render`, and dissolves `application-gl` entirely.

## What exists today

```ts
createApplicationRenderView(window, renderState, renderTarget, viewport, resize) → ApplicationRenderView
attachApplicationRenderView(view)          // connects view.window.onResize → synchronize
synchronizeApplicationRenderView(view)     // window authority → target + viewport + state
```

`ApplicationRenderView` is `{ window, renderState, renderTarget, viewport }` — four `readonly` fields on
an `Entity`. The GL realization (`createGlApplicationRenderView`) lives in its own package,
`@flighthq/application-gl`, and allocates three of the four from a window + canvas.

## Four pieces of evidence

**1. `@flighthq/application` does not depend on `@flighthq/render`.** Its dependencies are exactly
`entity`, `signals`, `types`. So the package that defines a *render* view cannot call a single render
function.

**2. The `resize` callback parameter is a symptom, not a design.** Because `application` cannot reach
rendering, the backend must inject the resize seam as a function argument. The signature
`ApplicationRenderViewResize = (state, target, width, height) => void` exists only to route around a
package boundary the type should never have crossed.

**3. `application-gl` exists solely because of the weld.** It was created 34 minutes after the feature
landed — `f701c9939 feat(application): integrate GL application render views`, then
`e20dad1eb fix(application): isolate GL render view assembly` — purely to satisfy arrows-point-downward
after the GL assembly was found sitting in `application` (and briefly `render-gl`). The package is a
workaround for a misplaced type, not a domain.

**4. The codebase already names the windowless concept.** From the `Viewport` doc comment in
`@flighthq/types`:

> A renderable surface is a Viewport paired with a RenderTarget; many Viewports may cover one target
> (split-screen, picture-in-picture).

That is the primitive this proposal extracts. Note especially *many Viewports may cover one target* —
the view is not 1:1 with a window, and welding a window on asserts that it is.

## The proposal

Move the window from the constructor to the attach call, and let the remainder fall to its natural layer.

```
@flighthq/render        RenderView = renderState + renderTarget + viewport
                        createRenderView(…), resizeRenderView(view, width, height)
                        — a pure rendering concept; no window, no application

@flighthq/render-gl     createGlRenderView(canvas, options)
                        — allocates GL state + target + viewport natively.
                          No upward dependency: it no longer needs to know what a window is.

@flighthq/application   attachRenderViewToWindow(view, window)
                        detachRenderViewFromWindow(view, window)
                        — owns the size authority: logical→device-pixel derivation, DPR,
                          computeWindowDeviceTransform, and the onResize connection.

@flighthq/application-gl   DELETED — nothing remains for it to do.
```

The split of responsibility is clean along the existing package graph:

- **`resizeRenderView(view, w, h)`** — render-owned, pure, no window concept.
- **window → view synchronization** — application-owned, because DPR and logical size are window facts.

`application` may legally gain a dependency on `render` (application sits above rendering); the
forbidden direction is `render-gl → application`, which this removes rather than adds.

## What it fixes

- **`attach*` becomes honest.** `attachRenderViewToWindow(view, window)` names both parties and takes
  both. Today `attachApplicationRenderView(view)` takes one argument and hides the second party inside
  the view — see [the attach-family finding](#appendix-the-attach-naming-inconsistency), which is a real
  inconsistency independent of this proposal.
- **The headless / capture path becomes possible.** You simply omit the attach call. Today a windowless
  render is impossible without fabricating an `ApplicationWindow` and hand-setting its dimensions —
  exactly what `functional/scenes/application-render-view.webgl.ts` is forced to do.
- **A package disappears.** `application-gl` stops existing.
- **The `resize` callback parameter disappears.** `render` can resize a target directly.
- **Multi-view-per-target becomes expressible**, matching what the `Viewport` contract already claims.

## Open questions — resolve before building

1. **Does `RenderView` own its `RenderState`, or reference one?** A `RenderState` is per-canvas/context
   and many viewports may share one target. If a view *owns* state, two views cannot share a context —
   the same 1:1 trap the window weld created, one layer down. Owning is simpler; referencing is truer to
   the `Viewport` contract. This is the load-bearing question and should be settled first.
2. **Does `RenderView` own its `RenderTarget`?** Same shape of question. `destroyGlApplicationRenderView`
   currently destroys the target and state it allocated; if a view only references them, teardown moves
   to the caller and the `dispose*`/`destroy*` distinction needs restating for the new type.
3. **Is `RenderView` the right name?** It is a `RenderTarget` + `Viewport` (+ state) triple. `RenderView`,
   `RenderSurface`, and `DrawableView` are all candidates; the `Viewport` comment says "renderable
   surface". Whatever is chosen must not collide with `RenderViewport2D`, which the `render` Directed
   items are retiring.
4. **Where does the loop↔view joint live?** Separate from this proposal but adjacent — see the
   batteries-included harness direction in the [`application` charter](packages/application/charter.md).
   The current recommendation there is that the assembly must *hand back* a loop, never start one.
5. **Does `Viewport` stay in `@flighthq/node`?** `createViewport` lives in `node/src/viewport.ts` today
   while the type is in `types`. If `RenderView` lands in `render`, check whether that constructor home
   still makes sense or is an accident.

## Relationship to approved work

This is **not a competing thread** — it is the same seam as work already in the `render` cell's
`Directed` list, which is the head of the currently-approved dependency chain:

> - Make `RenderTarget` + device-pixel `Viewport` the allocation-free sub-target primitive
> - Treat viewport aspect as authoritative at draw time
> - Retire `RenderViewport2D` without inventing a false world-space replacement

A builder implementing the sub-target primitive **without knowing a `RenderView` is meant to sit on
it** will likely shape it wrong. Update the `render` cell's direction before dispatching that item, or
sequence this ruling ahead of it.

## Cost and risk

Real, and larger than a rename: it moves a type between packages, deletes a package, changes a public
`create*` signature, and touches `render`, `render-gl`, `application`, `application-gl`, the `sdk`
barrel, and one functional scene. It needs `npm run api`, `npm run exports:check`, and
`npm run packages:check`.

The pre-release posture argues for doing it now rather than accumulating around it — there are no
published consumers and no migration obligations. The argument against is timing, not correctness:
`agents/examples-plan.md` is already reworking the example set, and converting examples twice would be
waste. Sequence the two together.

## Appendix — the attach naming inconsistency

Independent of this proposal, `attachApplicationRenderView` is misnamed. Surveying all 27 `attach*`
exports, they fall into two families:

- **`attach<Entity>`, one argument** — the entity *is* a dedicated capability and the counterpart is
  ambient platform: `attachConnectivity(net)`, `attachSocket(socket)`, `attachSensors(sensors)`,
  `attachScreenSignals(host, signals)`, `attachStatusBar(bar)`, `attachClipboardWatch(host, watch)`.
- **`attach<Entity><Event>`** — the entity is general-purpose with many signals, so the name says which
  one: `attachWindowClose(win)`, `attachWindowResize(win, element)`, `attachWindowFocus(win, element)`,
  `attachWindowVisibility(win)`, `attachApplicationExit(app)`, `attachApplicationLifecycle(app, win)`.

`ApplicationRenderView` is a general four-part link wired for one specific behavior, so it belongs to
the second family but is named like the first. If this proposal is **accepted**, the name resolves
naturally to `attachRenderViewToWindow(view, window)`. If it is **rejected**, the minimal fix is a
suffix — `attachApplicationRenderViewResize(view)` / `detachApplicationRenderViewResize(view)` — which
slots into the second family and names the event source. Either way the current name should not stand.
