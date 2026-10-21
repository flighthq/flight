//! The passive drawable rectangle a scene renders into (TS `viewport.ts`).

use flight_entity::allocate_entity;

use crate::types::*;

/// Allocates a viewport at a zero-origin rect with unit device-pixel ratio (TS `createViewport`);
/// assign the rect after create (D23 B).
// flight-lint: allow(conform-params) D23 (B) zero-field create (Principal 21f7557f, foreman-a8ca6cf2): assign the rect and device-pixel ratio after create
pub fn create_viewport() -> Viewport {
    let mut out: Viewport = allocate_entity();
    initialize_viewport(&mut out);
    return out;
}

/// Resets a viewport to the zero-origin, zero-size rect at unit device-pixel ratio (TS
/// `initializeViewport`).
// flight-lint: allow(conform-params) D23 (B) zero-field initializer (Principal 21f7557f, foreman-a8ca6cf2)
pub fn initialize_viewport(out: &mut Viewport) {
    out.device_pixel_ratio = 1.0;
    out.height = 0.0;
    out.width = 0.0;
    out.x = 0.0;
    out.y = 0.0;
}

/// The viewport's aspect ratio, or 1 for a degenerate zero-height rect (TS `getViewportAspect`).
pub fn get_viewport_aspect(viewport: &Viewport) -> f32 {
    return if viewport.height != 0.0 {
        viewport.width / viewport.height
    } else {
        1.0
    };
}
