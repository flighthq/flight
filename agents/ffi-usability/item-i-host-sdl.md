# Item I: flight-host-sdl

Design: `agents/ffi-usability.md` section 5.

## Goal

A second native host on SDL3, proving the host model is not winit-shaped, and the place where a caller-usable GL context arrives. SDL must never be required by a standard build.

## Shape

Same model and same verb set as Item G: `create_sdl_host`, `pump_sdl_host`, `run_sdl_host`, `destroy_sdl_host`, borrowed capability getters, `explain_*`. SDL's event queue is polled, so pump is the natural mode here. Read Item G's crate first and match its structure; where the two hosts end up with identical code, leave it duplicated for now and list it — extracting a shared primitive is a later decision.

## Source material

The archived `flighthq-host-sdl` crate (about 600 lines) is the project's own earlier code. Reusable: the SDL event to input mapping in `event.rs` and the raw-handle surface creation in `render_frame.rs`. It predates the capability model and has defects that must not carry over:

- the frame loop passes an empty draw closure, so it only clears;
- keyboard modifiers are always zero;
- wheel events are sent at position (0, 0);
- key names come from SDL, not the DOM-style names the input layer expects (check against `get_key_code_from_key_name`);
- the surface is created through the unsafe raw-handle path and depends on field drop order.

## What to build

1. **Crate** `crates/flight-host-sdl`, `sdl3` built from source and statically linked, outside `flight-sdk`, not in `default-members`.
2. **wgpu path** — the same capability set as Item G, including gamepad ingress, which SDL provides and winit does not (`InputIngressSink` has the five gamepad callbacks).
3. **GL path** — an SDL GL context exposed as the SDK's `GlContextToken` (`get_proc_address`) so `create_gl_context` / `create_gl_render_state` work, with the GL capability (`HostGlCapability`) filled. This is what makes exposing `flight-render-gl` and `flight-scene2d-gl` through the FFI worthwhile; pick up Item E's GL report and add the GL instantiation to its table, with the same-thread contract in the header.
4. **FFI feature** `host-sdl`, same rules as Items F and G.
5. **Build cost.** Building SDL3 from source needs a C toolchain and CMake and takes time. Document the requirements, and make sure no default path — root `cargo build`, default `flight-ffi`, `npm` scripts, CI's default jobs — triggers it. Add an opt-in CI job only if the environment can carry it; otherwise say so.
6. **Examples** — the same two as Item G (Rust and C), plus a GL variant.

## Tests

- Unit tests for event translation, including modifiers and key names.
- The window scenario from Item G, on SDL, local/manual.
- GL: render the reference scene and compare with the wgpu result within a stated tolerance.

## Not in scope

- Audio through SDL.
- Mobile targets.
- Capability construction from C.

## Acceptance

- Examples run on the developer platform on both wgpu and GL.
- A standard build has no SDL dependency; show the dependency tree for the default configuration.
- Filled/unfilled capability table, and a list of code duplicated with `flight-host-winit`.
- `cargo fmt`, lint, tests.

## Dependencies

Item G. Lowest priority of the nine; nothing else waits on it.
