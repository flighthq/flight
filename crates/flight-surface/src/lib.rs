//! Drawable surface entity: an opaque host-native handle retained on the private runtime, a D16
//! surface trait preserving derived-object identity through `Ref<dyn Surface>`, the surface-owned
//! canvas context seam, and explicit display/resize capabilities. No renderer, native context or
//! platform access lives here.

mod canvas_surface;
mod surface;
mod surface_display;
mod types;

pub mod contract;

// flight-lint: conform-skip(createGlSurface, createGlSurfaceFromNativeHandle, destroyGlSurface) final ownership (Principal f5929ea4 batch13, D8) moves glSurface functions and the GlSurface/HostGl/GlContext types to flight-render-gl; this crate carries no renderer implementation
// flight-lint: conform-skip(createWgpuSurface, createWgpuSurfaceFromNativeHandle, destroyWgpuSurface) final ownership (Principal f5929ea4 batch13, D8) moves wgpuSurface functions and the WgpuSurface/HostWgpu/Acquisition types to flight-render-wgpu; this crate carries no renderer implementation

pub use contract::allocate_surface;
pub use contract::create_canvas_surface;
pub use contract::create_canvas_surface_from_native_handle;
pub use contract::destroy_canvas_surface;
pub use contract::get_surface_handle;
pub use contract::get_surface_runtime;
pub use contract::resize_surface;
pub use contract::set_surface_display_size;

pub use contract::CanvasColorSpace;
pub use contract::CanvasRenderingContext2D;
pub use contract::CanvasRenderingContext2DSettings;
pub use contract::CanvasSurface;
pub use contract::HostCanvasCapability;
pub use contract::HostSurfaceDisplayCapability;
pub use contract::HostSurfaceResizeCapability;
pub use contract::NativeSurfaceHandle;
pub use contract::Surface;
pub use contract::SurfaceBase;
pub use contract::SurfaceBaseMethods;
pub use contract::SurfaceFields;
pub use contract::SurfaceRef;
pub use contract::SurfaceRuntime;
