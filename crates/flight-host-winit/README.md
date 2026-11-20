# flight-host-winit

`flight-host-winit` is Flight's native winit 0.30 host. It owns one window, its wgpu surface and
device, and its event loop. An application borrows the host's capability records; it never builds
those records itself. The crate is a workspace member but is intentionally outside the workspace
`default-members`, so a root `cargo build` does not compile winit.

All host verbs and all borrowed capabilities must be used on the thread that called
`create_winit_host`. There is no module-level state or process singleton, but winit allows exactly
one event loop per process: a second `create_winit_host`, including one after `destroy_winit_host`,
fails with `WinitHostFailureKind::EventLoop` ("EventLoop can't be recreated"). Create one host per
process and keep it for the process lifetime.

## Destroy and held capabilities

`destroy_winit_host` releases the wgpu surface and then the native window, and pumps the still-live
event loop so the display server destroys the window before the loop is dropped. A host that is
dropped without `destroy_winit_host` releases the same way. When `run_winit_host` returns, its
consumed loop has already released the window.

Capability records cloned out of the host stay valid values after destroy, and every one of them
fails closed: window verbs do nothing, `get_bounds` leaves its output untouched, `request_frame`
returns handle 0 and never schedules, `is_supported` is false, `create` and `attach_surface` return
`None`, and `acquire` returns an error. Acquisitions and surface contexts held past destroy reach
the surface only through a liveness check and skip their frames. The native-window, input-source
and surface handles carry an identity token, not the window, so retaining them cannot keep the
window alive. A `WgpuDevice` clone keeps the GPU device itself alive, which is safe without a
surface.

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
| `attach`, `attention`, `content_protection`, `hierarchy`, `progress`, `shadow`, `shell` | no | — | no coherent portable one-window implementation in this host |
| cursor mutation | no slot | — | the current `HostWindowCapabilities` contract has no cursor facet |
| `HostAppLoopCapability` | yes | `get_winit_host_app_loop_capability` | monotonic `now`; request/cancel callbacks run at pump and run frame points |
| `HostLifecycleCapability` | yes | `get_winit_host_lifecycle_capability` | active/inactive/background plus resumed/suspended/focus notifications |
| `HostScreenCapabilities.query` | yes | `get_winit_host_screen_query_capability` | monitor enumeration, current monitor, scale factor, tracked cursor position; on Wayland no monitor is marked primary because winit reports no current monitor there |
| screen change/details/permission | no | — | winit exposes no portable permission or monitor-change subscription |
| `HostInputIngressCapability` | yes | `get_winit_host_input_ingress_capability` | keyboard, pointer/touch, relative pointer, wheel, committed/composing text (IME is allowed while a text attachment is active) |
| gamepad ingress | inert | — | the SDK field is required, but winit has no gamepad API; attach returns an inert release |
| `HostSurfaceCapabilities.display` | yes | `get_winit_host_surface_display_capability` | logical display-size requests |
| `HostSurfaceCapabilities.resize` | yes | `get_winit_host_surface_resize_capability` | backing-size reconfiguration |
| `HostWgpuCapability` | yes | `get_winit_host_wgpu_capability` | immediate acquisition, surface attachment and live extent |

The host owns exactly one window, so the window capabilities act on it whatever `AppWindow` record
the caller passes.

`create_winit_host_surface` returns an owned clone of the host's one canonical `SurfaceRef`; callers
may release their clone independently. `get_winit_host_wgpu_device` borrows the host-owned device.
All capability and device borrows remain valid only while the `WinitHost` remains alive, and every
filled leaf carries the same provider identity as the host's surface and device.

The host chooses a non-sRGB presentation format when the adapter offers one. Resize and scale-factor
events update the live presentation extent and reconfigure the surface. A zero-sized (minimized)
window keeps its last valid surface configuration and reports a zero live extent, so Flight skips
presentation until a nonzero resize arrives. Flight's render-target code reconfigures and retries on
the frame after an outdated or lost acquisition.

## Input translation

Keyboard records follow the web host's DOM conventions and its key-code tables exactly: `code` is the
DOM code (`MetaLeft`/`MetaRight` for winit's Super keys), `key` is the DOM key value for every winit
named key, and `key_code` comes from the physical code, then a single character, then the logical
key, as the web host derives it. A modifier key's own keydown reports that modifier held and its
keyup reports it released. winit 0.30 exposes no lock-key state, so `caps_lock` and `num_lock` are
always false.

Text ingress follows DOM input semantics. IME is allowed on the window while at least one text
attachment is active and disallowed when the last one is released; composition (`Ime::Preedit`)
goes to `text_edit` and committed text to `text_input`. Key text containing control characters, or
typed with Ctrl (without Alt, so AltGr text still commits) or Meta held, is not committed.

Wheel records carry the pointer position and DOM signs: `delta_y` is positive for wheel-down and
`delta_x` positive for scrolling right, in lines or pixels as winit reports them.

## Pump and run

`pump_winit_host` is the primitive for Windows, Linux, macOS and Android. It uses a zero-duration
winit pump and returns `WinitPumpStatus`; after the event loop has been consumed it returns
`Unavailable`, whose diagnostic points callers to `run_winit_host`.

Winit documents pump mode as unavailable on Web and iOS. It also warns that macOS rendering outside
the synchronous redraw callback can show resize artifacts and that the macOS global application is
stopped between pumps. The blocking `run_winit_host` path is therefore the portable choice where
the OS must own the loop or live-resize behavior matters. Pump and run both execute scheduled
`HostAppLoopCapability::request_frame` callbacks at the host frame point.

## Example

The Rust pump example opens a window with two rectangles and a sprite:

```sh
cargo run -p flight-host-winit --example pump
```

Pointer motion drags the red rectangle and Escape closes the window. Set
`FLIGHT_WINIT_EXAMPLE_FRAMES` to a positive frame count for an unattended run. The Rust render path
picks up a moved node only after `invalidate_node_local_transform`, so the example's `scene.rs`
invalidates each move explicitly.
