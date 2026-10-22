//! Drawable surface entity: an opaque host-native handle retained on the private runtime, a D16
//! surface trait preserving derived-object identity through `Ref<dyn Surface>`, the surface-owned
//! canvas context seam, and explicit display/resize capabilities. No renderer, native context or
//! platform access lives here.

mod canvas_surface;
mod host_explain;
mod surface;
mod surface_display;
mod types;
mod wgpu_host_acquisition;
mod window_render_state;

pub mod contract;

// flight-lint: conform-skip(createGlSurface, createGlSurfaceFromNativeHandle, destroyGlSurface) final ownership (Principal f5929ea4 batch13, D8) moves glSurface functions and the GlSurface/HostGl/GlContext types to flight-render-gl; this crate carries no renderer implementation
// flight-lint: conform-skip(createWgpuSurface, createWgpuSurfaceFromNativeHandle, destroyWgpuSurface) final ownership (Principal f5929ea4 batch13, D8) moves wgpuSurface functions and the WgpuSurface/HostWgpu/Acquisition types to flight-render-wgpu; this crate carries no renderer implementation

pub use contract::allocate_surface;
pub use contract::attach_window_render_state;
pub use contract::create_canvas_surface;
pub use contract::create_canvas_surface_from_native_handle;
pub use contract::create_wgpu_host_acquisition;
pub use contract::destroy_canvas_surface;
pub use contract::detach_window_render_state;
pub use contract::get_surface_handle;
pub use contract::get_surface_runtime;
pub use contract::initialize_wgpu_host_acquisition;
pub use contract::resize_surface;
pub use contract::set_surface_display_size;

pub use contract::CanvasColorSpace;
pub use contract::CanvasRenderingContext2DSettings;
pub use contract::CanvasSurface;
pub use contract::GlContextOptions;
pub use contract::GpuCanvasAlphaMode;
pub use contract::GpuPowerPreference;
pub use contract::GpuTextureFormat;
pub use contract::HostCanvasCapabilities;
pub use contract::HostCanvasCapability;
pub use contract::HostGlCapabilities;
pub use contract::HostGlCapability;
pub use contract::HostSurfaceCapabilities;
pub use contract::HostSurfaceDisplayCapability;
pub use contract::HostSurfaceResizeCapability;
pub use contract::HostWgpuCapabilities;
pub use contract::HostWgpuCapability;
pub use contract::Surface;
pub use contract::SurfaceBase;
pub use contract::SurfaceBaseMethods;
pub use contract::SurfaceFields;
pub use contract::SurfaceRef;
pub use contract::SurfaceRuntime;
pub use contract::WebGlContextAttributes;
pub use contract::WebGlPowerPreference;
pub use contract::WgpuHostAcquisition;
pub use contract::WgpuHostAcquisitionOptions;
pub use contract::WgpuHostAcquisitionOwnership;
pub use contract::WgpuPresentationSurface;
pub use contract::WgpuProviderFuture;
pub use contract::WgpuSurfaceAttachResult;
pub use contract::WgpuSurfaceAttachment;
