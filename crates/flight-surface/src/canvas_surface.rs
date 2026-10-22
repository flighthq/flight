//! Canvas 2D surface allocation and context acquisition (TS `canvasSurface.ts`).

use flight_app::contract::AppWindow;
use flight_entity::Ref;
use flight_host::NativeSurfaceHandle;

use crate::surface::allocate_surface;
use crate::types::*;

/// Allocates a drawable in the given window and acquires a 2D context (TS `createCanvasSurface`).
pub fn create_canvas_surface(
    capability: &HostCanvasCapability,
    window: &Ref<AppWindow>,
    width: f32,
    height: f32,
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
