---
package: '@flighthq/application'
updated: 2026-08-25
basedOn: ./review.md
---

# application — Assessment

Refreshed against the 2026-07-13 review (solid — 88). All three previously-Recommended items are verified done in the live tree: the `@flighthq/types` half exists (`LoopBackend.ts`, `ApplicationLoopOptions.ts`, expanded `Application`, the three `WindowBackend` methods), dead `LoopState.accumulated` is removed (only `fixedAccumulator` remains), and the Package Map line in `agents/index.md` now describes the full loop + windowing surface.

## Directed

1. **Build `ApplicationRenderView` as the explicit 95% assembly.** It links an `ApplicationWindow`, `RenderState`, `RenderTarget`, and device-pixel `Viewport` while keeping all four independently accessible. Window resize updates the common target/state/viewport case; callers attach additional resize work through the existing signal rather than a kitchen-sink callback surface.

   > **[2026-07-31 · principal] Read this as built-as-assembly, unbuilt-as-harness — do not start by rewriting the link.** The assembly described above **already exists and is tested**: `createApplicationRenderView` / `attachApplicationRenderView` / `synchronizeApplicationRenderView` here, and `createGlApplicationRenderView` / `destroyGlApplicationRenderView` in `@flighthq/application-gl` (canvas backing-store sync, state, target, viewport, resize, GL cache invalidation).
   >
   > What is **not** built is the batteries-included half the user named on 2026-07-31: getting a caller from "I have a page" to "I have a main loop and a render-ready surface" in one step. Nothing composes the loop with the view, and adoption is ~zero — across the 41 example packages, **39 files hand-roll `requestAnimationFrame`, 50 hand-roll canvas creation, 1 uses `startApplicationLoop`, 0 use `createGlApplicationRenderView`**; its only consumer repo-wide is the functional scene `application-render-view.webgl.ts`.
   >
   > The remaining work is **loop composition and example adoption**. Both charters record the direction ([`application`](./charter.md) Decisions, [`application-gl`](../application-gl/charter.md) North star), and the entry-point shape is an **open fork awaiting the user** — see Open direction 5 in the `application` charter. Do not pick the shape unilaterally.
2. **Keep package arrows pointing downward.** The shared view contract belongs in `@flighthq/types`; generic attach/resize observation belongs here. A render backend must not import `@flighthq/application` merely to offer a backend assembly helper. Prefer a caller composition or a high-level application helper that depends only on lower layers.
3. **Lead with GL and defer WGPU assembly parity.** Settle the window/target/state/viewport contract and its GL behavior first. Do not use a premature WGPU factory to harden an unvalidated cross-backend contract.
4. **Make synchronization idempotent and window-authoritative.** Do not assign the canvas backing size
   when its dimensions are unchanged—the assignment resets WebGL state even when target resize then
   no-ops. Respect the supplied `ApplicationWindow.devicePixelRatio`; browser observation updates that
   source explicitly rather than a backend factory silently replacing it from ambient global state.
5. **Complete the Entity constructor invariant in the application domain.** `Application`,
   `ApplicationWindow`, `LoopBackend`, and `WindowBackend` are all returned by public `create*`
   functions today, so their header contracts must extend `Entity` and their factories must use
   `createEntity`; retain the names only with that enforced shape.

## Recommended

None — all prior items verified landed 2026-08-25.

## Approved

- [2026-07-02 · picked] Sweep items 1–3: rebuild missing types, remove dead accumulated, Package Map description
- [2026-08-08 · picked] Backlog item "Fixed-update support in `stepApplicationLoop`", together with Recommended item 1 (fold the triplicated `onError` emit guard) — same code, done together. Route: extract the step policy `tick` and `step` duplicate into one internal function both drivers call, rather than copying the fixed-step block into `step`. Whether `step` honors an active fixed-mode loop state or takes explicit options is a user decision and is not settled by this approval.
- [2026-08-08 · picked] Resolving the design call left open by the line above: `stepApplicationLoop` takes **explicit options and is self-sufficient** — it lazily creates whatever accumulator state it needs, so fixed-step works with no prior `startApplicationLoop`. Rejected: honoring an active loop state, which would give one callsite two meanings and leave a never-started headless program unable to request fixed-update at all. Consequences that follow and are not separately optional: explicit options at the callsite win over any state a prior `start` established; `stepApplicationLoop(app, delta)` with no options keeps today's behaviour exactly (`interpolationAlpha = 1`, no `onFixedUpdate`); and when fixed mode is active `interpolationAlpha` is computed from the residual accumulator rather than pinned to 1.
