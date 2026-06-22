//! The software render state: a tiny-skia `Pixmap` whose RGBA layout matches a
//! `flighthq-surface` buffer 1:1, plus the per-kind renderer registry and the
//! current draw context (resolved transform/alpha/blend) and clip-mask stack the
//! draw walk publishes for each node.

use std::collections::HashMap;

use flighthq_types::blend::BlendMode;
use flighthq_types::geometry::Matrix;
use flighthq_types::kind::KindId;
use tiny_skia::{Mask, Pixmap};

/// The software leaf renderer selected for a kind. The walk dispatches on this
/// rather than a boxed trait object so the registry stays a plain value map
/// (mirroring `flighthq-displayobject-wgpu`'s `WgpuRendererSlot`).
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum SkiaRendererSlot {
    /// Plain container: no geometry of its own, traverses children.
    Container,
    /// Bitmap: blit a pixel source as a transformed quad.
    Bitmap,
    /// Shape: rasterize solid-fill regions.
    Shape,
}

/// Software render state for the tiny-skia backend. Owns the destination
/// `Pixmap` that primitives rasterize into; capture reads its RGBA bytes
/// directly into a `flighthq-surface` buffer with no GPU readback.
pub struct SkiaRenderState {
    /// The destination raster target. Its `data()` is premultiplied RGBA8;
    /// `read_skia_surface` demultiplies it to the straight-alpha
    /// `flighthq-surface` convention.
    pub pixmap: Pixmap,
    /// Background color used to clear the pixmap before a frame, packed
    /// `0xRRGGBBAA`.
    pub background_color: u32,
    /// Per-kind renderer selection. Insert replaces, matching the TS registry.
    pub renderers: HashMap<KindId, SkiaRendererSlot>,
    /// The node transform published by the walk before each draw.
    pub render_transform_2d: Option<Matrix>,
    /// The node opacity published by the walk before each draw.
    pub render_alpha: f32,
    /// The node blend mode published by the walk before each draw.
    pub render_blend_mode: Option<BlendMode>,
    /// Active clip masks, innermost last. `current_skia_clip` returns the top.
    pub clip_stack: Vec<Mask>,
}

/// Allocates a software render state sized `width` x `height`. Returns `None`
/// when the dimensions are zero or exceed tiny-skia's limits.
pub fn create_skia_render_state(width: u32, height: u32) -> Option<SkiaRenderState> {
    Pixmap::new(width, height).map(|pixmap| SkiaRenderState {
        pixmap,
        background_color: 0x00000000,
        renderers: HashMap::new(),
        render_transform_2d: None,
        render_alpha: 1.0,
        render_blend_mode: None,
        clip_stack: Vec::new(),
    })
}

/// Returns the innermost active clip mask, or `None` when no clip is pushed.
/// The shape/bitmap draws pass this to tiny-skia as the raster clip.
pub fn current_skia_clip(state: &SkiaRenderState) -> Option<&Mask> {
    state.clip_stack.last()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_skia_render_state_allocates_pixmap() {
        let state = create_skia_render_state(4, 3).expect("state");
        assert_eq!(state.pixmap.width(), 4);
        assert_eq!(state.pixmap.height(), 3);
        assert_eq!(state.render_alpha, 1.0);
        assert!(state.renderers.is_empty());
    }

    #[test]
    fn create_skia_render_state_zero_returns_none() {
        assert!(create_skia_render_state(0, 0).is_none());
    }

    #[test]
    fn current_skia_clip_none_when_empty() {
        let state = create_skia_render_state(2, 2).expect("state");
        assert!(current_skia_clip(&state).is_none());
    }
}
