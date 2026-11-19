//! flight-compiler: target-native

//! A windowless native host: one real wgpu device, a windowless presentation surface, and pixel
//! read-back through the SDK's own screen-target capture. It produces the carriers the SDK's wgpu
//! path borrows (the device and the wgpu capability) and builds no render target or read-back of
//! its own. Outside `flight-sdk` and outside the workspace's default members.

mod explain_headless_host;
mod explain_headless_screen_render_target_read_back;
mod headless_device;
mod headless_host;
mod headless_surface;
mod types;

pub mod contract;

pub use contract::HeadlessHost;
pub use contract::HeadlessHostExplanation;
pub use contract::HeadlessHostExplanationReason;
pub use contract::HeadlessHostOptions;
pub use contract::HeadlessHostPowerPreference;
pub use contract::HeadlessReadBackExplanation;
pub use contract::HeadlessReadBackExplanationReason;
pub use contract::create_bitmap_from_headless_screen_render_target;
pub use contract::create_headless_host;
pub use contract::create_headless_host_options;
pub use contract::create_headless_host_surface;
pub use contract::destroy_headless_host;
pub use contract::explain_headless_host;
pub use contract::explain_headless_screen_render_target_read_back;
pub use contract::get_headless_host_adapter_backend;
pub use contract::get_headless_host_adapter_name;
pub use contract::get_headless_host_wgpu_capability;
pub use contract::get_headless_host_wgpu_device;
pub use contract::is_headless_host_destroyed;
pub use contract::is_headless_host_software_adapter;
