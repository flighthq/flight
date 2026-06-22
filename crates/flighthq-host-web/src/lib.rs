//! `flighthq-host-web` — the browser (wasm) host for the Flight SDK.
//!
//! A host crate is a runtime-coupled, non-tree-shakable adapter: it owns the
//! event loop, the `<canvas>`, the GPU surface, and fills the platform
//! `*Backend` seams with browser implementations. This crate targets
//! `wasm32-unknown-unknown` and is built for the web with `wasm-pack`. It is
//! **not** re-exported from `@flighthq/sdk` — an application links it in the
//! page that boots the SDK.
//!
//! # What this crate provides
//!
//! - [`create_web_host`] / [`resize_web_host`] / [`render_web_host_frame`] /
//!   [`destroy_web_host`]: acquire a `<canvas>`, create a `wgpu::Surface`
//!   targeting it, request an adapter/device asynchronously, and run the
//!   render frame protocol (mirroring `render-webgpu`'s flow) per
//!   `requestAnimationFrame`. The host points the render pass at the surface's
//!   current texture view (`set_wgpu_frame_target_view`) and draws straight into
//!   the live canvas — the same present seam `host-winit` / `host-sdl` use.
//! - [`attach_web_input`] / [`detach_web_input`]: translate DOM pointer,
//!   wheel, and keyboard events into [`flighthq_input`] dispatch calls. The
//!   pure translation functions are unit-testable on native targets.
//! - [`WebStorageBackend`] + [`set_web_storage_backend`]: a genuine
//!   `localStorage`-backed implementation of the synchronous storage seam.
//! - Clipboard and filesystem (OPFS): documented `TODO(host-web)` stubs. Their
//!   seams are *async* and require `Send` futures, which browser JS futures are
//!   not; see [`clipboard`] and [`filesystem`] for the async-bridge plan.
//!
//! # Frame protocol
//!
//! Per `render-webgpu`, each frame the host:
//! 1. acquires the surface's current texture and a `TextureView`,
//! 2. points the frame's color attachment at that view via
//!    `set_wgpu_frame_target_view`,
//! 3. `render_wgpu_background` clears, then the caller-supplied `draw_scene`
//!    closure runs the scene-graph prepare pass and `render_wgpu_display_object`
//!    walk (the application owns the arena and id-graph closures),
//! 4. `submit_wgpu_render_pass` then `present()`.
//!
//! Renderers are registered once at startup via the `register_wgpu_*` family;
//! nothing is registered at module load.

#![cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]

pub mod clipboard;
pub mod filesystem;
pub mod input;
pub mod storage;

#[cfg(target_arch = "wasm32")]
pub mod host;

// ---------------------------------------------------------------------------
// Public re-exports — the host API surface.
// ---------------------------------------------------------------------------

pub use input::{
    WebKeyboardEvent, WebPointerEvent, WebWheelEvent, web_keyboard_event_to_input_keyboard_data,
    web_pointer_event_to_input_pointer_data, web_wheel_event_to_input_pointer_data,
};
pub use storage::{WebStorageBackend, create_web_storage_backend, set_web_storage_backend};

#[cfg(target_arch = "wasm32")]
pub use input::{WebInputListeners, attach_web_input, detach_web_input};

#[cfg(target_arch = "wasm32")]
pub use host::{
    WebHost, WebHostOptions, create_web_host, destroy_web_host, render_web_host_frame,
    resize_web_host,
};
