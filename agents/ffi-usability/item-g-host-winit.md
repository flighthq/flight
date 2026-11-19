# Item G: flight-host-winit

Design: `agents/ffi-usability.md` section 5. The owner ruled that the first native host presents through wgpu only.

## Goal

The reference native host. A Rust application, and a C or Haxe application through `flight-ffi`, can open a window, receive input, run frames and present a Flight scene. Proves scenario G3.

## Model

**The host produces capabilities; the consumer borrows them.** Nothing here is constructed from C.

```
host = create_winit_host(options)
window / app-loop / lifecycle / screen / input-ingress / wgpu capabilities ← borrowed from host
loop:
    pump_winit_host(host)              // delivers window and input events into the SDK
    step_app_loop(app, dt, options)    // the consumer's frame, called by name
    prepare / begin pass / render / end pass / submit / present
destroy_winit_host(host)
```

- **`pump` is the primitive.** The consumer owns the loop; no callback crosses the ABI. Returns whether the host is still alive.
- **`run`** also exists: blocks, owns the loop, calls a per-frame function. Through the FFI this takes `fn` + `ctx` on the existing callback contract. It is the path for platforms where the OS must own the loop and for smooth live-resize.
- Everything runs on the thread that created the host. State that in the header.

## This is not a port

The archived crate at `github.com/flighthq/flight-rs-v1port` (`crates/flighthq-host-winit`, about 1,300 lines) predates the capability model. It implements `ScreenBackend` and `WindowBackend` traits, installs them with `set_*_backend` singletons, and dispatches into an `InputManager` directly. None of that structure exists now. It is the project's own earlier code, so reuse is fine, but only these parts carry over:

- `input_translation.rs` — winit key, button, wheel and location mapping tables;
- `bootstrap.rs` — the surface sequence: `instance.create_surface(Arc<Window>)`, adapter, device, non-sRGB format selection, `surface.configure`;
- `frame.rs` — acquire texture, present, `pre_present_notify`.

Known defects there not to carry over: adapter failure panics; a failed `get_current_texture` is ignored without reconfiguring the surface; Back/Forward mouse buttons are dropped.

## What to build

1. **Crate** `crates/flight-host-winit`, winit 0.30, outside `flight-sdk`, not in `default-members`.
2. **Capabilities filled** (current struct names; verify each against the source before writing):
   - `HostWindowCapabilities` (`flight-app/src/window_types.rs:330`) — fill the slots winit supports; leave the rest `None`. Geometry, title, visibility, fullscreen, cursor, close at minimum. List what is filled and what is not.
   - `HostAppLoopCapability { now, request_frame, cancel_frame }` (`flight-app/src/loop_types.rs:108`) — `request_frame` callbacks run from the host's frame point, in both pump and run modes.
   - `HostLifecycleCapability` — resumed/suspended, focus, close-requested.
   - Screen capability — monitors and scale factor.
   - `HostInputIngressCapability` (`flight-input/src/types.rs:302`) — keyboard, pointer, wheel, text input, with modifiers. Events go to the `InputIngressSink` the SDK hands over at attach. Gamepad is not available from winit; leave that slot unfilled and say so.
   - `HostWgpuCapability` (`flight-surface/src/types.rs:282`) and the surface capabilities needed by `create_wgpu_screen_render_target` — acquisition resolves immediately from the host's own device.
   - Whatever else Item E's host-side carrier list names.
3. **Surface lifecycle.** Resize reconfigures and drives `sync_wgpu_screen_render_target_extent`. Lost or outdated surface on acquire reconfigures and retries on the next frame. Scale-factor change is handled. Zero-size (minimised) windows skip presenting.
4. **API verbs.** `create_winit_host`, `pump_winit_host`, `run_winit_host`, `destroy_winit_host`, and borrowed getters for each capability. `explain_*` for creation failure. No module-level state, no singletons.
5. **Pump caveats.** winit's pump mode is unavailable on some platforms and stalls during live resize on others. Document per platform what works; where pump is unavailable, `pump_winit_host` reports that through its sentinel and `explain_*`, and `run` is the supported path.
6. **FFI feature** `host-winit` on `flight-ffi`, same rules as Item F: default build byte-identical; with the feature, the crate is scanned and the capability carriers become producible. The reachability gate with this feature on should show the roughly 390 capability-consuming functions it covers as reachable; report the count and what remains blocked on capabilities this host does not provide.
7. **Examples**, both tiny:
   - Rust: window, a few shapes and a sprite, pointer moves one of them, Escape closes. Uses the pump loop.
   - C: the same through `flight-ffi` with the feature.

## Tests

- Unit tests for input translation (pure functions).
- Scenario **G3**: open a window, run a fixed number of frames, close, no leaks. It needs a display, so it is a local/manual gate; make it runnable under a virtual display and say whether CI can do that. Without a display it reports skipped.
- The C example builds in CI even if it cannot run.

## Not in scope

- GL on winit.
- Multiple windows beyond what the capability structs require to be coherent; if `open` cannot be supported, leave the slot `None`.
- Mobile targets.
- `flight-host-sdl` (Item I).
- Capability construction from C.

## Acceptance

- Both examples run on the developer platform; G3 passes locally.
- A filled/unfilled capability table is in the crate's docs.
- Default `flight-ffi` build unchanged; root `cargo build` does not compile winit.
- Reachability report with the feature on, delivered with the handoff.
- `cargo fmt`, lint, tests.

## Dependencies

The Rust half (crate, capabilities, surface lifecycle, verbs, Rust example) depends on nothing and can start now. The FFI half (feature, reachability report, C example) needs Items B and E. See [pass 2](pass-2.md). Geometry values crossing the host boundary should be `f64` where the f64 record says so; check the state of Task P/Q for the crates you touch.
