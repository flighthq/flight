//! Drawing-command append helpers for [`crate::shape::ShapeNode`].
//!
//! Each function pushes one command — a `&'static str` key, an `i32` argument
//! count, then the command's arguments boxed in their natural types — into the
//! node's flat command buffer, then calls [`invalidate_shape_geometry`] so the
//! bounds and content revisions are bumped.
//!
//! The command encoding is an implementation detail of the rendering backends;
//! consumers should only interact with the buffer through these helpers and the
//! `read_*` helpers in [`crate::command_buffer`].

use flighthq_displayobject::DisplayObjectArena;
use flighthq_node::NodeId;
use flighthq_types::{
    CapsStyle, GradientType, ImageResource, InterpolationMethod, JointStyle, LineScaleMode, Matrix,
    PathWinding, SpreadMethod,
};

use crate::command_buffer::AnyBox;
use crate::shape::{get_shape_data_mut, invalidate_shape_geometry};

// ---------------------------------------------------------------------------
// Bitmap fill / gradient fill / solid fill
// ---------------------------------------------------------------------------

/// Begins a bitmap fill that images subsequent geometry.
///
/// `matrix` transforms the bitmap's coordinate space; `None` is identity.
pub fn append_shape_begin_bitmap_fill(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    bitmap: ImageResource,
    matrix: Option<Matrix>,
    repeat: bool,
    smooth: bool,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "beginBitmapFill", 4);
    cmds.push(Box::new(bitmap));
    cmds.push(Box::new(matrix));
    cmds.push(Box::new(repeat));
    cmds.push(Box::new(smooth));
    invalidate_shape_geometry(arena, source);
}

/// Begins a solid colour fill for subsequent geometry.
///
/// `color` is a packed RGBA u32 (e.g. `0xff0000ff` for opaque red).
/// `alpha` is a multiplier in `[0, 1]`.
pub fn append_shape_begin_fill(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    color: u32,
    alpha: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "beginFill", 2);
    cmds.push(Box::new(color));
    cmds.push(Box::new(alpha));
    invalidate_shape_geometry(arena, source);
}

/// Begins a gradient fill for subsequent geometry.
pub fn append_shape_begin_gradient_fill(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    gradient_type: GradientType,
    colors: Vec<u32>,
    alphas: Vec<f32>,
    ratios: Vec<f32>,
    matrix: Option<Matrix>,
    spread_method: SpreadMethod,
    interpolation_method: InterpolationMethod,
    focal_point_ratio: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "beginGradientFill", 8);
    cmds.push(Box::new(gradient_type));
    cmds.push(Box::new(colors));
    cmds.push(Box::new(alphas));
    cmds.push(Box::new(ratios));
    cmds.push(Box::new(matrix));
    cmds.push(Box::new(spread_method));
    cmds.push(Box::new(interpolation_method));
    cmds.push(Box::new(focal_point_ratio));
    invalidate_shape_geometry(arena, source);
}

// ---------------------------------------------------------------------------
// Primitive shapes
// ---------------------------------------------------------------------------

/// Appends a circle centred at `(x, y)` with the given `radius`.
pub fn append_shape_circle(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    radius: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "drawCircle", 3);
    cmds.push(Box::new(x));
    cmds.push(Box::new(y));
    cmds.push(Box::new(radius));
    invalidate_shape_geometry(arena, source);
}

/// Appends a cubic Bézier from the current pen to `(anchor_x, anchor_y)`.
pub fn append_shape_cubic_curve_to(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    control_x1: f32,
    control_y1: f32,
    control_x2: f32,
    control_y2: f32,
    anchor_x: f32,
    anchor_y: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "cubicCurveTo", 6);
    cmds.push(Box::new(control_x1));
    cmds.push(Box::new(control_y1));
    cmds.push(Box::new(control_x2));
    cmds.push(Box::new(control_y2));
    cmds.push(Box::new(anchor_x));
    cmds.push(Box::new(anchor_y));
    invalidate_shape_geometry(arena, source);
}

/// Appends a quadratic Bézier from the current pen to `(anchor_x, anchor_y)`.
pub fn append_shape_curve_to(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    control_x: f32,
    control_y: f32,
    anchor_x: f32,
    anchor_y: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "curveTo", 4);
    cmds.push(Box::new(control_x));
    cmds.push(Box::new(control_y));
    cmds.push(Box::new(anchor_x));
    cmds.push(Box::new(anchor_y));
    invalidate_shape_geometry(arena, source);
}

/// Appends an ellipse with its bounding box at `(x, y, width, height)`.
pub fn append_shape_ellipse(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "drawEllipse", 4);
    cmds.push(Box::new(x));
    cmds.push(Box::new(y));
    cmds.push(Box::new(width));
    cmds.push(Box::new(height));
    invalidate_shape_geometry(arena, source);
}

/// Ends the current fill span.
pub fn append_shape_end_fill(arena: &mut DisplayObjectArena, source: NodeId) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "endFill", 0);
    invalidate_shape_geometry(arena, source);
}

// ---------------------------------------------------------------------------
// Line style helpers
// ---------------------------------------------------------------------------

/// Sets a bitmap stroke style for subsequent lines.
pub fn append_shape_line_bitmap_style(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    bitmap: ImageResource,
    matrix: Option<Matrix>,
    repeat: bool,
    smooth: bool,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "lineBitmapStyle", 4);
    cmds.push(Box::new(bitmap));
    cmds.push(Box::new(matrix));
    cmds.push(Box::new(repeat));
    cmds.push(Box::new(smooth));
    invalidate_shape_geometry(arena, source);
}

/// Sets a gradient stroke style for subsequent lines.
pub fn append_shape_line_gradient_style(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    gradient_type: GradientType,
    colors: Vec<u32>,
    alphas: Vec<f32>,
    ratios: Vec<f32>,
    matrix: Option<Matrix>,
    spread_method: SpreadMethod,
    interpolation_method: InterpolationMethod,
    focal_point_ratio: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "lineGradientStyle", 8);
    cmds.push(Box::new(gradient_type));
    cmds.push(Box::new(colors));
    cmds.push(Box::new(alphas));
    cmds.push(Box::new(ratios));
    cmds.push(Box::new(matrix));
    cmds.push(Box::new(spread_method));
    cmds.push(Box::new(interpolation_method));
    cmds.push(Box::new(focal_point_ratio));
    invalidate_shape_geometry(arena, source);
}

/// Sets the solid stroke style for subsequent line segments.
///
/// A `thickness` of `0` (hairline) is rendered as 1 physical pixel regardless
/// of scale. `pixel_hinting` snaps vertices to whole pixels.
pub fn append_shape_line_style(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    thickness: f32,
    color: u32,
    alpha: f32,
    pixel_hinting: bool,
    scale_mode: LineScaleMode,
    caps: CapsStyle,
    joints: JointStyle,
    miter_limit: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "lineStyle", 8);
    cmds.push(Box::new(thickness));
    cmds.push(Box::new(color));
    cmds.push(Box::new(alpha));
    cmds.push(Box::new(pixel_hinting));
    cmds.push(Box::new(scale_mode));
    cmds.push(Box::new(caps));
    cmds.push(Box::new(joints));
    cmds.push(Box::new(miter_limit));
    invalidate_shape_geometry(arena, source);
}

// ---------------------------------------------------------------------------
// Path verbs
// ---------------------------------------------------------------------------

/// Appends a line segment from the current pen to `(x, y)`.
pub fn append_shape_line_to(arena: &mut DisplayObjectArena, source: NodeId, x: f32, y: f32) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "lineTo", 2);
    cmds.push(Box::new(x));
    cmds.push(Box::new(y));
    invalidate_shape_geometry(arena, source);
}

/// Moves the current pen to `(x, y)` without drawing.
pub fn append_shape_move_to(arena: &mut DisplayObjectArena, source: NodeId, x: f32, y: f32) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "moveTo", 2);
    cmds.push(Box::new(x));
    cmds.push(Box::new(y));
    invalidate_shape_geometry(arena, source);
}

/// Appends a path from a raw verb-stream / data-array pair (the `drawPath`
/// command from Flash / OpenFL).
///
/// `commands` is a list of [`flighthq_types::path_command`] verb codes;
/// `path_data` is the corresponding flat coordinate array.
pub fn append_shape_path(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    commands: Vec<u8>,
    path_data: Vec<f32>,
    winding: PathWinding,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "drawPath", 3);
    cmds.push(Box::new(commands));
    cmds.push(Box::new(path_data));
    cmds.push(Box::new(winding));
    invalidate_shape_geometry(arena, source);
}

/// Appends an axis-aligned rectangle.
pub fn append_shape_rectangle(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "drawRectangle", 4);
    cmds.push(Box::new(x));
    cmds.push(Box::new(y));
    cmds.push(Box::new(width));
    cmds.push(Box::new(height));
    invalidate_shape_geometry(arena, source);
}

/// Appends a rectangle with uniform corner radii (`ellipse_width` ×
/// `ellipse_height`), using the Flash `drawRoundRect` semantics.
pub fn append_shape_round_rectangle(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    ellipse_width: f32,
    ellipse_height: f32,
) {
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_command(cmds, "drawRoundRectangle", 6);
    cmds.push(Box::new(x));
    cmds.push(Box::new(y));
    cmds.push(Box::new(width));
    cmds.push(Box::new(height));
    cmds.push(Box::new(ellipse_width));
    cmds.push(Box::new(ellipse_height));
    invalidate_shape_geometry(arena, source);
}

/// Appends a rounded rectangle as explicit bezier path verbs, giving
/// independent per-corner radii.
///
/// Corners follow clockwise order: top-left, top-right, bottom-right,
/// bottom-left. Expands to `moveTo`/`lineTo`/`curveTo` commands rather than a
/// new command type.
pub fn append_shape_round_rectangle_path(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
    top_left_radius: f32,
    top_right_radius: f32,
    bottom_left_radius: f32,
    bottom_right_radius: f32,
) {
    let r = x + width;
    let bottom = y + height;
    let Some(data) = get_shape_data_mut(arena, source) else {
        return;
    };
    let cmds = &mut data.commands;
    push_move_to(cmds, x + top_left_radius, y);
    push_line_to(cmds, r - top_right_radius, y);
    push_curve_to(cmds, r, y, r, y + top_right_radius);
    push_line_to(cmds, r, bottom - bottom_right_radius);
    push_curve_to(cmds, r, bottom, r - bottom_right_radius, bottom);
    push_line_to(cmds, x + bottom_left_radius, bottom);
    push_curve_to(cmds, x, bottom, x, bottom - bottom_left_radius);
    push_line_to(cmds, x, y + top_left_radius);
    push_curve_to(cmds, x, y, x + top_left_radius, y);
    invalidate_shape_geometry(arena, source);
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

fn push_command(cmds: &mut Vec<AnyBox>, key: &'static str, arg_count: i32) {
    cmds.push(Box::new(key));
    cmds.push(Box::new(arg_count));
}

fn push_curve_to(
    cmds: &mut Vec<AnyBox>,
    control_x: f32,
    control_y: f32,
    anchor_x: f32,
    anchor_y: f32,
) {
    push_command(cmds, "curveTo", 4);
    cmds.push(Box::new(control_x));
    cmds.push(Box::new(control_y));
    cmds.push(Box::new(anchor_x));
    cmds.push(Box::new(anchor_y));
}

fn push_line_to(cmds: &mut Vec<AnyBox>, x: f32, y: f32) {
    push_command(cmds, "lineTo", 2);
    cmds.push(Box::new(x));
    cmds.push(Box::new(y));
}

fn push_move_to(cmds: &mut Vec<AnyBox>, x: f32, y: f32) {
    push_command(cmds, "moveTo", 2);
    cmds.push(Box::new(x));
    cmds.push(Box::new(y));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::command_buffer::{read_bool, read_f32, read_key, read_u8_vec, read_u32};
    use crate::shape::{create_shape, get_shape_data};

    fn new_arena() -> DisplayObjectArena {
        DisplayObjectArena::default()
    }

    fn cmds<'a>(arena: &'a DisplayObjectArena, shape: NodeId) -> &'a [AnyBox] {
        &get_shape_data(arena, shape).expect("shape data").commands
    }

    fn fake_image() -> ImageResource {
        ImageResource {
            width: 10,
            height: 10,
            ..Default::default()
        }
    }

    // append_shape_begin_bitmap_fill

    #[test]
    fn append_shape_begin_bitmap_fill_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_begin_bitmap_fill(&mut arena, shape, fake_image(), None, false, true);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "beginBitmapFill");
        assert_eq!(*cmds[1].downcast_ref::<i32>().unwrap(), 4);
        assert!(cmds[2].downcast_ref::<ImageResource>().is_some());
        assert!(cmds[3].downcast_ref::<Option<Matrix>>().unwrap().is_none());
        assert!(!read_bool(cmds, 4));
        assert!(read_bool(cmds, 5));
    }

    // append_shape_begin_fill

    #[test]
    fn append_shape_begin_fill_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_begin_fill(&mut arena, shape, 0xff0000, 0.5);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "beginFill");
        assert_eq!(read_u32(cmds, 2), 0xff0000);
        assert_eq!(read_f32(cmds, 3), 0.5);
    }

    // append_shape_begin_gradient_fill

    #[test]
    fn append_shape_begin_gradient_fill_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_begin_gradient_fill(
            &mut arena,
            shape,
            GradientType::Linear,
            vec![0xff0000, 0x0000ff],
            vec![1.0, 1.0],
            vec![0.0, 255.0],
            None,
            SpreadMethod::Reflect,
            InterpolationMethod::LinearRgb,
            0.5,
        );
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "beginGradientFill");
        assert_eq!(*cmds[1].downcast_ref::<i32>().unwrap(), 8);
        assert_eq!(
            *cmds[2].downcast_ref::<GradientType>().unwrap(),
            GradientType::Linear
        );
        assert_eq!(
            cmds[3].downcast_ref::<Vec<u32>>().unwrap(),
            &vec![0xff0000, 0x0000ff]
        );
        assert_eq!(cmds[4].downcast_ref::<Vec<f32>>().unwrap(), &vec![1.0, 1.0]);
        assert_eq!(
            cmds[5].downcast_ref::<Vec<f32>>().unwrap(),
            &vec![0.0, 255.0]
        );
        assert!(cmds[6].downcast_ref::<Option<Matrix>>().unwrap().is_none());
        assert_eq!(
            *cmds[7].downcast_ref::<SpreadMethod>().unwrap(),
            SpreadMethod::Reflect
        );
        assert_eq!(
            *cmds[8].downcast_ref::<InterpolationMethod>().unwrap(),
            InterpolationMethod::LinearRgb
        );
        assert_eq!(read_f32(cmds, 9), 0.5);
    }

    // append_shape_circle

    #[test]
    fn append_shape_circle_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_circle(&mut arena, shape, 50.0, 50.0, 25.0);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "drawCircle");
        assert_eq!(read_f32(cmds, 2), 50.0);
        assert_eq!(read_f32(cmds, 3), 50.0);
        assert_eq!(read_f32(cmds, 4), 25.0);
    }

    // append_shape_cubic_curve_to

    #[test]
    fn append_shape_cubic_curve_to_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_cubic_curve_to(&mut arena, shape, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "cubicCurveTo");
        assert_eq!(*cmds[1].downcast_ref::<i32>().unwrap(), 6);
        assert_eq!(read_f32(cmds, 2), 10.0);
        assert_eq!(read_f32(cmds, 3), 20.0);
        assert_eq!(read_f32(cmds, 4), 30.0);
        assert_eq!(read_f32(cmds, 5), 40.0);
        assert_eq!(read_f32(cmds, 6), 50.0);
        assert_eq!(read_f32(cmds, 7), 60.0);
    }

    // append_shape_curve_to

    #[test]
    fn append_shape_curve_to_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_curve_to(&mut arena, shape, 10.0, 20.0, 30.0, 40.0);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "curveTo");
        assert_eq!(*cmds[1].downcast_ref::<i32>().unwrap(), 4);
        assert_eq!(read_f32(cmds, 2), 10.0);
        assert_eq!(read_f32(cmds, 3), 20.0);
        assert_eq!(read_f32(cmds, 4), 30.0);
        assert_eq!(read_f32(cmds, 5), 40.0);
    }

    // append_shape_ellipse

    #[test]
    fn append_shape_ellipse_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_ellipse(&mut arena, shape, 10.0, 20.0, 100.0, 50.0);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "drawEllipse");
        assert_eq!(*cmds[1].downcast_ref::<i32>().unwrap(), 4);
        assert_eq!(read_f32(cmds, 2), 10.0);
        assert_eq!(read_f32(cmds, 3), 20.0);
        assert_eq!(read_f32(cmds, 4), 100.0);
        assert_eq!(read_f32(cmds, 5), 50.0);
    }

    // append_shape_end_fill

    #[test]
    fn append_shape_end_fill_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_end_fill(&mut arena, shape);
        let cmds = cmds(&arena, shape);
        assert_eq!(cmds.len(), 2);
        assert_eq!(read_key(cmds, 0), "endFill");
    }

    // append_shape_line_bitmap_style

    #[test]
    fn append_shape_line_bitmap_style_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_line_bitmap_style(&mut arena, shape, fake_image(), None, false, true);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "lineBitmapStyle");
        assert_eq!(*cmds[1].downcast_ref::<i32>().unwrap(), 4);
        assert!(cmds[2].downcast_ref::<ImageResource>().is_some());
        assert!(cmds[3].downcast_ref::<Option<Matrix>>().unwrap().is_none());
        assert!(!read_bool(cmds, 4));
        assert!(read_bool(cmds, 5));
    }

    // append_shape_line_gradient_style

    #[test]
    fn append_shape_line_gradient_style_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_line_gradient_style(
            &mut arena,
            shape,
            GradientType::Linear,
            vec![0xff0000],
            vec![1.0],
            vec![0.0],
            None,
            SpreadMethod::Pad,
            InterpolationMethod::Rgb,
            0.0,
        );
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "lineGradientStyle");
        assert_eq!(*cmds[1].downcast_ref::<i32>().unwrap(), 8);
        assert_eq!(
            *cmds[2].downcast_ref::<GradientType>().unwrap(),
            GradientType::Linear
        );
        assert_eq!(cmds[3].downcast_ref::<Vec<u32>>().unwrap(), &vec![0xff0000]);
        assert_eq!(
            *cmds[7].downcast_ref::<SpreadMethod>().unwrap(),
            SpreadMethod::Pad
        );
        assert_eq!(
            *cmds[8].downcast_ref::<InterpolationMethod>().unwrap(),
            InterpolationMethod::Rgb
        );
        assert_eq!(read_f32(cmds, 9), 0.0);
    }

    // append_shape_line_style

    #[test]
    fn append_shape_line_style_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_line_style(
            &mut arena,
            shape,
            2.0,
            0x0000ff,
            0.8,
            true,
            LineScaleMode::Horizontal,
            CapsStyle::Round,
            JointStyle::Bevel,
            5.0,
        );
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "lineStyle");
        assert_eq!(read_f32(cmds, 2), 2.0);
        assert_eq!(read_u32(cmds, 3), 0x0000ff);
        assert_eq!(read_f32(cmds, 4), 0.8);
        assert!(read_bool(cmds, 5));
    }

    // append_shape_line_to

    #[test]
    fn append_shape_line_to_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_line_to(&mut arena, shape, 100.0, 200.0);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "lineTo");
        assert_eq!(read_f32(cmds, 2), 100.0);
        assert_eq!(read_f32(cmds, 3), 200.0);
    }

    // append_shape_move_to

    #[test]
    fn append_shape_move_to_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_move_to(&mut arena, shape, 10.0, 20.0);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "moveTo");
        assert_eq!(read_f32(cmds, 2), 10.0);
        assert_eq!(read_f32(cmds, 3), 20.0);
    }

    // append_shape_path

    #[test]
    fn append_shape_path_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        // MOVE_TO = 1, LINE_TO = 2
        append_shape_path(
            &mut arena,
            shape,
            vec![1, 2],
            vec![0.0, 0.0, 100.0, 100.0],
            PathWinding::NonZero,
        );
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "drawPath");
        assert_eq!(*cmds[1].downcast_ref::<i32>().unwrap(), 3);
        assert_eq!(read_u8_vec(cmds, 2), &vec![1u8, 2]);
        assert_eq!(
            cmds[3].downcast_ref::<Vec<f32>>().unwrap(),
            &vec![0.0, 0.0, 100.0, 100.0]
        );
        assert_eq!(
            *cmds[4].downcast_ref::<PathWinding>().unwrap(),
            PathWinding::NonZero
        );
    }

    // append_shape_rectangle

    #[test]
    fn append_shape_rectangle_pushes_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_rectangle(&mut arena, shape, 10.0, 20.0, 100.0, 50.0);
        let cmds = cmds(&arena, shape);
        assert_eq!(read_key(cmds, 0), "drawRectangle");
        assert_eq!(read_f32(cmds, 2), 10.0);
        assert_eq!(read_f32(cmds, 3), 20.0);
        assert_eq!(read_f32(cmds, 4), 100.0);
        assert_eq!(read_f32(cmds, 5), 50.0);
    }

    // append_shape_round_rectangle_path

    #[test]
    fn append_shape_round_rectangle_path_expands_to_primitives() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_round_rectangle_path(
            &mut arena, shape, 0.0, 0.0, 100.0, 50.0, 5.0, 5.0, 5.0, 5.0,
        );
        let cmds = cmds(&arena, shape);
        let mut keys: Vec<&'static str> = Vec::new();
        let mut i = 0;
        while i < cmds.len() {
            let key = read_key(cmds, i);
            let arg_count = *cmds[i + 1].downcast_ref::<i32>().unwrap() as usize;
            keys.push(key);
            i += arg_count + 2;
        }
        assert!(keys.len() > 1);
        assert!(
            keys.iter()
                .all(|k| *k == "moveTo" || *k == "lineTo" || *k == "curveTo")
        );
    }
}
