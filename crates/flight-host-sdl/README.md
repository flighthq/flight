# flight-host-sdl

`flight-host-sdl` is Flight's opt-in SDL3 desktop host. It owns one SDL context, window, event
pump, real gamepad handles, and exactly one renderer backend selected when the host is created:
`SdlHostRenderBackend::Wgpu` or `SdlHostRenderBackend::Gl`. Applications borrow the host's
capability records and use its one canonical `SurfaceRef`; they do not manufacture capability
records or a second native surface.

SDL 3 is pinned, built from source, and statically linked. The crate is a workspace member but is
not a default member, has `publish = false`, and is explicitly excluded from default workspace
test, clippy, package, and release-check jobs. A root `cargo build`, the default `flight-ffi`, npm
scripts, and default CI therefore do not acquire SDL, CMake, or a C compiler. Select the crate with
`-p flight-host-sdl` only on a machine prepared for native SDL development.

This crate is the Rust-only Item I host. It deliberately contains no `flight-ffi` feature, generated
header, or C example.

## Capability table

| Contract | Filled | Borrowed getter | Notes |
| --- | --- | --- | --- |
| `HostWindowCapabilities.appearance` | yes | `get_sdl_host_window_appearance_capability` | queued title change; icon and opacity remain unavailable |
| `focus` | yes | `get_sdl_host_window_focus_capability` | queued raise/focus request |
| `fullscreen` | yes | `get_sdl_host_window_fullscreen_capability` | queued SDL fullscreen change |
| `geometry` | yes | `get_sdl_host_window_geometry_capability` | snapshot bounds; queued center/position/size; move/resize listeners |
| `lifecycle` | yes | `get_sdl_host_window_lifecycle_capability` | one-window open/configure, close, and close-request veto/subscription |
| `size_constraints` | yes | `get_sdl_host_window_size_constraints_capability` | queued minimum/maximum size and resizability |
| `state` | yes | `get_sdl_host_window_state_capability` | queued maximize/minimize/restore |
| `visibility` | yes | `get_sdl_host_window_visibility_capability` | queued show/hide; visibility subscription is unavailable |
| `z_order` | yes | `get_sdl_host_window_z_order_capability` | queued normal/always-on-top |
| `attach`, `attention`, `content_protection`, `hierarchy`, `progress`, `shadow`, `shell` | no | — | intentionally matches the accepted winit host leaf set |
| `HostAppLoopCapability` | yes | `get_sdl_host_app_loop_capability` | monotonic milliseconds; request/cancel callbacks run at pump/run frame points |
| `HostLifecycleCapability` | yes | `get_sdl_host_lifecycle_capability` | regular launch plus active/inactive/background/terminating events; memory warning is unavailable |
| `HostScreenCapabilities.query` | yes | `get_sdl_host_screen_query_capability` | snapshot-backed displays, primary display, and cursor position |
| screen `change`, `details`, `permission_change` | no | — | no portable SDL implementation |
| `HostSurfaceCapabilities.display` | yes | `get_sdl_host_surface_display_capability` | queued logical display-size change |
| `HostSurfaceCapabilities.resize` | yes | `get_sdl_host_surface_resize_capability` | live device extent and creator-thread backend reconfiguration |
| `HostInputIngressCapability` | all six attach functions | `get_sdl_host_input_ingress_capability` | keyboard, pointer/touch, relative pointer, text, wheel, and real gamepad ingress |
| `HostWgpuCapabilities.context` | wgpu hosts only | `get_sdl_host_wgpu_capability` | raw-handle surface, acquisition, attachment, live extent, release |
| `WgpuDevice` | wgpu hosts only | `get_sdl_host_wgpu_device` | host-owned device borrow |
| `HostGlCapabilities.context` | GL hosts only | `get_sdl_host_gl_capability` | canonical drawable and `GlContextToken`; loss fires on teardown |

The aggregate wgpu and GL getters always exist. Only the selected renderer leaf exists, so backend
absence is observable and callers cannot use one SDL window concurrently as two swapchains. Every
filled leaf, native handle, input source, and canonical surface carries the same provider identity.
All returned borrows remain valid only while their `SdlHost` remains alive.

## Pump, threading, and process state

`pump_sdl_host` applies queued capability commands, polls SDL events, refreshes snapshots, and runs
one frame point. `run_sdl_host` repeats that primitive until exit. `SdlPumpStatus` has only
`Continue` and `Exit`; `explain_sdl_pump_status` and `explain_sdl_host_failure` are stable and do not
depend on SDL's ambient last-error state.

SDL video/event/window values remain in a non-`Send` native owner on the creating thread. Capability
closures retain only a Send/Sync provider state containing snapshots, listeners, atomics, and a
mutex command queue. Create, pump, run, destroy, GL make-current, and GL present reject the wrong
thread. SDL initialization is process-global in this implementation: creating a second live host
returns a typed `SdlHostFailureKind::Sdl` failure. A new host may be created after the first is
destroyed.

Keyboard translation uses actual Flight `KEY_CODE_*` constants, DOM `key`/`code` strings, and a
zero/`Unidentified` sentinel for unknown values. SDL display names are never exposed as logical key
names. Modifiers, caps/num locks, persistent pointer-button state, event wheel position and flipped
direction, relative motion, committed/composing text, scaled touch contacts, millisecond timestamps,
and dense nonnegative gamepad IDs are translated explicitly. Open gamepad handles remain alive until
disconnect, and devices already open are announced when a gamepad sink attaches.
Gamepad buttons use the SDK's `GamepadMapping::Standard` indices. Analog triggers use a `0.5`
pressed threshold, retain the normalized value carried by each threshold-crossing record, and emit
down/up only when that threshold state changes. SDL text input starts when the first text attachment
becomes active and stops when the last attachment releases.

## Renderer ownership and teardown

The wgpu surface uses SDL's raw display/window handles. The native owner is the only strong owner of
the unsafe surface wrapper; capabilities and canvas contexts hold weak references and fail closed
after shutdown begins. The surface is unconfigured and dropped before the SDL window, so the raw
handles outlive every wgpu use.

GL hosts request desktop core GL 3.3 on Windows/Linux and core 4.1 forward-compatible GL on macOS,
with attributes frozen before window creation. `make_sdl_host_gl_context_current` must precede
unsafe `create_gl_context`, and `present_sdl_host_gl` must run on the creator thread after draw
framebuffer zero is rebound. Desktop core GL has no default vertex array; the current Flight
Scene2D GL writers use the application's bound VAO, as `pump_gl` demonstrates. Render state, targets,
the VAO, the `glow::Context`, and the acquired token must be destroyed before the host.

Shutdown first marks the provider dead, clears callbacks and attachments, and fires GL lost
listeners. It then drops the sole strong wgpu owner, releases/drops the SDL GL context, closes
gamepads and the event pump, drops the window, then drops subsystems and SDL. `SdlNativeState::Drop`
repeats this explicit `Option::take` order for ordinary Rust unwinding.

SDL is asked for an sRGB-capable framebuffer. Mesa GLX under Xvfb can advertise sRGB yet reject the
matching window visual; on that exact error the host retries the same core context with a linear
default framebuffer and prints a stable diagnostic. This is a virtual-display limitation, not a
silent context downgrade. `power_preference` has no portable SDL GL mapping,
`preserve_drawing_buffer` cannot be guaranteed for a native window, and swap-interval refusal is
tolerated.

## Native prerequisites

The `sdl3` `build-from-source-static` feature needs CMake, a working C compiler, and make or Ninja.
Linux windowed builds also need the SDL development dependencies for X11 or Wayland, xkbcommon,
DRM/GBM, Mesa GL/GLES/EGL, udev, and dbus as appropriate. Display-backed wgpu tests need a Vulkan
loader/driver such as Mesa lavapipe. macOS needs Xcode Command Line Tools; Windows needs Visual
Studio C++ Build Tools and the Windows SDK. Mobile targets and SDL audio are intentionally absent.

The exact Ubuntu review environment was installed with:

```sh
sudo apt-get install -y cmake ninja-build pkg-config xvfb xauth valgrind xdotool libgl1-mesa-dri libegl1 libegl-dev libgl-dev libgles-dev libx11-dev libxext-dev libxrandr-dev libxcursor-dev libxi-dev libxss-dev libxfixes-dev libxtst-dev libxkbcommon-dev libwayland-dev libdrm-dev libgbm-dev libudev-dev libdbus-1-dev mesa-utils
```

## Examples and display gates

Both examples render the same visible bitmap-sprite scene, attach pointer, keyboard, and gamepad
input, exit on Escape/window close, and honor `FLIGHT_SDL_EXAMPLE_FRAMES` for unattended runs:

```sh
env -u WAYLAND_DISPLAY LIBGL_ALWAYS_SOFTWARE=1 WGPU_BACKEND=vulkan \
  FLIGHT_SDL_EXAMPLE_FRAMES=8 xvfb-run -a \
  cargo run -p flight-host-sdl --example pump_wgpu

env -u WAYLAND_DISPLAY LIBGL_ALWAYS_SOFTWARE=1 \
  FLIGHT_SDL_EXAMPLE_FRAMES=8 xvfb-run -a \
  cargo run -p flight-host-sdl --example pump_gl
```

The display-backed tests report an explicit skip if neither `DISPLAY` nor `WAYLAND_DISPLAY` exists.
`i3_sdl_wgpu_test` performs real present/capture and resize recovery; `i3_sdl_gl_test` creates the
token/state/target, renders, reads pixels, and swaps; `i3_sdl_reference_test` renders pixel-aligned
Scene2D sprites through wgpu capture and a GL texture target. The parity gate compares premultiplied
RGBA after GL row normalization at tolerance zero over every pixel, requires exact
interior/background sentinels, and carries probes that reject a one-row normalization error, a
one-pixel sprite shift, and a seven-step channel change. The GL gate also pins the Xvfb fallback's
default-framebuffer value and verifies that the attachment reports sRGB encoding while
`FRAMEBUFFER_SRGB` remains disabled.

## Intentionally duplicated from flight-host-winit

Item I keeps the two hosts independent so the capability model is proved not to be winit-shaped.
These accepted blocks are duplicated and adapted rather than prematurely extracted:

- public options/failure/pump enums, stable explain functions, creator-thread checks, and explicit
  root reexports;
- input attachment/release, close subscription, and listener machinery;
- app-loop frame allocation, request/cancel storage, monotonic clock, and frame-point drain;
- provider identity plus canonical source/surface/native-handle identity checks;
- the common filled/absent window capability builder;
- lifecycle snapshots/subscriptions and screen/surface capability builders;
- live wgpu extent, acquisition/attachment validation, device/context plumbing, and shared canvas
  helpers;
- borrowed aggregate/leaf/device/source/surface getter families;
- example scene construction, renderer registration, input attachment, frame loop, and explicit
  teardown pattern.

SDL-only code remains separate: its command queue, initialization/window/event pump, event and
gamepad translations, gamepad retention, raw-handle extraction, and GL context/token/present path.

The intentional duplicate inventory below pins the matching implementation entry points after the
lint-ordered Item I repair. Line numbers are source evidence for review, not a promise of API
stability.

| Shared block | SDL location | winit location |
| --- | --- | --- |
| lifecycle capability builder | `crates/flight-host-sdl/src/sdl_host.rs:496` | `crates/flight-host-winit/src/winit_host.rs:316` |
| active-listener release | `crates/flight-host-sdl/src/sdl_host.rs:1053` | `crates/flight-host-winit/src/winit_host.rs:760` |
| app-loop getter | `crates/flight-host-sdl/src/sdl_host.rs:1214` | `crates/flight-host-winit/src/winit_host.rs:836` |
| input-ingress getter | `crates/flight-host-sdl/src/sdl_host.rs:1229` | `crates/flight-host-winit/src/winit_host.rs:841` |
| lifecycle getter | `crates/flight-host-sdl/src/sdl_host.rs:1239` | `crates/flight-host-winit/src/winit_host.rs:851` |
| native-window getter | `crates/flight-host-sdl/src/sdl_host.rs:1244` | `crates/flight-host-winit/src/winit_host.rs:856` |
| screen aggregate getter | `crates/flight-host-sdl/src/sdl_host.rs:1249` | `crates/flight-host-winit/src/winit_host.rs:861` |
| surface aggregate getter | `crates/flight-host-sdl/src/sdl_host.rs:1259` | `crates/flight-host-winit/src/winit_host.rs:873` |
| window aggregate getter | `crates/flight-host-sdl/src/sdl_host.rs:1300` | `crates/flight-host-winit/src/winit_host.rs:909` |
| live presentation surface | `crates/flight-host-sdl/src/sdl_host.rs:1356` | `crates/flight-host-winit/src/winit_host.rs:973` |
| enabled input-sink collection | `crates/flight-host-sdl/src/sdl_host.rs:1601` | `crates/flight-host-winit/src/winit_host.rs:1146` |
| canonical surface identity | `crates/flight-host-sdl/src/sdl_host.rs:1619` | `crates/flight-host-winit/src/winit_host.rs:1164` |
