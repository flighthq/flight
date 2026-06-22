//! Software clip support: push/pop a node's local-space clip rectangle as a
//! tiny-skia `Mask` on the render state's clip stack. The shape/bitmap draws pass
//! the current mask to tiny-skia's raster clip. Models the `save`/`clip`/`restore`
//! bracket of TS `@flighthq/displayobject-canvas` (`canvasClipRectangle`), but as
//! an explicit mask stack rather than the Canvas2D state save/restore.

use flighthq_types::geometry::Matrix;
use tiny_skia::{FillRule, Mask, PathBuilder, Rect};

use crate::skia_render_state::SkiaRenderState;
use crate::skia_transform::create_skia_transform;

/// A node's local-space clip rectangle, the seam the walk passes to the clip
/// push (mirroring `WgpuClipRectangle` in the GPU backend).
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct SkiaClipRectangle {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Pushes a clip rectangle onto the state's clip stack. The rectangle is
/// projected through `transform` (the node's resolved 2D transform) and
/// intersected with any already-active clip, so nested clips compound. A
/// degenerate rectangle (zero or negative size) pushes a fully-masked-out clip,
/// matching the Flash semantic that an empty clip hides the subtree.
pub fn push_skia_clip_rectangle(
    state: &mut SkiaRenderState,
    clip: &SkiaClipRectangle,
    transform: &Matrix,
) {
    let width = state.pixmap.width();
    let height = state.pixmap.height();

    let mut mask = match state.clip_stack.last() {
        Some(existing) => existing.clone(),
        None => {
            let mut full = Mask::new(width, height).expect("clip mask");
            if let Some(rect) = Rect::from_xywh(0.0, 0.0, width as f32, height as f32) {
                full.fill_path(
                    &PathBuilder::from_rect(rect),
                    FillRule::Winding,
                    true,
                    tiny_skia::Transform::identity(),
                );
            }
            full
        }
    };

    if let Some(rect) = Rect::from_xywh(clip.x, clip.y, clip.width.max(0.0), clip.height.max(0.0)) {
        if clip.width > 0.0 && clip.height > 0.0 {
            mask.intersect_path(
                &PathBuilder::from_rect(rect),
                FillRule::Winding,
                true,
                create_skia_transform(transform),
            );
        } else {
            clear_skia_mask(&mut mask);
        }
    } else {
        clear_skia_mask(&mut mask);
    }

    state.clip_stack.push(mask);
}

/// Pops the innermost clip rectangle. No-op when the stack is empty.
pub fn pop_skia_clip_rectangle(state: &mut SkiaRenderState) {
    state.clip_stack.pop();
}

// Zeroes every coverage byte so the mask hides everything.
fn clear_skia_mask(mask: &mut Mask) {
    for byte in mask.data_mut() {
        *byte = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skia_render_state::{create_skia_render_state, current_skia_clip};

    #[test]
    fn push_skia_clip_rectangle_pushes_a_mask() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        let clip = SkiaClipRectangle {
            x: 2.0,
            y: 2.0,
            width: 4.0,
            height: 4.0,
        };
        push_skia_clip_rectangle(&mut state, &clip, &Matrix::default());
        assert!(current_skia_clip(&state).is_some());
        let mask = current_skia_clip(&state).unwrap();
        assert_eq!(mask.width(), 10);
        // Inside the clip is covered, outside is masked out.
        let stride = 10usize;
        assert_eq!(mask.data()[4 * stride + 4], 0xff);
        assert_eq!(mask.data()[0], 0x00);
    }

    #[test]
    fn pop_skia_clip_rectangle_removes_the_mask() {
        let mut state = create_skia_render_state(8, 8).expect("state");
        let clip = SkiaClipRectangle {
            x: 0.0,
            y: 0.0,
            width: 4.0,
            height: 4.0,
        };
        push_skia_clip_rectangle(&mut state, &clip, &Matrix::default());
        pop_skia_clip_rectangle(&mut state);
        assert!(current_skia_clip(&state).is_none());
    }

    #[test]
    fn push_skia_clip_rectangle_empty_masks_everything() {
        let mut state = create_skia_render_state(8, 8).expect("state");
        let clip = SkiaClipRectangle {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
        push_skia_clip_rectangle(&mut state, &clip, &Matrix::default());
        let mask = current_skia_clip(&state).unwrap();
        assert!(mask.data().iter().all(|&b| b == 0));
    }

    #[test]
    fn push_skia_clip_rectangle_nests_intersection() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        push_skia_clip_rectangle(
            &mut state,
            &SkiaClipRectangle {
                x: 0.0,
                y: 0.0,
                width: 6.0,
                height: 6.0,
            },
            &Matrix::default(),
        );
        push_skia_clip_rectangle(
            &mut state,
            &SkiaClipRectangle {
                x: 4.0,
                y: 4.0,
                width: 6.0,
                height: 6.0,
            },
            &Matrix::default(),
        );
        let mask = current_skia_clip(&state).unwrap();
        let stride = 10usize;
        // Overlap region (4..6, 4..6) is covered; (0,0) and (8,8) are not.
        assert_eq!(mask.data()[5 * stride + 5], 0xff);
        assert_eq!(mask.data()[0], 0x00);
        assert_eq!(mask.data()[8 * stride + 8], 0x00);
    }
}
