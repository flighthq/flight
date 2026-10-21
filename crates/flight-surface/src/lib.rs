//! Drawable surface entity: an opaque host-native handle retained on the private runtime, so
//! portable layers can name no canvas, GL, wgpu or platform type. No native backend or context is
//! created here; the display-size and resize seams forward through explicit host capabilities.

mod surface;
mod types;

pub mod contract;

pub use contract::allocate_surface;
pub use contract::get_surface_handle;
pub use contract::get_surface_runtime;

pub use contract::NativeSurfaceHandle;
pub use contract::Surface;
pub use contract::SurfaceRuntime;
