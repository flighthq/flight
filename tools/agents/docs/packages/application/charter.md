---
package: '@flighthq/application'
crate: flighthq-application
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# application — Charter

## What it is

`@flighthq/application` is the **application entry-point and orchestration layer** — the main loop (start/stop/pause/resume/step, frame-rate control, fixed-timestep accumulator, FPS metrics, swappable `LoopBackend`) plus windowing (`ApplicationWindow` with full state/control, multi-window registry, pointer-lock, swappable `WindowBackend`). 70 exports across 2 source files, 133 tests. Dependencies: `signals`, `types`.

Application is an entry-point package that helps orchestrate windowing, input, and other subsystems. It is a strong candidate for spawning new packages or refactoring to reduce down to more primitive packages — the 48-export windowing surface and the 22-export loop surface may be primitives that have not been extracted yet.

## North star

1. **Entry-point orchestrator, not a monolith.** Application orchestrates subsystems (loop, windowing, input). When a subsystem grows, it should extract to its own primitive package, with application composing it.
2. **Swappable backends.** Both loop and windowing use explicit `*Backend` seams. The web backends are in-box defaults; native hosts replace them.
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

- **[2026-07-02] Missing types must be rebuilt.** `LoopBackend`, `ApplicationLoopOptions`, expanded `Application` interface fields, and 3 `WindowBackend` methods were never committed to `@flighthq/types`. Likely lost agent work. Blocking prerequisite.

  **Why:** The package cannot compile without its types.

- **[2026-07-02] Remove dead `LoopState.accumulated`.** Assessment-recommended cleanup.

  **Why:** Dead code.

- **[2026-07-02] Application is an entry-point orchestrator — candidate for decomposition.** The 70 exports across loop + windowing may represent primitives that should extract. The high export count is partly signal hooks (attach/detach/enable patterns), which is expected for an event-rich surface. But windowing and loop are distinct concerns that could become their own packages.

  **Why:** Follows the decomposition principle — if application feels complex, the cause is missing primitives underneath. Loop and windowing are candidates. But don't decompose prematurely — evaluate whether the current surface is genuinely too large or just naturally broad.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Windowing extraction.** Should `window.ts` (48 exports) extract to `@flighthq/window`? The attach/detach/set/get pattern generates many exports from a coherent surface. 48 exports is large but may be bedrock — splitting would just be blood from a stone. Evaluate once the types are rebuilt and the package compiles.

2. **Loop extraction.** Should the main loop (22 exports) extract to `@flighthq/loop`? It's a self-contained subsystem with its own backend seam.

3. **Relationship to input, render, media.** Application is the entry point that wires these together. How much orchestration logic should live here vs in each subsystem?

4. **Package Map update.** Expand the current entry.
