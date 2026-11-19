# Item E: Render path through the FFI

Design: `agents/ffi-usability.md` section 4. The owner ruled for borrow-erased `begin`/`end` handles on an allowlist, not a scoped convenience wrapper.

## Goal

Everything a consumer needs between "I have a device and a target" and "the frame is submitted" is callable through the C ABI, one-to-one with the SDK, for wgpu. Devices and targets themselves come from host crates (Items F and G); this item makes the middle reachable.

## The blockers (file references from current code)

1. **Generic core.** `prepare_scene_2d_render<S: RenderState>` (`flight-render/src/render_proxy.rs:291`), `register_node_renderer<S>` (`flight-render/src/renderer.rs:62`) and `RenderProxies2D<S>`. The generator skips type generics (`build.rs:1334-1339`).
2. **Borrowing pass.** `begin_wgpu_render_pass<'a>(state, target, clear) -> WgpuRenderPass<'a>` (`flight-render-wgpu/src/wgpu_render_pass.rs:28`); `render_wgpu_scene2d(&mut pass, &mut proxies, &source, Option<&Matrix>)` (`flight-scene2d-wgpu/src/wgpu_node2d.rs:38`).
3. **Renderers are statics.** 15 `WGPU_*_RENDERER` statics and `WGPU_SCENE2D_RENDER_PRESET` in `flight-scene2d-wgpu`; registration takes `&'static NodeRenderer<S>`.
4. **Backend crates are not scanned.** `flight-render-wgpu`, `flight-render-gl`, `flight-scene2d-wgpu`, `flight-scene2d-gl`, `flight-effects-wgpu`, `flight-scene3d-wgpu` are absent from `SCAN_CRATES` (`build.rs:102`). They are already linked through `flight-sdk`'s default features.

The reference call order is the headless test `crates/flight-scene2d-wgpu/tests/wgpu_node2d_test.rs:30-74`.

## What to build

### E1. Declared instantiations

A literal table in the generator naming the backend instantiations of generic render functions and containers. Start with `S = WgpuRenderState`; add `GlRenderState` to the table only if E5 below says GL is being exposed now.

- Each generic function in the table gets one wrapper per instantiation, with the backend in the name (`flight_prepare_wgpu_scene_2d_render`).
- Each generic container (`RenderProxies2D<S>`, the 3D equivalent) becomes one opaque carrier per instantiation with create and free.
- The table is explicit. Do not infer instantiations, and do not turn this into general generic support. A generic function not in the table stays skipped under its existing policy.

### E2. Registration is a function

Every renderer a consumer needs must be registrable by calling a non-generic public `register_*` function that takes the render state. TypeScript already exposes registration this way.

- Audit `flight-scene2d-wgpu` (and `flight-scene3d-wgpu`): for each renderer static and for the preset, is there a public non-generic `register_*` function? List the gaps.
- Where only the static exists, add the function **to the owning crate**, named and placed as its TypeScript counterpart is (`npm run api scene2d-wgpu` shows the TypeScript names). Do not add FFI-only registration helpers.
- New `register*` exports must pass `npm run backend-prefix:check` and the export/test checkpoints in `AGENTS.md`. If adding a Rust function changes emitted TypeScript, follow the normal alignment process and report it.

### E3. Bracket handles

A generator pattern for `begin_*` / `end_*` pairs whose `begin` returns a value borrowing one of its arguments.

- An allowlist of pairs, starting with the wgpu render pass. Nothing outside the allowlist gets this treatment.
- `begin` returns an owned handle holding the pass with the borrow erased. Functions taking `&mut WgpuRenderPass<'_>` take the handle. `end` consumes it.
- The contract is the caller's and is written in the header: the state outlives the pass; the state is not passed to any other function until `end`; one open pass per state.
- A guard: while a pass is open, record it so that a second `begin` on the same state, or `end` on an already-ended handle, returns the sentinel instead of invoking undefined behaviour. This is the minimum; do not try to guard every other use of the state.
- Freeing a pass handle without ending it must be safe (drop the pass, clear the guard).
- This is the most safety-sensitive part of the item. The implementation needs a written soundness argument in the review: what is erased, what the caller promises, what the guard catches, what it does not.

### E4. Scan the backend crates

Add the wgpu backend crates to `SCAN_CRATES` once E1–E3 exist. Expect many new skips; classify every one (generated, existing policy, new named policy with a reason). Native handle types (`wgpu::TextureView` and the like) that a consumer should never touch are policy skips, not gaps.

### E5. GL

Report, do not build: what exposing `flight-render-gl` and `flight-scene2d-gl` would need (`Rc<glow::Context>`, `unsafe create_gl_context`, the thread-bound contract). GL through the FFI is scheduled with the SDL host (Item I). If scanning the GL crates is harmless (all skips are clean policies), it may be included; if it creates unreachable wrappers, leave them out.

## Completeness check

Using Item A's graph, assume a `WgpuDevice`, a render-target carrier and a surface carrier are producible (declare them as provisional producers for the analysis), and show that every function in this sequence is then reachable:

create render state → register standard material, texture resolvers and the scene2d renderers → create proxies → `prepare_scene_2d_render` → begin pass → `render_wgpu_scene2d` → end pass → `submit_wgpu_frame` → end target frame; plus resize sync, render-state destroy, and the offscreen render-state path (`create_wgpu_offscreen_render_state`).

List exactly which carriers remain for a host to produce. That list is the contract Items F and G implement; record it in `agents/ffi-usability-reports.md`.

## Tests

- Rust integration test inside `flight-ffi` that drives the whole sequence **through the generated `extern "C"` functions**, using the per-crate headless device bootstrap already in `flight-scene2d-wgpu/tests/support.rs` to make the device, and compares the result with the same scene rendered through the Rust API. Skip cleanly with a message when no adapter is available.
- Bracket-handle guard tests: double begin, double end, free without end.

## Not in scope

- Creating devices, surfaces, windows (Items F, G).
- GL exposure beyond the E5 report.
- 3D scene rendering beyond what falls out of the table; if `flight-scene3d-wgpu` needs its own design, report it.
- Bindgen (Item H).

## Acceptance

- The completeness check passes with only host-side carriers outstanding, and that list is delivered.
- The FFI-driven render test matches the Rust-driven render.
- Every renderer static has a `register_*` function in its crate.
- Written soundness argument for bracket handles, reviewed by someone other than the author.
- Census pins updated with the delta explained; reachability baseline updated; `cargo fmt`, lint, existing tests.

## Dependencies

Item A. Item B for the node handle that `prepare` and `render` consume. E2 (registration functions) is independent and can start immediately.
