//! `flighthq-host-winit` — the winit + wgpu host for the Flight scene graph.
//!
//! This crate is a runtime-coupled, non-tree-shakable adapter: it owns the
//! winit event loop, the OS window, the wgpu GPU surface, and the per-frame
//! render protocol, and it fills the `*Backend` seams (`WindowBackend`,
//! `ScreenBackend`) the rest of the SDK exposes. Host-specific external deps
//! (`winit`, `pollster`, `raw-window-handle`, and `wgpu` with native backends)
//! live in this crate's own manifest, not the workspace dependency table.
//!
//! # Quick start
//!
//! ```no_run
//! use flighthq_host_winit::{WinitAppConfig, run_winit_app};
//!
//! let mut scene_setup = |state: &mut flighthq_host_winit::WgpuRenderState,
//!                        _input: &mut flighthq_host_winit::InputManager| -> u64 {
//!     // Build your display-object scene, return the stage's source id.
//!     let _ = state;
//!     0
//! };
//! let mut frame_update = |_dt: f32,
//!                        _state: &mut flighthq_host_winit::WgpuRenderState,
//!                        _input: &mut flighthq_host_winit::InputManager| {
//!     // Advance animation; run prepare_display_object_render over the scene.
//! };
//!
//! run_winit_app(WinitAppConfig::default(), &mut scene_setup, &mut frame_update);
//! ```
//!
//! # The render frame protocol
//!
//! Each frame mirrors the TS render-webgpu flow: the user's `frame_update` runs
//! the update pass (`flighthq_render::prepare_display_object_render`), then
//! [`frame::render_winit_frame`] acquires the surface texture, points the render
//! pass at its view via `flighthq_render_wgpu::set_wgpu_frame_target_view`, and
//! calls `render_wgpu_background`, `render_wgpu_display_object(stage)`, and
//! `submit_wgpu_render_pass` before presenting the surface texture. The render
//! pass draws straight into the swapchain image — no capture texture or blit.

pub mod app;
pub mod bootstrap;
pub mod frame;
pub mod input_translation;
pub mod screen_backend;
pub mod window_backend;

// app
pub use app::{
    HostWinitApp, WinitAppConfig, WinitFrameUpdate, WinitSceneSetup, create_winit_app,
    run_winit_app,
};

// bootstrap
pub use bootstrap::{HostWinitSurface, create_winit_surface, resize_winit_surface};

// frame
pub use frame::render_winit_frame;

// input_translation
pub use input_translation::{
    build_winit_keyboard_data, build_winit_pointer_data, is_winit_press,
    translate_winit_mouse_button, translate_winit_named_key, translate_winit_scroll_delta,
    winit_key_location_index, winit_key_name, winit_mouse_button_mask,
};

// screen_backend
pub use screen_backend::{
    WinitScreenBackend, build_winit_screen_info, convert_winit_monitor,
    create_winit_screen_backend, set_winit_screen_backend,
};

// window_backend
pub use window_backend::{
    WinitWindowBackend, create_winit_window_backend, set_winit_window_backend,
};

// Re-export the foreign types that appear in this crate's public API so callers
// reach them without a separate dependency edge.
pub use flighthq_input::InputManager;
pub use flighthq_render_wgpu::{WgpuRenderOptions, WgpuRenderState};
