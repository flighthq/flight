//! The passive drawable rectangle a scene renders into (TS `viewport.ts`).

use flight_entity::allocate_entity;

use crate::types::*;

/// Allocates a viewport at a zero-origin rect with unit device-pixel ratio (TS `createViewport`).
pub fn create_viewport(obj: Option<&ViewportOptions>) -> Viewport {
    let mut out: Viewport = allocate_entity();
    initialize_viewport(&mut out, obj);
    return out;
}

/// Initializes a viewport from optional overrides (TS `initializeViewport`).
pub fn initialize_viewport(out: &mut Viewport, obj: Option<&ViewportOptions>) {
    out.device_pixel_ratio = obj.and_then(|o| o.device_pixel_ratio).unwrap_or(1.0);
    out.height = obj.and_then(|o| o.height).unwrap_or(0.0);
    out.width = obj.and_then(|o| o.width).unwrap_or(0.0);
    out.x = obj.and_then(|o| o.x).unwrap_or(0.0);
    out.y = obj.and_then(|o| o.y).unwrap_or(0.0);
}

/// The viewport's aspect ratio, or 1 for a degenerate zero-height rect (TS `getViewportAspect`).
pub fn get_viewport_aspect(viewport: &Viewport) -> f32 {
    return if viewport.height != 0.0 {
        viewport.width / viewport.height
    } else {
        1.0
    };
}
