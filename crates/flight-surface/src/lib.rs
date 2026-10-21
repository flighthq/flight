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

// flight-lint: conform-skip(createGlSurface, createGlSurfaceFromNativeHandle, destroyGlSurface, createWgpuSurface, createWgpuSurfaceFromNativeHandle, destroyWgpuSurface, createCanvasSurface, createCanvasSurfaceFromNativeHandle, destroyCanvasSurface, resizeSurface, setSurfaceDisplaySize) deferred pending Principal scope rulings (reported, not silent): glSurface/wgpuSurface final ownership in render-gl/render-wgpu per WP9, named CanvasRenderingContext2D host mapping, and the common Surface callback representation
