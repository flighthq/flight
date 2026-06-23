//! Software shape rasterization: fills resolved `ShapeFillRegion`s into the
//! pixmap with the node's transform, alpha, and blend mode. Models the solid-fill
//! path of TS `@flighthq/displayobject-canvas` (`beginFill` -> `fill`), but over
//! tiny-skia's `fill_path` instead of Canvas2D.
//!
//! `ShapeFillRegion` is solid-color by design (see `@flighthq/types`
//! `ShapeFillRegion`): it carries a `Path`, a packed color, and an alpha. Gradient
//! and bitmap fills and strokes are *not* expressed as regions in the
//! authoritative spec — a shape that uses them falls back to the raster path
//! upstream, so this renderer never sees them. This module therefore only
//! rasterizes solid fills, exactly matching the region contract.
//!
//! Most blend modes go through tiny-skia's paint blend mode. The two Flash modes
//! tiny-skia cannot express exactly (`Subtract`, `Invert`) take a CPU composite
//! pass that matches `@flighthq/surface`'s `surfaceComposite` per-channel math;
//! see [`crate::skia_blend`].

use flighthq_types::ShapeFillRegion;
use tiny_skia::{FillRule, Paint, Path as SkiaPath, Pixmap, PremultipliedColorU8, Transform};

use crate::skia_blend::{SkiaBlendStrategy, resolve_skia_blend_strategy};
use crate::skia_color::create_skia_color;
use crate::skia_path::{build_skia_path, resolve_skia_fill_rule};
use crate::skia_render_state::{SkiaRenderState, current_skia_clip};
use crate::skia_transform::create_skia_transform;

/// Rasterizes every solid-fill region of a shape into the pixmap using the draw
/// context the walk published (`render_transform_2d`, `render_alpha`,
/// `render_blend_mode`). Each region's color is combined with the region alpha
/// and the node alpha; degenerate (empty) region paths are skipped, matching
/// tiny-skia's refusal to fill zero-area paths.
///
/// `Subtract` and `Invert` rasterize the region into a scratch layer and
/// composite it onto the destination on the CPU (tiny-skia has no faithful paint
/// mode for either); every other mode fills directly with the resolved paint
/// blend mode.
pub fn draw_skia_shape_fill(state: &mut SkiaRenderState, regions: &[ShapeFillRegion]) {
    let transform = create_skia_transform(&state.render_transform_2d.unwrap_or_default());
    let node_alpha = state.render_alpha;
    let strategy = resolve_skia_blend_strategy(state.render_blend_mode);

    for region in regions {
        let Some(path) = build_skia_path(&region.path) else {
            continue;
        };
        let fill_rule = resolve_skia_fill_rule(region.path.winding);
        let color = create_skia_color(region.color, node_alpha * region.alpha);

        match strategy {
            SkiaBlendStrategy::Paint(blend) => {
                let mut paint = Paint::default();
                paint.set_color(color);
                paint.blend_mode = blend;
                paint.anti_alias = true;

                // current_skia_clip borrows state immutably; clone the mask out so
                // the borrow does not overlap the &mut pixmap fill below.
                let clip = current_skia_clip(state).cloned();
                state
                    .pixmap
                    .fill_path(&path, &paint, fill_rule, transform, clip.as_ref());
            }
            SkiaBlendStrategy::CpuSubtract => composite_skia_cpu_blend(
                state,
                &path,
                fill_rule,
                transform,
                color,
                subtract_channel,
            ),
            SkiaBlendStrategy::CpuInvert => {
                composite_skia_cpu_blend(state, &path, fill_rule, transform, color, invert_channel)
            }
        }
    }
}

/// Composites a filled path onto the destination pixmap using a CPU per-channel
/// blend, for the modes tiny-skia's paint blend set cannot express. The fill is
/// rasterized into a transparent scratch `Pixmap` with `SourceOver` (reusing
/// tiny-skia for anti-aliasing, the node transform, and the active clip), then
/// blended into the destination pixel by pixel with the exact `surfaceComposite`
/// W3C source-over math.
///
/// `blend_channel` is the separable per-channel function on straight `0..=255`
/// values (`cb` backdrop, `cs` source), matching `@flighthq/surface`'s
/// `blendChannel`.
fn composite_skia_cpu_blend(
    state: &mut SkiaRenderState,
    path: &SkiaPath,
    fill_rule: FillRule,
    transform: Transform,
    color: tiny_skia::Color,
    blend_channel: fn(i32, i32) -> i32,
) {
    let width = state.pixmap.width();
    let height = state.pixmap.height();
    let Some(mut scratch) = Pixmap::new(width, height) else {
        return;
    };

    let mut paint = Paint::default();
    paint.set_color(color);
    paint.blend_mode = tiny_skia::BlendMode::SourceOver;
    paint.anti_alias = true;
    let clip = current_skia_clip(state).cloned();
    scratch.fill_path(path, &paint, fill_rule, transform, clip.as_ref());

    let src = scratch.pixels();
    let dst = state.pixmap.pixels_mut();
    for i in 0..dst.len() {
        let blended = blend_skia_pixel(dst[i], src[i], blend_channel);
        dst[i] = blended;
    }
}

/// Blends one premultiplied source pixel over one premultiplied destination
/// pixel with the separable `blend_channel` and W3C source-over compositing,
/// matching `surfaceComposite::compositePixelInto`. Both inputs are tiny-skia
/// premultiplied; the result is premultiplied for storage back into the pixmap.
fn blend_skia_pixel(
    dst: PremultipliedColorU8,
    src: PremultipliedColorU8,
    blend_channel: fn(i32, i32) -> i32,
) -> PremultipliedColorU8 {
    let (r, g, b, src_a) = demultiply(src);
    if src_a == 0 {
        return dst;
    }
    let (cb_r, cb_g, cb_b, dst_a) = demultiply(dst);

    let src_af = src_a as f32 / 255.0;
    let dst_af = dst_a as f32 / 255.0;
    let out_a = src_af + dst_af * (1.0 - src_af);
    if out_a <= 0.0 {
        return PremultipliedColorU8::from_rgba(0, 0, 0, 0).unwrap();
    }

    let cs_r = (1.0 - dst_af) * r as f32 + dst_af * blend_channel(cb_r as i32, r as i32) as f32;
    let cs_g = (1.0 - dst_af) * g as f32 + dst_af * blend_channel(cb_g as i32, g as i32) as f32;
    let cs_b = (1.0 - dst_af) * b as f32 + dst_af * blend_channel(cb_b as i32, b as i32) as f32;

    let out_r = ((cs_r * src_af + cb_r as f32 * dst_af * (1.0 - src_af)) / out_a).round();
    let out_g = ((cs_g * src_af + cb_g as f32 * dst_af * (1.0 - src_af)) / out_a).round();
    let out_b = ((cs_b * src_af + cb_b as f32 * dst_af * (1.0 - src_af)) / out_a).round();
    let out_a_u8 = (out_a * 255.0).round().clamp(0.0, 255.0) as u8;

    // Re-premultiply the straight result for pixmap storage.
    premultiply(
        out_r.clamp(0.0, 255.0) as u8,
        out_g.clamp(0.0, 255.0) as u8,
        out_b.clamp(0.0, 255.0) as u8,
        out_a_u8,
    )
}

/// `Subtract`: per channel `max(0, cb - cs)` (`@flighthq/surface` `Subtract`).
fn subtract_channel(cb: i32, cs: i32) -> i32 {
    (cb - cs).max(0)
}

/// `Invert`: per channel `255 - cb`, independent of the source channel
/// (`@flighthq/surface` `Invert`).
fn invert_channel(cb: i32, _cs: i32) -> i32 {
    255 - cb
}

/// Demultiplies a premultiplied tiny-skia pixel into straight `0..=255` channels
/// `(r, g, b, a)`, rounding to match the surface read path.
fn demultiply(p: PremultipliedColorU8) -> (u8, u8, u8, u8) {
    let a = p.alpha();
    if a == 0 {
        return (0, 0, 0, 0);
    }
    if a == 0xff {
        return (p.red(), p.green(), p.blue(), 0xff);
    }
    let af = a as u32;
    let r = ((p.red() as u32 * 255 + af / 2) / af).min(255) as u8;
    let g = ((p.green() as u32 * 255 + af / 2) / af).min(255) as u8;
    let b = ((p.blue() as u32 * 255 + af / 2) / af).min(255) as u8;
    (r, g, b, a)
}

/// Premultiplies straight `0..=255` channels back into a tiny-skia pixel.
fn premultiply(r: u8, g: u8, b: u8, a: u8) -> PremultipliedColorU8 {
    let af = a as u32;
    let pr = ((r as u32 * af + 127) / 255) as u8;
    let pg = ((g as u32 * af + 127) / 255) as u8;
    let pb = ((b as u32 * af + 127) / 255) as u8;
    PremultipliedColorU8::from_rgba(pr, pg, pb, a)
        .unwrap_or_else(|| PremultipliedColorU8::from_rgba(0, 0, 0, 0).unwrap())
}

#[cfg(test)]
mod tests {
    use flighthq_types::Path;
    use flighthq_types::blend::BlendMode;
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

    fn full_region(color: u32) -> ShapeFillRegion {
        ShapeFillRegion {
            path: Path {
                commands: vec![
                    path_command::MOVE_TO,
                    path_command::LINE_TO,
                    path_command::LINE_TO,
                    path_command::LINE_TO,
                    path_command::LINE_TO,
                ],
                data: vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0, 0.0, 0.0],
                winding: PathWinding::NonZero,
            },
            color,
            alpha: 1.0,
        }
    }

    // Fills the whole 10x10 canvas with an opaque backdrop, so a pixel outside
    // the later blend box still has a backdrop to be (or not be) blended into.
    fn fill_backdrop(state: &mut SkiaRenderState, color: u32) {
        state.render_transform_2d = Some(Matrix::default());
        state.render_blend_mode = None;
        draw_skia_shape_fill(state, &[full_region(color)]);
        state.render_blend_mode = None;
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

    #[test]
    fn draw_skia_shape_fill_add_brightens_backdrop() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        fill_backdrop(&mut state, 0x202020ff);
        state.render_blend_mode = Some(BlendMode::Add);
        draw_skia_shape_fill(&mut state, &[box_region(0x303030ff, 1.0)]);
        // Plus over an opaque backdrop sums channels: 0x20 + 0x30 = 0x50.
        let c = pixel(&state, 5, 5);
        assert_eq!(c[0], 0x50, "r {:?}", c);
        assert_eq!(c[3], 0xff);
    }

    #[test]
    fn draw_skia_shape_fill_invert_inverts_opaque_backdrop() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        // Opaque mid-gray backdrop. Invert is source-independent: out = 255 - dst.
        fill_backdrop(&mut state, 0x40c080ff);
        state.render_blend_mode = Some(BlendMode::Invert);
        // Source color is irrelevant to the invert channel; coverage is what
        // matters. Fill the full box.
        draw_skia_shape_fill(&mut state, &[box_region(0x000000ff, 1.0)]);
        let c = pixel(&state, 5, 5);
        assert_eq!(c[0], 0xff - 0x40, "r {:?}", c);
        assert_eq!(c[1], 0xff - 0xc0, "g {:?}", c);
        assert_eq!(c[2], 0xff - 0x80, "b {:?}", c);
        assert_eq!(c[3], 0xff);
    }

    #[test]
    fn draw_skia_shape_fill_invert_leaves_uncovered_backdrop() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        fill_backdrop(&mut state, 0x40c080ff);
        state.render_blend_mode = Some(BlendMode::Invert);
        draw_skia_shape_fill(&mut state, &[box_region(0x000000ff, 1.0)]);
        // (0,0) is outside the 1..9 box, so it keeps the original backdrop.
        let c = pixel(&state, 0, 0);
        assert_eq!(c, [0x40, 0xc0, 0x80, 0xff]);
    }

    #[test]
    fn draw_skia_shape_fill_subtract_darkens_opaque_backdrop() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        // Opaque backdrop 0x80 per channel.
        fill_backdrop(&mut state, 0x808080ff);
        state.render_blend_mode = Some(BlendMode::Subtract);
        // Subtract 0x30 per channel: max(0, 0x80 - 0x30) = 0x50.
        draw_skia_shape_fill(&mut state, &[box_region(0x303030ff, 1.0)]);
        let c = pixel(&state, 5, 5);
        assert_eq!(c[0], 0x50, "r {:?}", c);
        assert_eq!(c[1], 0x50, "g {:?}", c);
        assert_eq!(c[2], 0x50, "b {:?}", c);
        assert_eq!(c[3], 0xff);
    }

    #[test]
    fn draw_skia_shape_fill_subtract_clamps_to_zero() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        // Dark backdrop; subtracting a brighter source clamps to 0 (unlike
        // Difference, which would reflect |dst - src|).
        fill_backdrop(&mut state, 0x202020ff);
        state.render_blend_mode = Some(BlendMode::Subtract);
        draw_skia_shape_fill(&mut state, &[box_region(0x808080ff, 1.0)]);
        let c = pixel(&state, 5, 5);
        assert_eq!(c[0], 0x00, "r {:?}", c);
        assert_eq!(c[1], 0x00, "g {:?}", c);
        assert_eq!(c[2], 0x00, "b {:?}", c);
        assert_eq!(c[3], 0xff);
    }

    #[test]
    fn draw_skia_shape_fill_subtract_leaves_uncovered_backdrop() {
        let mut state = create_skia_render_state(10, 10).expect("state");
        fill_backdrop(&mut state, 0x808080ff);
        state.render_blend_mode = Some(BlendMode::Subtract);
        draw_skia_shape_fill(&mut state, &[box_region(0x303030ff, 1.0)]);
        let c = pixel(&state, 0, 0);
        assert_eq!(c, [0x80, 0x80, 0x80, 0xff]);
    }
}
