//! `flighthq-host-sdl` — SDL2 host for the Flight scene graph.
//!
//! A runtime-coupled, non-tree-shakable host adapter that owns the window, the
//! event loop, the wgpu GPU surface, and the input seam, and drives the
//! `flighthq-render-wgpu` per-frame render protocol. It is the SDL2 sibling of
//! the winit host: the same scene `setup`/`update` closures run under either,
//! which is what proves the backend seam.
//!
//! # Layers
//!
//! * [`app`] — [`run_sdl_app`], the run entry: window + event loop + per-frame
//!   protocol, parameterized by caller scene closures.
//! * [`render_frame`] — wgpu surface creation from the SDL window and the
//!   background → display-object → submit → present frame sequence.
//! * [`event`] — SDL event translation into `flighthq-input` dispatch. The pure
//!   builder layer is unit-tested on CPU; the live `sdl2::event::Event` adapter
//!   runs only inside a real event loop.
//!
//! # Side effects
//!
//! Nothing runs at module load. The window, GPU device, and event loop are all
//! created inside [`run_sdl_app`] (or the explicit `create_*` functions), so
//! importing this crate is inert, matching the SDK's side-effect-free rule.
//! Concrete renderers are registered by the caller's `setup` closure, not here.

pub mod app;
pub mod event;
pub mod render_frame;

pub use app::{SdlAppOptions, SdlFrame, run_sdl_app};
pub use event::{
    build_sdl_keyboard_data, build_sdl_pointer_data, build_sdl_wheel_data, dispatch_sdl_event,
    sdl_button_to_dom_button,
};
pub use render_frame::{
    SdlRenderContext, create_sdl_render_context, render_sdl_frame, resize_sdl_render_context,
};
