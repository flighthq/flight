#![doc = include_str!("../README.md")]

mod input_translation;

pub use input_translation::*;

// The host implementation is added beside the independently testable translation seam.
mod winit_host;

pub mod contract;

pub use contract::WinitHost;
pub use contract::WinitHostFailure;
pub use contract::WinitHostFailureKind;
pub use contract::WinitHostOptions;
pub use contract::WinitPumpStatus;
pub use contract::create_winit_host;
pub use contract::create_winit_host_options;
pub use contract::create_winit_host_surface;
pub use contract::destroy_winit_host;
pub use contract::explain_winit_host_failure;
pub use contract::explain_winit_pump_status;
pub use contract::get_winit_host_app_loop_capability;
pub use contract::get_winit_host_input_ingress_capability;
pub use contract::get_winit_host_input_source;
pub use contract::get_winit_host_lifecycle_capability;
pub use contract::get_winit_host_native_window;
pub use contract::get_winit_host_screen_capabilities;
pub use contract::get_winit_host_screen_query_capability;
pub use contract::get_winit_host_surface_capabilities;
pub use contract::get_winit_host_surface_display_capability;
pub use contract::get_winit_host_surface_resize_capability;
pub use contract::get_winit_host_wgpu_capability;
pub use contract::get_winit_host_wgpu_device;
pub use contract::get_winit_host_window_appearance_capability;
pub use contract::get_winit_host_window_capabilities;
pub use contract::get_winit_host_window_focus_capability;
pub use contract::get_winit_host_window_fullscreen_capability;
pub use contract::get_winit_host_window_geometry_capability;
pub use contract::get_winit_host_window_lifecycle_capability;
pub use contract::get_winit_host_window_size_constraints_capability;
pub use contract::get_winit_host_window_state_capability;
pub use contract::get_winit_host_window_visibility_capability;
pub use contract::get_winit_host_window_z_order_capability;
pub use contract::pump_winit_host;
pub use contract::run_winit_host;
