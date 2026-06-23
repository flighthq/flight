//! Core shape display object: drawing-command buffer, bounds computation, and
//! geometry invalidation.
//!
//! A shape is a [`DisplayObjectArena`] node whose kind is [`shape_kind`] and
//! whose boxed payload is a [`ShapeData`]. The payload stores the drawing
//! commands as an opaque, flat heterogeneous buffer (`Vec<Box<dyn Any>>`)
//! mirroring the TypeScript command stream: each command is encoded as a
//! `&'static str` key, an `i32` argument count, then the command's arguments
//! boxed in their natural Rust types. Renderers and the bounds/fill iterators
//! read the buffer back by key and argument count.
//!
//! [`invalidate_shape_geometry`] bumps both the node's local-content revision
//! (re-rasterize) and its local-bounds revision (re-measure), because the
//! command stream defines both the shape's drawn surface and its extent. This
//! mirrors TS `invalidateShapeGeometry`, which calls `invalidateNodeLocalContent`
//! and `invalidateNodeLocalBounds`.

use flighthq_displayobject::{
    DisplayObjectArena, DisplayObjectRuntime, create_display_object_generic,
    create_display_object_runtime, invalidate_display_object_local_bounds,
    invalidate_display_object_local_content,
};
use flighthq_node::NodeId;
use flighthq_types::{Rectangle, ShapeData, shape_kind};

use crate::command_buffer::{read_f32, read_key, read_u8_vec};

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/// Runtime behavior for a shape.
///
/// Mirrors TS `ShapeRuntime`, whose distinguishing behavior is its
/// `computeLocalBoundsRectangle` method. In the Rust arena model the runtime is
/// the shape's bounds-compute function, carried as a [`DisplayObjectRuntime`].
pub type ShapeRuntime = DisplayObjectRuntime;

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Removes all drawing commands from `source` and invalidates its geometry.
pub fn clear_shape_commands(arena: &mut DisplayObjectArena, source: NodeId) {
    if let Some(data) = get_shape_data_mut(arena, source) {
        data.commands.clear();
    }
    invalidate_shape_geometry(arena, source);
}

/// Writes the axis-aligned local bounds of `source`'s command buffer into
/// `out`, accounting for stroke width.
///
/// Iterates the command stream, expanding a running min/max envelope for each
/// geometric primitive and bezier extrema, then expands by half the stroke
/// width if a `lineStyle` command is present. Writes a zero rectangle when the
/// buffer is empty.
///
/// The signature matches [`DisplayObjectRuntime`]: inputs are read from `arena`,
/// which is a distinct borrow from the mutable `out`.
pub fn compute_shape_local_bounds_rectangle(
    out: &mut Rectangle,
    arena: &DisplayObjectArena,
    source: NodeId,
) {
    let Some(data) = get_shape_data(arena, source) else {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return;
    };
    let commands = &data.commands;

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut stroke_width = 0.0f32;
    let mut pen_x = 0.0f32;
    let mut pen_y = 0.0f32;

    macro_rules! expand {
        ($x:expr, $y:expr $(,)?) => {{
            let x = $x;
            let y = $y;
            if x < min_x {
                min_x = x;
            }
            if y < min_y {
                min_y = y;
            }
            if x > max_x {
                max_x = x;
            }
            if y > max_y {
                max_y = y;
            }
        }};
    }

    let mut i = 0;
    while i < commands.len() {
        let key = read_key(commands, i);
        let arg_count = read_arg_count(commands, i + 1);
        let b = i + 2;

        match key {
            "drawRectangle" | "drawRoundRectangle" => {
                let x = read_f32(commands, b);
                let y = read_f32(commands, b + 1);
                let w = read_f32(commands, b + 2);
                let h = read_f32(commands, b + 3);
                expand!(x, y);
                expand!(x + w, y + h);
            }
            "drawCircle" => {
                let x = read_f32(commands, b);
                let y = read_f32(commands, b + 1);
                let r = read_f32(commands, b + 2);
                expand!(x - r, y - r);
                expand!(x + r, y + r);
            }
            "drawEllipse" => {
                let x = read_f32(commands, b);
                let y = read_f32(commands, b + 1);
                let w = read_f32(commands, b + 2);
                let h = read_f32(commands, b + 3);
                expand!(x, y);
                expand!(x + w, y + h);
            }
            "moveTo" => {
                pen_x = read_f32(commands, b);
                pen_y = read_f32(commands, b + 1);
            }
            "lineTo" => {
                let x = read_f32(commands, b);
                let y = read_f32(commands, b + 1);
                expand!(pen_x, pen_y);
                expand!(x, y);
                pen_x = x;
                pen_y = y;
            }
            "curveTo" => {
                let control_x = read_f32(commands, b);
                let control_y = read_f32(commands, b + 1);
                let anchor_x = read_f32(commands, b + 2);
                let anchor_y = read_f32(commands, b + 3);
                expand!(pen_x, pen_y);
                // Expand by quadratic bezier extrema (t where derivative = 0).
                let denom_x = pen_x - 2.0 * control_x + anchor_x;
                if denom_x != 0.0 {
                    let tx = (pen_x - control_x) / denom_x;
                    if tx > 0.0 && tx < 1.0 {
                        expand!(
                            quad_point(tx, pen_x, control_x, anchor_x),
                            quad_point(tx, pen_y, control_y, anchor_y),
                        );
                    }
                }
                let denom_y = pen_y - 2.0 * control_y + anchor_y;
                if denom_y != 0.0 {
                    let ty = (pen_y - control_y) / denom_y;
                    if ty > 0.0 && ty < 1.0 {
                        expand!(
                            quad_point(ty, pen_x, control_x, anchor_x),
                            quad_point(ty, pen_y, control_y, anchor_y),
                        );
                    }
                }
                expand!(anchor_x, anchor_y);
                pen_x = anchor_x;
                pen_y = anchor_y;
            }
            "cubicCurveTo" => {
                let control1_x = read_f32(commands, b);
                let control1_y = read_f32(commands, b + 1);
                let control2_x = read_f32(commands, b + 2);
                let control2_y = read_f32(commands, b + 3);
                let anchor_x = read_f32(commands, b + 4);
                let anchor_y = read_f32(commands, b + 5);
                expand!(pen_x, pen_y);
                expand!(control1_x, control1_y);
                expand!(control2_x, control2_y);
                expand!(anchor_x, anchor_y);
                pen_x = anchor_x;
                pen_y = anchor_y;
            }
            "lineStyle" => {
                stroke_width = read_f32(commands, b);
            }
            "drawPath" => {
                let path_cmds = read_u8_vec(commands, b);
                let data = read_f32_vec(commands, b + 1);
                let mut di = 0usize;
                for &pc in path_cmds {
                    match pc {
                        1 => {
                            // MOVE_TO
                            pen_x = data[di];
                            pen_y = data[di + 1];
                            di += 2;
                        }
                        2 => {
                            // LINE_TO
                            expand!(pen_x, pen_y);
                            expand!(data[di], data[di + 1]);
                            pen_x = data[di];
                            pen_y = data[di + 1];
                            di += 2;
                        }
                        3 => {
                            // CURVE_TO
                            expand!(pen_x, pen_y);
                            expand!(data[di], data[di + 1]);
                            expand!(data[di + 2], data[di + 3]);
                            pen_x = data[di + 2];
                            pen_y = data[di + 3];
                            di += 4;
                        }
                        4 => {
                            // WIDE_MOVE_TO
                            pen_x = data[di + 2];
                            pen_y = data[di + 3];
                            di += 4;
                        }
                        5 => {
                            // WIDE_LINE_TO
                            expand!(pen_x, pen_y);
                            expand!(data[di + 2], data[di + 3]);
                            pen_x = data[di + 2];
                            pen_y = data[di + 3];
                            di += 4;
                        }
                        6 => {
                            // CUBIC_CURVE_TO
                            expand!(pen_x, pen_y);
                            expand!(data[di], data[di + 1]);
                            expand!(data[di + 2], data[di + 3]);
                            expand!(data[di + 4], data[di + 5]);
                            pen_x = data[di + 4];
                            pen_y = data[di + 5];
                            di += 6;
                        }
                        _ => {}
                    }
                }
            }
            _ => {}
        }

        i += arg_count + 2;
    }

    if min_x == f32::INFINITY {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
    } else {
        let half = stroke_width / 2.0;
        out.x = min_x - half;
        out.y = min_y - half;
        out.width = max_x - min_x + stroke_width;
        out.height = max_y - min_y + stroke_width;
    }
}

/// Copies the command buffer from `source` into `target`, then invalidates
/// `target`'s geometry.
///
/// The command buffer holds boxed trait objects that are not cloneable, so this
/// re-encodes by cloning each boxed entry through the buffer's typed re-box
/// helper. Because `source` and `target` are distinct arena slots, the clone is
/// read out before the write.
pub fn copy_shape_commands(arena: &mut DisplayObjectArena, source: NodeId, target: NodeId) {
    let copied = match get_shape_data(arena, source) {
        Some(data) => crate::command_buffer::clone_command_buffer(&data.commands),
        None => return,
    };
    if let Some(target_data) = get_shape_data_mut(arena, target) {
        target_data.commands = copied;
    }
    invalidate_shape_geometry(arena, target);
}

/// Inserts a new shape node into `arena` and returns its id.
///
/// Mirrors TS `createShape`: builds a display object of kind [`shape_kind`] with
/// a [`ShapeData`] payload via `createDisplayObjectGeneric`.
pub fn create_shape(arena: &mut DisplayObjectArena) -> NodeId {
    let data: Box<dyn std::any::Any + Send + Sync> = Box::new(create_shape_data());
    create_display_object_generic(arena, shape_kind(), Some(data))
}

/// Builds a default `ShapeData` payload with an empty command buffer.
///
/// Mirrors TS `createShapeData()`.
pub fn create_shape_data() -> ShapeData {
    ShapeData {
        commands: Vec::new(),
    }
}

/// Builds the runtime behavior for a shape.
///
/// Mirrors TS `createShapeRuntime()`, which installs
/// `computeShapeLocalBoundsRectangle` as the runtime's bounds-compute method.
pub fn create_shape_runtime() -> ShapeRuntime {
    create_display_object_runtime(Some(compute_shape_local_bounds_rectangle))
}

/// Returns the runtime behavior for the shape at `source`.
///
/// Mirrors TS `getShapeRuntime(source)`. TS reads the runtime object the shape
/// factory installed; in the arena port a shape's runtime is always its
/// bounds-compute function (the same one [`create_shape_runtime`] installs), so
/// this returns it directly. Display-object kind dispatch (`runtime_for_kind`)
/// lives in `flighthq-displayobject` and intentionally does not know shape kinds,
/// since that crate must not depend on `flighthq-shape`.
pub fn get_shape_runtime(_arena: &DisplayObjectArena, _source: NodeId) -> ShapeRuntime {
    create_shape_runtime()
}

/// Bumps both the node's local-content and local-bounds revisions on `source`
/// to signal that its render surface and extent have changed.
///
/// Mirrors TS `invalidateShapeGeometry`, which calls `invalidateNodeLocalContent`
/// then `invalidateNodeLocalBounds`. Called automatically by every
/// append/clear/copy helper; call directly only when mutating a shape's commands
/// in place.
pub fn invalidate_shape_geometry(arena: &mut DisplayObjectArena, source: NodeId) {
    invalidate_display_object_local_content(arena, source);
    invalidate_display_object_local_bounds(arena, source);
}

// ---------------------------------------------------------------------------
// Internal helpers (loose, kept after the public API)
// ---------------------------------------------------------------------------

type AnyBox = Box<dyn std::any::Any + Send + Sync>;

/// Returns the [`ShapeData`] payload of `source`, or `None` if the node carries
/// no shape payload.
pub(crate) fn get_shape_data(arena: &DisplayObjectArena, source: NodeId) -> Option<&ShapeData> {
    arena[source]
        .data
        .as_ref()
        .and_then(|d| d.downcast_ref::<ShapeData>())
}

/// Returns the mutable [`ShapeData`] payload of `source`, or `None` if the node
/// carries no shape payload.
pub(crate) fn get_shape_data_mut(
    arena: &mut DisplayObjectArena,
    source: NodeId,
) -> Option<&mut ShapeData> {
    arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<ShapeData>())
}

fn quad_point(t: f32, p0: f32, p1: f32, p2: f32) -> f32 {
    let u = 1.0 - t;
    u * u * p0 + 2.0 * u * t * p1 + t * t * p2
}

fn read_arg_count(buf: &[AnyBox], i: usize) -> usize {
    *buf[i].downcast_ref::<i32>().expect("arg count slot") as usize
}

fn read_f32_vec(buf: &[AnyBox], i: usize) -> &Vec<f32> {
    buf[i].downcast_ref::<Vec<f32>>().expect("f32 vec slot")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::shape_commands::{
        append_shape_end_fill, append_shape_line_to, append_shape_move_to, append_shape_rectangle,
    };
    use flighthq_displayobject::get_display_object_local_content_revision;
    use flighthq_geometry::create_rectangle;
    use flighthq_types::shape_kind;

    fn new_arena() -> DisplayObjectArena {
        DisplayObjectArena::default()
    }

    // clear_shape_commands

    #[test]
    fn clear_shape_commands_empties_buffer() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_end_fill(&mut arena, shape);
        let content = get_display_object_local_content_revision(&arena, shape);
        clear_shape_commands(&mut arena, shape);
        assert_eq!(get_shape_data(&arena, shape).unwrap().commands.len(), 0);
        assert_ne!(
            get_display_object_local_content_revision(&arena, shape),
            content
        );
    }

    // compute_shape_local_bounds_rectangle

    #[test]
    fn compute_shape_local_bounds_rectangle_empty_is_zero() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_shape_local_bounds_rectangle(&mut out, &arena, shape);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn compute_shape_local_bounds_rectangle_rectangle_command() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_rectangle(&mut arena, shape, 10.0, 20.0, 100.0, 50.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_shape_local_bounds_rectangle(&mut out, &arena, shape);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
        assert_eq!(out.width, 100.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    fn compute_shape_local_bounds_rectangle_move_and_line() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_move_to(&mut arena, shape, 0.0, 0.0);
        append_shape_line_to(&mut arena, shape, 80.0, 60.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_shape_local_bounds_rectangle(&mut out, &arena, shape);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 80.0);
        assert_eq!(out.height, 60.0);
    }

    // copy_shape_commands

    #[test]
    fn copy_shape_commands_duplicates_buffer() {
        let mut arena = new_arena();
        let source = create_shape(&mut arena);
        append_shape_end_fill(&mut arena, source);
        let target = create_shape(&mut arena);
        let content = get_display_object_local_content_revision(&arena, target);
        copy_shape_commands(&mut arena, source, target);
        assert_eq!(get_shape_data(&arena, target).unwrap().commands.len(), 2);
        assert_ne!(
            get_display_object_local_content_revision(&arena, target),
            content
        );
    }

    // create_shape

    #[test]
    fn create_shape_uses_shape_kind() {
        use flighthq_displayobject::get_display_object_kind;
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        assert_eq!(get_display_object_kind(&arena, shape), shape_kind());
        assert_eq!(get_shape_data(&arena, shape).unwrap().commands.len(), 0);
    }

    // create_shape_data

    #[test]
    fn create_shape_data_returns_empty_commands() {
        let data = create_shape_data();
        assert_eq!(data.commands.len(), 0);
    }

    // create_shape_runtime

    #[test]
    fn create_shape_runtime_uses_compute_local_bounds() {
        let runtime = create_shape_runtime();
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_rectangle(&mut arena, shape, 10.0, 20.0, 100.0, 50.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        runtime.expect("shape runtime")(&mut out, &arena, shape);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.width, 100.0);
    }

    // get_shape_runtime

    #[test]
    fn get_shape_runtime_returns_compute_for_shape() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        let runtime = get_shape_runtime(&arena, shape);
        append_shape_rectangle(&mut arena, shape, 0.0, 0.0, 8.0, 4.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        runtime.expect("shape runtime")(&mut out, &arena, shape);
        assert_eq!(out.width, 8.0);
        assert_eq!(out.height, 4.0);
    }

    // invalidate_shape_geometry

    #[test]
    fn invalidate_shape_geometry_bumps_both_revisions() {
        use flighthq_displayobject::get_display_object_local_bounds_revision;
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        let content = get_display_object_local_content_revision(&arena, shape);
        let bounds = get_display_object_local_bounds_revision(&arena, shape);
        invalidate_shape_geometry(&mut arena, shape);
        assert_ne!(
            get_display_object_local_content_revision(&arena, shape),
            content
        );
        assert_ne!(
            get_display_object_local_bounds_revision(&arena, shape),
            bounds
        );
    }
}
