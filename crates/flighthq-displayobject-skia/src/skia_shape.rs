//! Software shape rasterization: fills resolved `ShapeFillRegion`s into the
//! pixmap with the node's transform, alpha, and blend mode. Models the solid-fill
//! path of TS `@flighthq/displayobject-canvas` (`beginFill` -> `fill`), but over
//! tiny-skia's `fill_path` instead of Canvas2D. Gradient and bitmap fills are
//! resolved upstream into separate regions; see TODO(align).

use flighthq_types::ShapeFillRegion;
use tiny_skia::Paint;

use crate::skia_blend::resolve_skia_blend_mode;
use crate::skia_color::create_skia_color;
use crate::skia_path::{build_skia_path, resolve_skia_fill_rule};
use crate::skia_render_state::{SkiaRenderState, current_skia_clip};
use crate::skia_transform::create_skia_transform;

/// Rasterizes every solid-fill region of a shape into the pixmap using the draw
/// context the walk published (`render_transform_2d`, `render_alpha`,
/// `render_blend_mode`). Each region's color is combined with the region alpha
/// and the node alpha; degenerate (empty) region paths are skipped, matching
/// tiny-skia's refusal to fill zero-area paths.
pub fn draw_skia_shape_fill(state: &mut SkiaRenderState, regions: &[ShapeFillRegion]) {
    let transform = create_skia_transform(&state.render_transform_2d.unwrap_or_default());
    let node_alpha = state.render_alpha;
    let blend = resolve_skia_blend_mode(state.render_blend_mode);

    for region in regions {
        let Some(path) = build_skia_path(&region.path) else {
            continue;
        };
        let fill_rule = resolve_skia_fill_rule(region.path.winding);

        let mut paint = Paint::default();
        paint.set_color(create_skia_color(region.color, node_alpha * region.alpha));
        paint.blend_mode = blend;
        paint.anti_alias = true;

        // current_skia_clip borrows state immutably; take the mask by cloning the
        // borrow into the call below. We cannot hold the borrow across the &mut
        // pixmap call, so resolve the clip slice index first.
        let clip = current_skia_clip(state).cloned();
        state
            .pixmap
            .fill_path(&path, &paint, fill_rule, transform, clip.as_ref());
    }
}

#[cfg(test)]
mod tests {
    use flighthq_types::Path;
    use flighthq_types::geometry::Matrix;
    use flighthq_types::misc::path_command;
    use flighthq_types::node_types::PathWinding;

    use super::*;
    use crate::skia_render_state::create_skia_render_state;

    fn box_region(color: u32, alpha: f32) -> ShapeFillRegion {
        ShapeFillRegion {
            path: Path {
                commands: vec![
                    path_command::MOVE_TO,
                    path_command::LINE_TO,
                    path_command::LINE_TO,
                    path_command::LINE_TO,
                    path_command::LINE_TO,
                ],
                data: vec![1.0, 1.0, 9.0, 1.0, 9.0, 9.0, 1.0, 9.0, 1.0, 1.0],
                winding: PathWinding::NonZero,
            },
            color,
            alpha,
        }
    }

    fn pixel(state: &SkiaRenderState, x: u32, y: u32) -> [u8; 4] {
        let p = state.pixmap.pixel(x, y).expect("pixel").demultiply();
        [p.red(), p.green(), p.blue(), p.alpha()]
    }

    #[test]
    fn draw_skia_shape_fill_paints_interior_pixel() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        state.render_transform_2d = Some(Matrix::default());
        state.render_alpha = 1.0;
        draw_skia_shape_fill(&mut state, &[box_region(0xff0000ff, 1.0)]);
        // Center of the 1..9 box should be opaque red.
        let c = pixel(&state, 5, 5);
        assert_eq!(c[0], 0xff);
        assert_eq!(c[1], 0x00);
        assert_eq!(c[2], 0x00);
        assert_eq!(c[3], 0xff);
    }

    #[test]
    fn draw_skia_shape_fill_leaves_outside_transparent() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        state.render_transform_2d = Some(Matrix::default());
        draw_skia_shape_fill(&mut state, &[box_region(0xff0000ff, 1.0)]);
        let c = pixel(&state, 0, 0);
        assert_eq!(c[3], 0x00);
    }

    #[test]
    fn draw_skia_shape_fill_respects_node_alpha() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        state.render_transform_2d = Some(Matrix::default());
        state.render_alpha = 0.5;
        draw_skia_shape_fill(&mut state, &[box_region(0x00ff00ff, 1.0)]);
        let c = pixel(&state, 5, 5);
        // Half alpha over transparent -> ~0x80 alpha.
        assert!(c[3] >= 0x7d && c[3] <= 0x83, "alpha was {}", c[3]);
    }
}
