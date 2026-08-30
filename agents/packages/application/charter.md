---
package: '@flighthq/application'
role: package
crate: flighthq-application
draft: false
lastDirection: 2026-07-31
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# application — Charter

## What it is

`@flighthq/application` is the **application entry-point and orchestration layer** — the main loop (start/stop/pause/resume/step, frame-rate control, fixed-timestep accumulator, FPS metrics, swappable `LoopBackend`) plus windowing (`ApplicationWindow` with full state/control, multi-window registry, pointer-lock, swappable `WindowBackend`). 70 exports across 2 source files, 133 tests. Dependencies: `signals`, `types`.

Application is an entry-point package that helps orchestrate windowing, input, and other subsystems. It is a strong candidate for spawning new packages or refactoring to reduce down to more primitive packages — the 48-export windowing surface and the 22-export loop surface may be primitives that have not been extracted yet.

It also owns **`ApplicationRenderView`** — the batteries-included harness that gets a caller from "I have a page" to "I have a main loop and a render-ready surface" in one step. See the harness decision below; the GL realization lives in the neighbor package `@flighthq/application-gl`.

## North star

1. **Entry-point orchestrator, not a monolith.** Application orchestrates subsystems (loop, windowing, input). When a subsystem grows, it should extract to its own primitive package, with application composing it.
2. **Swappable backends.** Loop scheduling and visibility are explicit Host slots passed to `startApplicationLoop`; `webHost` and the granular Web provider consts live in `@flighthq/host-web`, while native hosts compose their own slots. Windowing still uses its `*Backend` seam pending migration.
3. **Explicit lifecycle.** No magic startup. `createApplication`, `startApplicationLoop`, and `createApplicationWindow` are all explicit calls the user makes.

## Boundaries

**In scope:**

- Application creation and main loop lifecycle (start/stop/pause/resume/step).
- Frame-rate control, fixed-timestep accumulator, FPS metrics.
- Swappable `LoopBackend` (web: rAF-based, native: host-provided).
- Application window creation, state, and control.
- Swappable `WindowBackend` (web: DOM-based, native: host-provided).
- Multi-window registry, pointer-lock, fullscreen.
- Signal hooks for lifecycle and window events.

**Non-goals:**

- Input processing — `@flighthq/input`.
- Rendering — `@flighthq/render` and backend packages.
- Audio/video playback — `@flighthq/media` or per-resource packages.

## Decisions

- **[2026-07-02] ~~Missing types~~ — false alarm.** Types were already present and correctly defined in `@flighthq/types`. The depth review was based on stale state. No action needed.

- **[2026-07-02] Remove dead `LoopState.accumulated`.** Assessment-recommended cleanup.

  **Why:** Dead code.

- **[2026-07-02] Application is an entry-point orchestrator — candidate for decomposition.** The 70 exports across loop + windowing may represent primitives that should extract. The high export count is partly signal hooks (attach/detach/enable patterns), which is expected for an event-rich surface. But windowing and loop are distinct concerns that could become their own packages.

  **Why:** Follows the decomposition principle — if application feels complex, the cause is missing primitives underneath. Loop and windowing are candidates. But don't decompose prematurely — evaluate whether the current surface is genuinely too large or just naturally broad.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

- **[2026-07-31] `ApplicationRenderView` is a batteries-included harness, not just a struct that links four objects.** Its purpose is to get a caller from "I have a page" to "I have a main loop and a render-ready surface" in one step, so examples and functional scenes can open with the harness and then say only what makes them different. The linking contract (window + `RenderState` + `RenderTarget` + device-pixel `Viewport`, all four independently accessible) is the _mechanism_; the batteries — a running loop and a surface you can draw to immediately — are the _point_.

  **Why:** The verbosity Flight accepts elsewhere is bought with clarity: spelling out renderer registration and the update pass shows the user where work and memory go. Bootstrap verbosity buys nothing. Every example repeating canvas creation, device-pixel-ratio math, backing-store sync, and an `enterFrame` closure is not teaching the reader anything about the feature being demonstrated — it is noise that hides the feature. The harness is the one place a convenience assembly is _earned_, because it removes ceremony without hiding a semantic the caller needs to control. Note this does not weaken the explicit-lifecycle north star: the caller still names the harness, still starts the loop, and still reaches every underlying object.

  **Status when recorded:** the assembly half exists and is tested — `createApplicationRenderView` / `attachApplicationRenderView` / `synchronizeApplicationRenderView` here, and `createGlApplicationRenderView` / `destroyGlApplicationRenderView` in `@flighthq/application-gl` (canvas backing-store sync, state, target, viewport, resize). The harness half is unmet: nothing composes the loop with the view, and adoption is effectively zero. Measured 2026-07-31 across the 41 example packages — **39 files hand-roll `requestAnimationFrame`, 50 hand-roll canvas creation, 1 uses `startApplicationLoop`, and 0 use `createGlApplicationRenderView`** (its only consumer anywhere is the single functional scene `application-render-view.webgl.ts`). Treat the Directed item "Build `ApplicationRenderView`" as _built as an assembly, unbuilt as a harness_; the remaining work is loop composition and example adoption, not re-implementing the link.

## Open directions

1. **Windowing extraction.** Should `window.ts` (48 exports) extract to `@flighthq/window`? The attach/detach/set/get pattern generates many exports from a coherent surface. 48 exports is large but may be bedrock — splitting would just be blood from a stone. Evaluate once the types are rebuilt and the package compiles.

2. **Loop extraction.** Should the main loop (22 exports) extract to `@flighthq/loop`? It's a self-contained subsystem with its own backend seam.

3. **Relationship to input, render, media.** Application is the entry point that wires these together. How much orchestration logic should live here vs in each subsystem?

4. ~~**Package Map update.** Expand the current entry.~~ — **closed 2026-07-31.** The `AGENTS.md` Package Map entry now reads `application` (main loop and windowing) with `application-gl` (the WebGL `ApplicationRenderView` assembly); `application-gl` was absent from the map entirely until then.

5. **Should `ApplicationRenderView` lose its window and move to `@flighthq/render`? — proposal awaiting ruling.** Raised 2026-07-31. This package does **not** depend on `@flighthq/render` (deps are `entity`, `signals`, `types` only), which is why `createApplicationRenderView` takes a `resize` *callback* — the backend must inject the resize seam to route around a package boundary. Take the window out of the constructor and put it in the attach call, and the remainder (`renderState + renderTarget + viewport`) is a pure rendering primitive that belongs in `render`; what stays here is the size authority — `attachRenderViewToWindow(view, window)`, DPR, logical→device derivation, `computeWindowDeviceTransform`. `@flighthq/application-gl` would dissolve. Full argument and open questions in [render view model](../../render-view-model.md). Resolve this **before** direction 6 below, since it changes what the assembly is assembling.

6. **Where does the harness entry point live, and what is it called?** The batteries-included decision above fixes the _intent_ but not the _shape_, and the shape is constrained: "keep package arrows pointing downward" forbids `render-gl` importing `application`, so the composition point cannot sit in a render backend. `@flighthq/application-gl` already sits above both and is the natural home, but that makes the loop-plus-surface entry point backend-specific (`application-wgpu` would mirror it). The fork: one backend-specific harness per backend, or a backend-agnostic harness in `application` that takes an already-built view? Also open — does the harness _own_ the loop (start it for you) or merely hand you one, and does it return an Entity per the `create*` invariant?

7. **Which examples adopt the harness, and is adoption mandatory?** 39 of 41 example packages hand-roll their bootstrap today. Converting them is mechanical but wide, and the [examples plan](../../examples-plan.md) is already reworking that set — these should be sequenced together rather than colliding. Should new examples be _required_ to use the harness (making hand-rolled bootstrap a review finding), or is it opt-in for the ones where ceremony actually obscures the feature?
