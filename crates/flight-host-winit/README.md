# flight-host-winit

`flight-host-winit` is Flight's native winit 0.30 host. It owns one window, its wgpu surface and
device, and its event loop. An application borrows the host's capability records; it never builds
those records itself. The crate is a workspace member but is intentionally outside the workspace
`default-members`, so a root `cargo build` does not compile winit.

All host verbs and all borrowed capabilities must be used on the thread that called
`create_winit_host`. There is no module-level state or process singleton.

## Capability table

| Contract | Filled | Borrowed getter | Notes |
| --- | --- | --- | --- |
| `HostWindowCapabilities.appearance` | yes | `get_winit_host_window_appearance_capability` | title; icon and opacity remain unavailable |
| `focus` | yes | `get_winit_host_window_focus_capability` | focus request |
| `fullscreen` | yes | `get_winit_host_window_fullscreen_capability` | borderless fullscreen on the current monitor |
| `geometry` | yes | `get_winit_host_window_geometry_capability` | bounds, position, size, centering, move/resize subscriptions |
| `lifecycle` | yes | `get_winit_host_window_lifecycle_capability` | open/configure, close, close-request subscription |
| `size_constraints` | yes | `get_winit_host_window_size_constraints_capability` | minimum/maximum inner size and resizability |
| `state` | yes | `get_winit_host_window_state_capability` | maximize, minimize, restore |
| `visibility` | yes | `get_winit_host_window_visibility_capability` | show/hide; winit has no portable visibility-change notification |
| `z_order` | yes | `get_winit_host_window_z_order_capability` | normal/always-on-top |
| `attach`, `content_protection`, `hierarchy`, `progress`, `shadow`, `shell` | no | — | no coherent portable one-window implementation in this host |
| cursor mutation | no slot | — | the current `HostWindowCapabilities` contract has no cursor facet |
| `HostAppLoopCapability` | yes | `get_winit_host_app_loop_capability` | monotonic `now`; request/cancel callbacks run at pump and run frame points |
| `HostLifecycleCapability` | yes | `get_winit_host_lifecycle_capability` | active/inactive/background plus resumed/suspended/focus notifications |
| `HostScreenCapabilities.query` | yes | `get_winit_host_screen_query_capability` | monitor enumeration, current monitor, scale factor, tracked cursor position |
| screen change/details/permission | no | — | winit exposes no portable permission or monitor-change subscription |
| `HostInputIngressCapability` | yes | `get_winit_host_input_ingress_capability` | keyboard, pointer/touch, relative pointer, wheel, committed/composing text |
| gamepad ingress | inert | — | the SDK field is required, but winit has no gamepad API; attach returns an inert release |
| `HostSurfaceCapabilities.display` | yes | `get_winit_host_surface_display_capability` | logical display-size requests |
| `HostSurfaceCapabilities.resize` | yes | `get_winit_host_surface_resize_capability` | backing-size reconfiguration |
| `HostWgpuCapability` | yes | `get_winit_host_wgpu_capability` | immediate acquisition, surface attachment and live extent |

`create_winit_host_surface` returns an owned clone of the host's one canonical `SurfaceRef`; callers
may release their clone independently. `get_winit_host_wgpu_device` borrows the host-owned device.
All capability and device borrows remain valid only while the `WinitHost` remains alive, and every
filled leaf carries the same provider identity as the host's surface and device.

The host chooses a non-sRGB presentation format when the adapter offers one. Resize and scale-factor
events update the live presentation extent and reconfigure the surface. A zero-sized (minimized)
window keeps its last valid surface configuration and reports a zero live extent, so Flight skips
presentation until a nonzero resize arrives. Flight's render-target code reconfigures and retries on
the frame after an outdated or lost acquisition.

## Pump and run

`pump_winit_host` is the primitive for Windows, Linux, macOS and Android. It uses a zero-duration
winit pump and returns `WinitPumpStatus`; after the event loop has been consumed it returns
`Unavailable`, whose diagnostic points callers to `run_winit_host`.

Winit documents pump mode as unavailable on Web and iOS. It also warns that macOS rendering outside
the synchronous redraw callback can show resize artifacts and that the macOS global application is
stopped between pumps. The blocking `run_winit_host` path is therefore the portable choice where
the OS must own the loop or live-resize behavior matters. Pump and run both execute scheduled
`HostAppLoopCapability::request_frame` callbacks at the host frame point.

## Example and G3

The Rust pump example is:

```sh
cargo run -p flight-host-winit --example pump
```

Set `FLIGHT_WINIT_EXAMPLE_FRAMES` to a positive frame count for an unattended smoke run; otherwise
the example closes on Escape.

The display-backed G3 smoke test runs a fixed frame count and closes the host. It reports a skipped
test when neither `DISPLAY` nor `WAYLAND_DISPLAY` is present. On Linux it can run under a virtual
display:

```sh
env -u WAYLAND_DISPLAY xvfb-run -a cargo test -p flight-host-winit --test g3_winit_test -- --nocapture
```

CI can run the same gate when its Linux image supplies Xvfb, `libxkbcommon-x11`, and a wgpu
adapter such as Mesa lavapipe. Runners without those display/GPU packages should keep G3 as an
explicit manual gate rather than treating the no-display skip as a presentation pass.

The later Item G FFI half owns the `flight-ffi` feature, header section, reachability report, and C
example; none of those are part of this crate.
