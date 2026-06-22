//! Core ShapeNode: drawing-command buffer, bounds computation, and geometry
//! invalidation.
//!
//! A `ShapeNode` stores its drawing commands as an opaque, flat heterogeneous
//! buffer (`Vec<Box<dyn Any>>`) mirroring the TypeScript command stream: each
//! command is encoded as a `&'static str` key, an `i32` argument count, then the
//! command's arguments boxed in their natural Rust types. Renderers and the
//! bounds/fill iterators read the buffer back by key and argument count.
//!
//! Both `bounds_revision` and `content_revision` are bumped together whenever the
//! command buffer changes, because the command stream defines both the shape's
//! geometry and its drawn surface.

use flighthq_node::{NodeArena, NodeId};
use flighthq_types::{Rectangle, ShapeData};

use crate::command_buffer::{read_f32, read_key, read_u8_vec};

// ---------------------------------------------------------------------------
// ShapeNode
// ---------------------------------------------------------------------------

/// A scene graph node that renders vector shape commands.
///
/// Drawing commands are appended via the helpers in [`crate::shape_commands`];
/// the node stores them as raw boxed values that each renderer backend
/// interprets.
///
/// The `bounds_revision` and `content_revision` counters let renderers detect
/// geometry changes without re-diffing the command buffer.
#[derive(Debug, Default)]
pub struct ShapeNode {
    /// The shape's drawing command buffer and fill data.
    pub data: ShapeData,
    /// Bumped by [`invalidate_shape_geometry`] to signal bounds re-measurement.
    pub bounds_revision: u32,
    /// Bumped by [`invalidate_shape_geometry`] to signal raster re-paint.
    pub content_revision: u32,
}

/// Arena of `ShapeNode` values, keyed by [`NodeId`].
pub type ShapeArena = NodeArena<ShapeNode>;

/// Runtime behavior for a shape.
///
/// Mirrors TS `ShapeRuntime`, whose distinguishing behavior is its
/// `computeLocalBoundsRectangle` method. In the Rust arena model the runtime is
/// captured as the shape's bounds-compute function.
pub type ShapeRuntime = fn(&ShapeArena, NodeId, &mut Rectangle);

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Removes all drawing commands from `source` and invalidates its geometry.
pub fn clear_shape_commands(arena: &mut ShapeArena, source: NodeId) {
    arena[source].data.commands.clear();
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
/// Safe for any `out`: inputs are read from `arena`, which is a distinct
/// borrow from the mutable `out`.
pub fn compute_shape_local_bounds_rectangle(
    arena: &ShapeArena,
    source: NodeId,
    out: &mut Rectangle,
) {
    let commands = &arena[source].data.commands;

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
/// re-encodes by draining and rebuilding. Because `source` and `target` are
/// distinct arena slots, the copy is performed by cloning each boxed entry
/// through the buffer's typed re-box helper.
pub fn copy_shape_commands(arena: &mut ShapeArena, source: NodeId, target: NodeId) {
    let copied = crate::command_buffer::clone_command_buffer(&arena[source].data.commands);
    arena[target].data.commands = copied;
    invalidate_shape_geometry(arena, target);
}

/// Builds a default `ShapeData` payload with an empty command buffer.
///
/// Mirrors TS `createShapeData()`.
pub fn create_shape_data() -> ShapeData {
    ShapeData {
        commands: Vec::new(),
    }
}

/// Creates a new `ShapeNode` entry in `arena` and returns its `NodeId`.
pub fn create_shape_node(arena: &mut ShapeArena) -> NodeId {
    arena.insert(ShapeNode::default())
}

/// Builds the runtime behavior for a shape.
///
/// Mirrors TS `createShapeRuntime()`, which installs
/// `computeShapeLocalBoundsRectangle` as the runtime's bounds-compute method.
pub fn create_shape_runtime() -> ShapeRuntime {
    compute_shape_local_bounds_rectangle
}

/// Returns the runtime behavior for the shape at `source`.
///
/// Mirrors TS `getShapeRuntime(source)`. The returned function is the shape's
/// bounds-compute method (the same one its factory installs via
/// [`create_shape_runtime`]).
pub fn get_shape_runtime(_arena: &ShapeArena, _source: NodeId) -> ShapeRuntime {
    compute_shape_local_bounds_rectangle
}

/// Bumps both the `bounds_revision` and `content_revision` counters on
/// `source` to signal that its geometry and render surface have changed.
///
/// Called automatically by every append/clear/copy helper; call directly only
/// when mutating `shape.data.commands` in place.
pub fn invalidate_shape_geometry(arena: &mut ShapeArena, source: NodeId) {
    let node = &mut arena[source];
    node.bounds_revision = node.bounds_revision.wrapping_add(1);
    node.content_revision = node.content_revision.wrapping_add(1);
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

type AnyBox = Box<dyn std::any::Any + Send + Sync>;

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
    use flighthq_geometry::create_rectangle;

    // clear_shape_commands

    #[test]
    fn clear_shape_commands_empties_buffer() {
        let mut arena = ShapeArena::default();
        let shape = create_shape_node(&mut arena);
        append_shape_end_fill(&mut arena, shape);
        let content = arena[shape].content_revision;
        clear_shape_commands(&mut arena, shape);
        assert_eq!(arena[shape].data.commands.len(), 0);
        assert_eq!(arena[shape].content_revision, content + 1);
    }

    // compute_shape_local_bounds_rectangle

    #[test]
    fn compute_shape_local_bounds_rectangle_empty_is_zero() {
        let mut arena = ShapeArena::default();
        let shape = create_shape_node(&mut arena);
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_shape_local_bounds_rectangle(&arena, shape, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 0.0);
        assert_eq!(out.height, 0.0);
    }

    #[test]
    fn compute_shape_local_bounds_rectangle_rectangle_command() {
        let mut arena = ShapeArena::default();
        let shape = create_shape_node(&mut arena);
        append_shape_rectangle(&mut arena, shape, 10.0, 20.0, 100.0, 50.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_shape_local_bounds_rectangle(&arena, shape, &mut out);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.y, 20.0);
        assert_eq!(out.width, 100.0);
        assert_eq!(out.height, 50.0);
    }

    #[test]
    fn compute_shape_local_bounds_rectangle_move_and_line() {
        let mut arena = ShapeArena::default();
        let shape = create_shape_node(&mut arena);
        append_shape_move_to(&mut arena, shape, 0.0, 0.0);
        append_shape_line_to(&mut arena, shape, 80.0, 60.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        compute_shape_local_bounds_rectangle(&arena, shape, &mut out);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.width, 80.0);
        assert_eq!(out.height, 60.0);
    }

    // copy_shape_commands

    #[test]
    fn copy_shape_commands_duplicates_buffer() {
        let mut arena = ShapeArena::default();
        let source = create_shape_node(&mut arena);
        append_shape_end_fill(&mut arena, source);
        let target = create_shape_node(&mut arena);
        let content = arena[target].content_revision;
        copy_shape_commands(&mut arena, source, target);
        assert_eq!(arena[target].data.commands.len(), 2);
        assert_eq!(arena[target].content_revision, content + 1);
    }

    // create_shape_data

    #[test]
    fn create_shape_data_returns_empty_commands() {
        let data = create_shape_data();
        assert_eq!(data.commands.len(), 0);
    }

    // create_shape_node

    #[test]
    fn create_shape_node_returns_valid_id() {
        let mut arena = ShapeArena::default();
        let shape = create_shape_node(&mut arena);
        assert!(arena.get(shape).is_some());
        assert_eq!(arena[shape].data.commands.len(), 0);
    }

    // create_shape_runtime

    #[test]
    fn create_shape_runtime_uses_compute_local_bounds() {
        let runtime = create_shape_runtime();
        let mut arena = ShapeArena::default();
        let shape = create_shape_node(&mut arena);
        append_shape_rectangle(&mut arena, shape, 10.0, 20.0, 100.0, 50.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        runtime(&arena, shape, &mut out);
        assert_eq!(out.x, 10.0);
        assert_eq!(out.width, 100.0);
    }

    // get_shape_runtime

    #[test]
    fn get_shape_runtime_returns_compute_for_shape() {
        let mut arena = ShapeArena::default();
        let shape = create_shape_node(&mut arena);
        let runtime = get_shape_runtime(&arena, shape);
        append_shape_rectangle(&mut arena, shape, 0.0, 0.0, 8.0, 4.0);
        let mut out = create_rectangle(0.0, 0.0, 0.0, 0.0);
        runtime(&arena, shape, &mut out);
        assert_eq!(out.width, 8.0);
        assert_eq!(out.height, 4.0);
    }

    // invalidate_shape_geometry

    #[test]
    fn invalidate_shape_geometry_bumps_both_revisions() {
        let mut arena = ShapeArena::default();
        let shape = create_shape_node(&mut arena);
        let content = arena[shape].content_revision;
        let bounds = arena[shape].bounds_revision;
        invalidate_shape_geometry(&mut arena, shape);
        assert_eq!(arena[shape].content_revision, content + 1);
        assert_eq!(arena[shape].bounds_revision, bounds + 1);
    }
}
