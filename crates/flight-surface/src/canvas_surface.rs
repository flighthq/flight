//! flight-compiler: target-native

//! Canvas 2D surface allocation and context acquisition (TS `canvasSurface.ts`).

use flight_app::contract::AppWindow;
use flight_entity::Ref;
use flight_host::NativeSurfaceHandle;

use crate::surface::allocate_surface;
use crate::types::*;

/// Allocates a drawable in the given window and acquires a 2D context (TS `createCanvasSurface`).
// flight-lint: allow(f64) the canvas width and height are the TS Number device-pixel extent, carried as f64 for exact transport; the host narrows and validates them once where it writes its device extent (foreman-536d86b7, foreman-f740c531)
pub fn create_canvas_surface(
    capability: &HostCanvasCapability,
    window: &Ref<AppWindow>,
    width: f64,
    height: f64,
    options: Option<&CanvasRenderingContext2DSettings>,
) -> Option<Ref<CanvasSurface>> {
    let handle = (capability.create)(window, width, height, options);
    if handle.is_none() {
        return None;
    }
    return create_canvas_surface_from_native_handle(capability, handle, options);
}

/// Acquires a 2D context on a drawable the caller already owns (TS
/// `createCanvasSurfaceFromNativeHandle`). The caller keeps ownership of the drawable.
pub fn create_canvas_surface_from_native_handle(
    capability: &HostCanvasCapability,
    handle: Option<NativeSurfaceHandle>,
    options: Option<&CanvasRenderingContext2DSettings>,
) -> Option<Ref<CanvasSurface>> {
    let surface: Ref<CanvasSurface> = allocate_surface(handle);
    let erased: SurfaceRef = surface.clone();
    let context = (capability.acquire)(&erased, options)?;
    surface.write().unwrap().context = context;
    return Some(surface);
}

/// Releases the surface through the capability (TS `destroyCanvasSurface`).
pub fn destroy_canvas_surface(capability: &HostCanvasCapability, surface: &Ref<CanvasSurface>) {
    let erased: SurfaceRef = surface.clone();
    return (capability.release)(&erased);
}
