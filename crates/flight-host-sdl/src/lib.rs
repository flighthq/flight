#![doc = include_str!("../README.md")]

mod input_translation;
mod sdl_host;

pub use input_translation::*;

pub mod contract;

pub use contract::SdlHost;
pub use contract::SdlHostFailure;
pub use contract::SdlHostFailureKind;
pub use contract::SdlHostOptions;
pub use contract::SdlHostRenderBackend;
pub use contract::SdlPumpStatus;
pub use contract::create_sdl_host;
pub use contract::create_sdl_host_options;
pub use contract::create_sdl_host_surface;
pub use contract::destroy_sdl_host;
pub use contract::explain_sdl_host_failure;
pub use contract::explain_sdl_pump_status;
pub use contract::get_sdl_host_app_loop_capability;
pub use contract::get_sdl_host_gl_capabilities;
pub use contract::get_sdl_host_gl_capability;
pub use contract::get_sdl_host_input_ingress_capability;
pub use contract::get_sdl_host_input_source;
pub use contract::get_sdl_host_lifecycle_capability;
pub use contract::get_sdl_host_native_window;
pub use contract::get_sdl_host_screen_capabilities;
pub use contract::get_sdl_host_screen_query_capability;
pub use contract::get_sdl_host_surface_capabilities;
pub use contract::get_sdl_host_surface_display_capability;
pub use contract::get_sdl_host_surface_resize_capability;
pub use contract::get_sdl_host_wgpu_capabilities;
pub use contract::get_sdl_host_wgpu_capability;
pub use contract::get_sdl_host_wgpu_device;
pub use contract::get_sdl_host_window_appearance_capability;
pub use contract::get_sdl_host_window_capabilities;
pub use contract::get_sdl_host_window_focus_capability;
pub use contract::get_sdl_host_window_fullscreen_capability;
pub use contract::get_sdl_host_window_geometry_capability;
pub use contract::get_sdl_host_window_lifecycle_capability;
pub use contract::get_sdl_host_window_size_constraints_capability;
pub use contract::get_sdl_host_window_state_capability;
pub use contract::get_sdl_host_window_visibility_capability;
pub use contract::get_sdl_host_window_z_order_capability;
pub use contract::make_sdl_host_gl_context_current;
pub use contract::present_sdl_host_gl;
pub use contract::pump_sdl_host;
pub use contract::run_sdl_host;
