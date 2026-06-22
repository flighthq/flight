//! Backend-core element seam — mirrors the TS `wgpuElement` module.
//!
//! TS `createWgpuCanvasElement` allocates an `HTMLCanvasElement` sized by a pixel
//! ratio. That substrate (the DOM canvas) does not exist in the native box, so
//! this is a sentinel-returning seam (per the crate-existence rule): native hosts
//! own their own window/surface and never call it; the browser host
//! (`flighthq-host-web`) is where a real canvas element is created.

/// Logical dimensions of a backing render surface in CSS-equivalent pixels plus
/// the device pixel ratio, the value-typed result of the canvas-element seam.
///
/// The TS `createWgpuCanvasElement(width, height, pixelRatio)` returns an
/// `HTMLCanvasElement` whose `width`/`height` are `logical × pixelRatio`. There
/// is no DOM element to return natively, so the seam returns the resolved
/// backing pixel size instead, which a host can use to size an offscreen target.
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct WgpuCanvasElementSize {
    /// Logical (CSS) width in pixels.
    pub logical_width: u32,
    /// Logical (CSS) height in pixels.
    pub logical_height: u32,
    /// Backing-store width: `logical_width × pixel_ratio`.
    pub backing_width: u32,
    /// Backing-store height: `logical_height × pixel_ratio`.
    pub backing_height: u32,
}

/// Resolves the backing-store size a wgpu canvas element would have for the given
/// logical size and device pixel ratio. The native analogue of the TS
/// `createWgpuCanvasElement`: there is no DOM element to allocate in the box, so
/// the seam reports the backing pixel size a host should configure its surface to.
pub fn resolve_wgpu_canvas_element_size(
    width: u32,
    height: u32,
    pixel_ratio: f32,
) -> WgpuCanvasElementSize {
    let ratio = if pixel_ratio > 0.0 { pixel_ratio } else { 1.0 };
    WgpuCanvasElementSize {
        logical_width: width,
        logical_height: height,
        backing_width: ((width as f32) * ratio).round() as u32,
        backing_height: ((height as f32) * ratio).round() as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // resolve_wgpu_canvas_element_size

    #[test]
    fn resolve_wgpu_canvas_element_size_scales_backing_by_ratio() {
        let size = resolve_wgpu_canvas_element_size(200, 100, 2.0);
        assert_eq!(size.logical_width, 200);
        assert_eq!(size.logical_height, 100);
        assert_eq!(size.backing_width, 400);
        assert_eq!(size.backing_height, 200);
    }

    #[test]
    fn resolve_wgpu_canvas_element_size_defaults_ratio_to_one() {
        let size = resolve_wgpu_canvas_element_size(640, 480, 1.0);
        assert_eq!(size.backing_width, 640);
        assert_eq!(size.backing_height, 480);
    }

    #[test]
    fn resolve_wgpu_canvas_element_size_treats_nonpositive_ratio_as_one() {
        let size = resolve_wgpu_canvas_element_size(50, 50, 0.0);
        assert_eq!(size.backing_width, 50);
        assert_eq!(size.backing_height, 50);
    }
}
