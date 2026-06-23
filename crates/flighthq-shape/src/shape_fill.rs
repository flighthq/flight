//! Solid-fill region extraction from a `ShapeNode` command buffer.
//!
//! [`get_shape_fill_regions`] resolves the command stream into a list of
//! [`ShapeFillRegion`] values — one per `beginFill … endFill` span — that the
//! GPU solid-fill path can tessellate and render without a raster fallback.
//! Primitives are expanded into `MOVE`/`LINE`/`CURVE`/`CUBIC` verbs (curves are
//! kept for the renderer to flatten).
//!
//! Returns `None` when the command buffer contains any gradient fill, bitmap
//! fill, or stroke (`lineStyle`/`lineGradientStyle`/`lineBitmapStyle`), since
//! those require the raster path.

use flighthq_displayobject::DisplayObjectArena;
use flighthq_node::NodeId;
use flighthq_types::path_command;
use flighthq_types::{Path, PathWinding, ShapeFillRegion};

use crate::command_buffer::{AnyBox, read_f32, read_key, read_u32};
use crate::shape::get_shape_data;

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Resolves the shape's command buffer into solid-fill regions for the GPU
/// fill path.
///
/// Returns `None` when the buffer uses gradients, bitmap fills, or strokes
/// (any construct [`has_non_solid_shape_fill`] detects), since the GPU path
/// handles only plain solid fills. The returned list may be empty even when
/// `Some` is returned, for a shape whose commands produce no closed fill spans.
pub fn get_shape_fill_regions(
    arena: &DisplayObjectArena,
    source: NodeId,
) -> Option<Vec<ShapeFillRegion>> {
    let commands = &get_shape_data(arena, source)?.commands;
    if has_non_solid_shape_fill_buffer(commands) {
        return None;
    }

    let mut regions: Vec<ShapeFillRegion> = Vec::new();
    let mut path: Option<Path> = None;
    let mut color = 0u32;
    let mut alpha = 1.0f32;

    let mut i = 0;
    while i < commands.len() {
        let name = read_key(commands, i);
        let arg_count = read_arg_count(commands, i + 1);
        let a = i + 2;
        i = a + arg_count;

        match name {
            "beginFill" => {
                flush_region(&mut regions, path.take(), color, alpha);
                color = read_u32(commands, a);
                alpha = read_f32(commands, a + 1);
                path = Some(Path {
                    commands: Vec::new(),
                    data: Vec::new(),
                    winding: PathWinding::NonZero,
                });
            }
            "endFill" => {
                flush_region(&mut regions, path.take(), color, alpha);
            }
            "moveTo" => {
                if let Some(p) = path.as_mut() {
                    push_verb(
                        p,
                        path_command::MOVE_TO,
                        read_f32(commands, a),
                        read_f32(commands, a + 1),
                    );
                }
            }
            "lineTo" => {
                if let Some(p) = path.as_mut() {
                    push_verb(
                        p,
                        path_command::LINE_TO,
                        read_f32(commands, a),
                        read_f32(commands, a + 1),
                    );
                }
            }
            "curveTo" => {
                if let Some(p) = path.as_mut() {
                    push_quadratic(
                        p,
                        read_f32(commands, a),
                        read_f32(commands, a + 1),
                        read_f32(commands, a + 2),
                        read_f32(commands, a + 3),
                    );
                }
            }
            "cubicCurveTo" => {
                if let Some(p) = path.as_mut() {
                    push_cubic(
                        p,
                        read_f32(commands, a),
                        read_f32(commands, a + 1),
                        read_f32(commands, a + 2),
                        read_f32(commands, a + 3),
                        read_f32(commands, a + 4),
                        read_f32(commands, a + 5),
                    );
                }
            }
            "drawCircle" => {
                if let Some(p) = path.as_mut() {
                    let r = read_f32(commands, a + 2);
                    append_ellipse_to_path(
                        p,
                        read_f32(commands, a),
                        read_f32(commands, a + 1),
                        r,
                        r,
                    );
                }
            }
            "drawEllipse" => {
                if let Some(p) = path.as_mut() {
                    let w = read_f32(commands, a + 2);
                    let h = read_f32(commands, a + 3);
                    append_ellipse_to_path(
                        p,
                        read_f32(commands, a) + w / 2.0,
                        read_f32(commands, a + 1) + h / 2.0,
                        w / 2.0,
                        h / 2.0,
                    );
                }
            }
            "drawRectangle" => {
                if let Some(p) = path.as_mut() {
                    append_rectangle_to_path(
                        p,
                        read_f32(commands, a),
                        read_f32(commands, a + 1),
                        read_f32(commands, a + 2),
                        read_f32(commands, a + 3),
                    );
                }
            }
            "drawRoundRectangle" => {
                if let Some(p) = path.as_mut() {
                    append_round_rectangle_to_path(
                        p,
                        read_f32(commands, a),
                        read_f32(commands, a + 1),
                        read_f32(commands, a + 2),
                        read_f32(commands, a + 3),
                        read_f32(commands, a + 4) / 2.0,
                        read_f32(commands, a + 5) / 2.0,
                    );
                }
            }
            "drawPath" => {
                if let Some(p) = path.as_mut() {
                    let verbs = read_u8_vec(commands, a).clone();
                    let data = read_f32_vec(commands, a + 1).clone();
                    append_raw_path(p, &verbs, &data);
                }
            }
            // Non-geometry styling commands are handled by the
            // has_non_solid_shape_fill guard above or are no-ops for solid fills.
            _ => {}
        }
    }

    flush_region(&mut regions, path.take(), color, alpha);
    Some(regions)
}

/// Returns `true` if the command buffer contains any construct that the GPU
/// solid-fill path cannot express: gradient fills, bitmap fills, or strokes.
///
/// When `true`, callers should skip [`get_shape_fill_regions`] and use the
/// raster fallback path instead.
pub fn has_non_solid_shape_fill(arena: &DisplayObjectArena, source: NodeId) -> bool {
    match get_shape_data(arena, source) {
        Some(data) => has_non_solid_shape_fill_buffer(&data.commands),
        None => false,
    }
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const KAPPA: f32 = 0.552_284_8;

fn append_ellipse_to_path(path: &mut Path, cx: f32, cy: f32, rx: f32, ry: f32) {
    let kx = rx * KAPPA;
    let ky = ry * KAPPA;
    push_verb(path, path_command::MOVE_TO, cx + rx, cy);
    push_cubic(path, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
    push_cubic(path, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
    push_cubic(path, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
    push_cubic(path, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
}

// Appends a raw Path verb/data stream (from a `drawPath` command) onto `path`.
fn append_raw_path(path: &mut Path, verbs: &[u8], data: &[f32]) {
    let mut d = 0usize;
    for &verb in verbs {
        let args = if verb == path_command::CUBIC_CURVE_TO {
            6
        } else if verb == path_command::CURVE_TO {
            4
        } else {
            2
        };
        path.commands.push(verb);
        for k in 0..args {
            path.data.push(data[d + k]);
        }
        d += args;
    }
}

fn append_rectangle_to_path(path: &mut Path, x: f32, y: f32, w: f32, h: f32) {
    push_verb(path, path_command::MOVE_TO, x, y);
    push_verb(path, path_command::LINE_TO, x + w, y);
    push_verb(path, path_command::LINE_TO, x + w, y + h);
    push_verb(path, path_command::LINE_TO, x, y + h);
    push_verb(path, path_command::LINE_TO, x, y);
}

fn append_round_rectangle_to_path(
    path: &mut Path,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
    rx: f32,
    ry: f32,
) {
    let right = x + w;
    let bottom = y + h;
    push_verb(path, path_command::MOVE_TO, x + rx, y);
    push_verb(path, path_command::LINE_TO, right - rx, y);
    push_quadratic(path, right, y, right, y + ry);
    push_verb(path, path_command::LINE_TO, right, bottom - ry);
    push_quadratic(path, right, bottom, right - rx, bottom);
    push_verb(path, path_command::LINE_TO, x + rx, bottom);
    push_quadratic(path, x, bottom, x, bottom - ry);
    push_verb(path, path_command::LINE_TO, x, y + ry);
    push_quadratic(path, x, y, x + rx, y);
}

fn flush_region(regions: &mut Vec<ShapeFillRegion>, path: Option<Path>, color: u32, alpha: f32) {
    if let Some(p) = path {
        if !p.commands.is_empty() {
            regions.push(ShapeFillRegion {
                path: p,
                color,
                alpha,
            });
        }
    }
}

fn has_non_solid_shape_fill_buffer(commands: &[AnyBox]) -> bool {
    let mut i = 0;
    while i < commands.len() {
        let name = read_key(commands, i);
        let arg_count = read_arg_count(commands, i + 1);
        if matches!(
            name,
            "beginGradientFill"
                | "beginBitmapFill"
                | "lineStyle"
                | "lineGradientStyle"
                | "lineBitmapStyle"
        ) {
            return true;
        }
        i += 2 + arg_count;
    }
    false
}

fn push_cubic(path: &mut Path, c1x: f32, c1y: f32, c2x: f32, c2y: f32, ax: f32, ay: f32) {
    path.commands.push(path_command::CUBIC_CURVE_TO);
    path.data.extend_from_slice(&[c1x, c1y, c2x, c2y, ax, ay]);
}

fn push_quadratic(path: &mut Path, cx: f32, cy: f32, ax: f32, ay: f32) {
    path.commands.push(path_command::CURVE_TO);
    path.data.extend_from_slice(&[cx, cy, ax, ay]);
}

fn push_verb(path: &mut Path, verb: u8, x: f32, y: f32) {
    path.commands.push(verb);
    path.data.extend_from_slice(&[x, y]);
}

fn read_arg_count(buf: &[AnyBox], i: usize) -> usize {
    *buf[i].downcast_ref::<i32>().expect("arg count slot") as usize
}

fn read_f32_vec(buf: &[AnyBox], i: usize) -> &Vec<f32> {
    buf[i].downcast_ref::<Vec<f32>>().expect("f32 vec slot")
}

fn read_u8_vec(buf: &[AnyBox], i: usize) -> &Vec<u8> {
    buf[i].downcast_ref::<Vec<u8>>().expect("u8 vec slot")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shape::create_shape;
    use crate::shape_commands::{
        append_shape_begin_fill, append_shape_begin_gradient_fill, append_shape_circle,
        append_shape_end_fill, append_shape_line_style, append_shape_line_to, append_shape_move_to,
        append_shape_rectangle,
    };
    use flighthq_types::{
        CapsStyle, GradientType, InterpolationMethod, JointStyle, LineScaleMode, SpreadMethod,
    };

    fn new_arena() -> DisplayObjectArena {
        DisplayObjectArena::default()
    }

    fn linear_gradient(arena: &mut DisplayObjectArena, shape: NodeId) {
        append_shape_begin_gradient_fill(
            arena,
            shape,
            GradientType::Linear,
            vec![0xff0000, 0x0000ff],
            vec![1.0, 1.0],
            vec![0.0, 255.0],
            None,
            SpreadMethod::Pad,
            InterpolationMethod::Rgb,
            0.0,
        );
    }

    fn solid_stroke(arena: &mut DisplayObjectArena, shape: NodeId) {
        append_shape_line_style(
            arena,
            shape,
            2.0,
            0x000000,
            1.0,
            false,
            LineScaleMode::Normal,
            CapsStyle::None,
            JointStyle::Round,
            3.0,
        );
    }

    // get_shape_fill_regions

    #[test]
    fn get_shape_fill_regions_empty_shape_returns_empty_list() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        let regions = get_shape_fill_regions(&arena, shape).unwrap();
        assert_eq!(regions.len(), 0);
    }

    #[test]
    fn get_shape_fill_regions_solid_rectangle_returns_region() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_begin_fill(&mut arena, shape, 0xff0000, 1.0);
        append_shape_rectangle(&mut arena, shape, 10.0, 20.0, 100.0, 50.0);
        append_shape_end_fill(&mut arena, shape);

        let regions = get_shape_fill_regions(&arena, shape).unwrap();
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].color, 0xff0000);
        assert_eq!(regions[0].alpha, 1.0);
        assert_eq!(
            regions[0].path.commands,
            vec![
                path_command::MOVE_TO,
                path_command::LINE_TO,
                path_command::LINE_TO,
                path_command::LINE_TO,
                path_command::LINE_TO,
            ]
        );
        assert_eq!(&regions[0].path.data[0..4], &[10.0, 20.0, 110.0, 20.0]);
    }

    #[test]
    fn get_shape_fill_regions_circle_expands_to_four_cubics() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_begin_fill(&mut arena, shape, 0x00ff00, 1.0);
        append_shape_circle(&mut arena, shape, 50.0, 50.0, 20.0);
        append_shape_end_fill(&mut arena, shape);

        let regions = get_shape_fill_regions(&arena, shape).unwrap();
        assert_eq!(
            regions[0].path.commands,
            vec![
                path_command::MOVE_TO,
                path_command::CUBIC_CURVE_TO,
                path_command::CUBIC_CURVE_TO,
                path_command::CUBIC_CURVE_TO,
                path_command::CUBIC_CURVE_TO,
            ]
        );
        assert_eq!(&regions[0].path.data[0..2], &[70.0, 50.0]);
    }

    #[test]
    fn get_shape_fill_regions_polygon_via_move_line() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_begin_fill(&mut arena, shape, 0x0000ff, 1.0);
        append_shape_move_to(&mut arena, shape, 0.0, 0.0);
        append_shape_line_to(&mut arena, shape, 100.0, 0.0);
        append_shape_line_to(&mut arena, shape, 50.0, 80.0);
        append_shape_end_fill(&mut arena, shape);

        let regions = get_shape_fill_regions(&arena, shape).unwrap();
        assert_eq!(regions.len(), 1);
        assert_eq!(
            regions[0].path.commands,
            vec![
                path_command::MOVE_TO,
                path_command::LINE_TO,
                path_command::LINE_TO
            ]
        );
    }

    #[test]
    fn get_shape_fill_regions_region_per_fill_span() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_begin_fill(&mut arena, shape, 0x111111, 1.0);
        append_shape_rectangle(&mut arena, shape, 0.0, 0.0, 10.0, 10.0);
        append_shape_begin_fill(&mut arena, shape, 0x222222, 1.0);
        append_shape_rectangle(&mut arena, shape, 20.0, 20.0, 10.0, 10.0);
        append_shape_end_fill(&mut arena, shape);

        let regions = get_shape_fill_regions(&arena, shape).unwrap();
        let colors: Vec<u32> = regions.iter().map(|r| r.color).collect();
        assert_eq!(colors, vec![0x111111, 0x222222]);
    }

    #[test]
    fn get_shape_fill_regions_returns_none_for_gradient_fill() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        linear_gradient(&mut arena, shape);
        append_shape_rectangle(&mut arena, shape, 0.0, 0.0, 10.0, 10.0);
        append_shape_end_fill(&mut arena, shape);
        assert!(get_shape_fill_regions(&arena, shape).is_none());
    }

    #[test]
    fn get_shape_fill_regions_returns_none_for_line_style() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        solid_stroke(&mut arena, shape);
        append_shape_begin_fill(&mut arena, shape, 0xff0000, 1.0);
        append_shape_rectangle(&mut arena, shape, 0.0, 0.0, 10.0, 10.0);
        append_shape_end_fill(&mut arena, shape);
        assert!(get_shape_fill_regions(&arena, shape).is_none());
    }

    // has_non_solid_shape_fill

    #[test]
    fn has_non_solid_shape_fill_false_for_solid_only() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_begin_fill(&mut arena, shape, 0xff0000, 1.0);
        append_shape_rectangle(&mut arena, shape, 0.0, 0.0, 10.0, 10.0);
        append_shape_end_fill(&mut arena, shape);
        assert!(!has_non_solid_shape_fill(&arena, shape));
    }

    #[test]
    fn has_non_solid_shape_fill_true_for_gradient() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        linear_gradient(&mut arena, shape);
        assert!(has_non_solid_shape_fill(&arena, shape));
    }

    #[test]
    fn has_non_solid_shape_fill_true_for_line_style() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        solid_stroke(&mut arena, shape);
        assert!(has_non_solid_shape_fill(&arena, shape));
    }
}
