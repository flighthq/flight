//! Software text rendering — stub.
//!
//! TODO(align): text rasterization is blocked on the `text-shaping` seam
//! (`set_text_shaper`) and the shaped-run header types that land in TS first
//! (see `tools/agents/docs/rust/text.md`). The canonical software stack is
//! rustybuzz (shape) + ttf-parser (font outlines) + tiny-skia (raster), sharing
//! the glyph rasterizer with shape rendering. Until the shaper seam exists, the
//! draw walk has nothing layout-correct to rasterize, so this is a no-op that
//! preserves the registration/draw seam. `ttf-parser` is already a dependency so
//! the outline path can be filled in here without a manifest change.

use crate::skia_render_state::SkiaRenderState;

/// Rasterizes a text node into the pixmap. No-op until the text-shaping seam is
/// available; see the module TODO(align).
pub fn draw_skia_text(_state: &mut SkiaRenderState, _source_id: u64) {
    // TODO(align): shape glyphs via the text-shaping seam, fetch outlines via
    // ttf-parser, fill them with tiny-skia using the node's draw context.
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skia_render_state::create_skia_render_state;

    #[test]
    fn draw_skia_text_is_a_noop_stub() {
        let mut state = create_skia_render_state(2, 2).expect("state");
        draw_skia_text(&mut state, 0);
        // Stub draws nothing: the pixmap stays transparent.
        assert!(state.pixmap.data().iter().all(|&b| b == 0));
    }
}
