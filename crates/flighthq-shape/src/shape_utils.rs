//! Shape utility functions — convenience shape-command builders, type guards,
//! and data-level queries.

use flighthq_displayobject::DisplayObjectArena;
use flighthq_node::NodeId;
use flighthq_types::{Rectangle, Scale9ShapeData, ShapeData};

use crate::command_buffer::read_f32;
use crate::shape::{get_shape_data, invalidate_shape_geometry};
use crate::shape_commands::{append_shape_end_fill, append_shape_line_to, append_shape_move_to};

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Computes the axis-aligned local bounds of a `ShapeData` command buffer
/// directly, without requiring an arena lookup. This is the data-level
/// equivalent of `compute_shape_local_bounds_rectangle`.
///
/// Writes a zero rectangle when the buffer is empty.
pub fn compute_shape_data_local_bounds(out: &mut Rectangle, data: &ShapeData) {
    compute_bounds_from_commands(out, &data.commands);
}

/// Appends commands to draw a capsule (stadium) centered at `(cx, cy)` with
/// the given `width`, `height`, and semicircular end caps. The capsule is
/// oriented horizontally when `width > height`, vertically otherwise.
pub fn create_capsule_shape_commands(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    cx: f32,
    cy: f32,
    width: f32,
    height: f32,
) {
    if width <= 0.0 || height <= 0.0 {
        return;
    }
    if width >= height {
        // Horizontal capsule: semicircles on left/right.
        let r = height / 2.0;
        let half_w = width / 2.0;
        let left = cx - half_w + r;
        let right = cx + half_w - r;
        let top = cy - r;
        let bottom = cy + r;

        append_shape_move_to(arena, source, right, top);
        // Top-right semicircle (approximated as a half-ellipse via right semicircle).
        append_capsule_semicircle(arena, source, cx + half_w - r, cy, r, true);
        append_shape_line_to(arena, source, left, bottom);
        // Bottom-left semicircle.
        append_capsule_semicircle(arena, source, cx - half_w + r, cy, r, false);
        append_shape_line_to(arena, source, right, top);
    } else {
        // Vertical capsule: semicircles on top/bottom.
        let r = width / 2.0;
        let half_h = height / 2.0;
        let left = cx - r;
        let right = cx + r;
        let top = cy - half_h + r;
        let bottom = cy + half_h - r;

        append_shape_move_to(arena, source, right, top);
        append_shape_line_to(arena, source, right, bottom);
        // Bottom semicircle.
        append_capsule_semicircle(arena, source, cx, cy + half_h - r, r, true);
        append_shape_line_to(arena, source, left, top);
        // Top semicircle.
        append_capsule_semicircle(arena, source, cx, cy - half_h + r, r, false);
    }
    append_shape_end_fill(arena, source);
    invalidate_shape_geometry(arena, source);
}

/// Appends commands to draw a grid of `cols` x `rows` cells, each `cell_width`
/// x `cell_height`, starting at `(x, y)`.
pub fn create_grid_shape_commands(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    x: f32,
    y: f32,
    cols: u32,
    rows: u32,
    cell_width: f32,
    cell_height: f32,
) {
    // Horizontal lines.
    for row in 0..=rows {
        let ly = y + row as f32 * cell_height;
        let x_end = x + cols as f32 * cell_width;
        append_shape_move_to(arena, source, x, ly);
        append_shape_line_to(arena, source, x_end, ly);
    }
    // Vertical lines.
    for col in 0..=cols {
        let lx = x + col as f32 * cell_width;
        let y_end = y + rows as f32 * cell_height;
        append_shape_move_to(arena, source, lx, y);
        append_shape_line_to(arena, source, lx, y_end);
    }
    invalidate_shape_geometry(arena, source);
}

/// Appends commands to draw a star centered at `(cx, cy)` with `points` tips,
/// an outer radius and an inner radius. `rotation` is in radians.
pub fn create_star_shape_commands(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    cx: f32,
    cy: f32,
    points: u32,
    outer_radius: f32,
    inner_radius: f32,
    rotation: f32,
) {
    if points < 2 {
        return;
    }
    let step = std::f32::consts::PI / points as f32;
    let start_angle = rotation - std::f32::consts::FRAC_PI_2;

    for i in 0..(points * 2) {
        let angle = start_angle + i as f32 * step;
        let r = if i % 2 == 0 {
            outer_radius
        } else {
            inner_radius
        };
        let px = cx + angle.cos() * r;
        let py = cy + angle.sin() * r;
        if i == 0 {
            append_shape_move_to(arena, source, px, py);
        } else {
            append_shape_line_to(arena, source, px, py);
        }
    }
    // Close the star.
    let first_angle = start_angle;
    let px = cx + first_angle.cos() * outer_radius;
    let py = cy + first_angle.sin() * outer_radius;
    append_shape_line_to(arena, source, px, py);
    append_shape_end_fill(arena, source);
    invalidate_shape_geometry(arena, source);
}

/// Draws the shape's command buffer through a callback. The callback receives
/// the key and arguments of each drawing command in the buffer sequentially.
///
/// This is a read-only traversal — the shape is not modified.
pub fn draw_shape_path(
    arena: &DisplayObjectArena,
    source: NodeId,
    callback: &mut dyn FnMut(&str, &[Box<dyn std::any::Any + Send + Sync>]),
) {
    let Some(data) = get_shape_data(arena, source) else {
        return;
    };
    let commands = &data.commands;
    let mut i = 0;
    while i < commands.len() {
        let key = crate::command_buffer::read_key(commands, i);
        if i + 1 >= commands.len() {
            break;
        }
        let arg_count = *commands[i + 1].downcast_ref::<i32>().unwrap_or(&0) as usize;
        let args_start = i + 2;
        let args_end = (args_start + arg_count).min(commands.len());
        callback(key, &commands[args_start..args_end]);
        i = args_end;
    }
}

/// Returns the local-content revision of the shape's data. This can be compared
/// against a cached value to detect when the command buffer has changed.
///
/// In the Rust arena model, this reads the display object's local content
/// revision ID.
pub fn get_shape_data_transform_revision(arena: &DisplayObjectArena, source: NodeId) -> u32 {
    flighthq_displayobject::get_display_object_local_content_revision(arena, source)
}

/// Returns `true` if the display object at `source` is a scale-9 shape (its
/// boxed payload downcasts to `Scale9ShapeData`).
pub fn is_scale9_shape_data(arena: &DisplayObjectArena, source: NodeId) -> bool {
    arena[source]
        .data
        .as_ref()
        .map(|d| d.downcast_ref::<Scale9ShapeData>().is_some())
        .unwrap_or(false)
}

/// Refreshes the scale-9 shape data at `source`: updates the `scale9_grid`
/// rectangle and invalidates geometry so renderers rebuild their nine-slice
/// meshes.
pub fn refresh_scale9_shape_data(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    scale9_grid: Rectangle,
) {
    if let Some(data) = arena[source]
        .data
        .as_mut()
        .and_then(|d| d.downcast_mut::<Scale9ShapeData>())
    {
        data.scale9_grid = scale9_grid;
    }
    invalidate_shape_geometry(arena, source);
}

/// Tessellates the shape's drawing-command buffer into a flat list of 2D
/// triangle vertices `[x0, y0, x1, y1, x2, y2, ...]`.
///
/// This is a simplified tessellation that handles moveTo/lineTo sequences as
/// triangle fans (suitable for convex sub-paths). Complex shapes with curves
/// or concavities should use a proper tessellator; this function provides a
/// baseline for fill rendering.
pub fn tessellate_shape_commands(arena: &DisplayObjectArena, source: NodeId) -> Vec<f32> {
    let Some(data) = get_shape_data(arena, source) else {
        return Vec::new();
    };
    tessellate_commands(&data.commands)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type AnyBox = Box<dyn std::any::Any + Send + Sync>;

fn compute_bounds_from_commands(out: &mut Rectangle, commands: &[AnyBox]) {
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;

    macro_rules! expand {
        ($x:expr, $y:expr) => {{
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
        let key = crate::command_buffer::read_key(commands, i);
        if i + 1 >= commands.len() {
            break;
        }
        let arg_count = *commands[i + 1].downcast_ref::<i32>().unwrap_or(&0) as usize;

        match key {
            "moveTo" | "lineTo" if arg_count >= 2 => {
                let x = read_f32(commands, i + 2);
                let y = read_f32(commands, i + 3);
                expand!(x, y);
            }
            "curveTo" if arg_count >= 4 => {
                expand!(read_f32(commands, i + 2), read_f32(commands, i + 3));
                expand!(read_f32(commands, i + 4), read_f32(commands, i + 5));
            }
            "cubicCurveTo" if arg_count >= 6 => {
                expand!(read_f32(commands, i + 2), read_f32(commands, i + 3));
                expand!(read_f32(commands, i + 4), read_f32(commands, i + 5));
                expand!(read_f32(commands, i + 6), read_f32(commands, i + 7));
            }
            "drawCircle" if arg_count >= 3 => {
                let cx = read_f32(commands, i + 2);
                let cy = read_f32(commands, i + 3);
                let r = read_f32(commands, i + 4);
                expand!(cx - r, cy - r);
                expand!(cx + r, cy + r);
            }
            "drawEllipse" if arg_count >= 4 => {
                let ex = read_f32(commands, i + 2);
                let ey = read_f32(commands, i + 3);
                let ew = read_f32(commands, i + 4);
                let eh = read_f32(commands, i + 5);
                expand!(ex, ey);
                expand!(ex + ew, ey + eh);
            }
            "drawRectangle" if arg_count >= 4 => {
                let rx = read_f32(commands, i + 2);
                let ry = read_f32(commands, i + 3);
                let rw = read_f32(commands, i + 4);
                let rh = read_f32(commands, i + 5);
                expand!(rx, ry);
                expand!(rx + rw, ry + rh);
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
        out.x = min_x;
        out.y = min_y;
        out.width = max_x - min_x;
        out.height = max_y - min_y;
    }
}

fn tessellate_commands(commands: &[AnyBox]) -> Vec<f32> {
    let mut vertices = Vec::new();
    let mut path: Vec<(f32, f32)> = Vec::new();

    let mut i = 0;
    while i < commands.len() {
        let key = crate::command_buffer::read_key(commands, i);
        if i + 1 >= commands.len() {
            break;
        }
        let arg_count = *commands[i + 1].downcast_ref::<i32>().unwrap_or(&0) as usize;

        match key {
            "moveTo" if arg_count >= 2 => {
                flush_path(&path, &mut vertices);
                path.clear();
                let x = read_f32(commands, i + 2);
                let y = read_f32(commands, i + 3);
                path.push((x, y));
            }
            "lineTo" if arg_count >= 2 => {
                let x = read_f32(commands, i + 2);
                let y = read_f32(commands, i + 3);
                path.push((x, y));
            }
            "drawRectangle" if arg_count >= 4 => {
                flush_path(&path, &mut vertices);
                path.clear();
                let rx = read_f32(commands, i + 2);
                let ry = read_f32(commands, i + 3);
                let rw = read_f32(commands, i + 4);
                let rh = read_f32(commands, i + 5);
                // Two triangles for the rectangle.
                vertices.extend_from_slice(&[
                    rx,
                    ry,
                    rx + rw,
                    ry,
                    rx + rw,
                    ry + rh,
                    rx,
                    ry,
                    rx + rw,
                    ry + rh,
                    rx,
                    ry + rh,
                ]);
            }
            "endFill" => {
                flush_path(&path, &mut vertices);
                path.clear();
            }
            _ => {}
        }
        i += arg_count + 2;
    }
    flush_path(&path, &mut vertices);
    vertices
}

/// Simple triangle-fan tessellation for a convex sub-path.
fn flush_path(path: &[(f32, f32)], vertices: &mut Vec<f32>) {
    if path.len() < 3 {
        return;
    }
    let (ax, ay) = path[0];
    for j in 1..path.len() - 1 {
        let (bx, by) = path[j];
        let (cx, cy) = path[j + 1];
        vertices.extend_from_slice(&[ax, ay, bx, by, cx, cy]);
    }
}

/// Approximates a semicircle as two cubic bezier-approximated quarter arcs,
/// appended as lineTo commands for simplicity.
fn append_capsule_semicircle(
    arena: &mut DisplayObjectArena,
    source: NodeId,
    cx: f32,
    cy: f32,
    r: f32,
    right_side: bool,
) {
    let steps = 8;
    let start = if right_side {
        -std::f32::consts::FRAC_PI_2
    } else {
        std::f32::consts::FRAC_PI_2
    };
    let sweep = std::f32::consts::PI;
    for s in 1..=steps {
        let angle = start + sweep * s as f32 / steps as f32;
        let px = cx + angle.cos() * r;
        let py = cy + angle.sin() * r;
        append_shape_line_to(arena, source, px, py);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scale9_shape::create_scale9_shape;
    use crate::shape::create_shape;
    use crate::shape_commands::{
        append_shape_end_fill, append_shape_line_to, append_shape_move_to, append_shape_rectangle,
    };
    use flighthq_geometry::create_rectangle;

    fn new_arena() -> DisplayObjectArena {
        DisplayObjectArena::default()
    }

    // compute_shape_data_local_bounds

    #[test]
    fn compute_shape_data_local_bounds_empty() {
        let data = ShapeData {
            commands: Vec::new(),
        };
        let mut out = create_rectangle(1.0, 2.0, 3.0, 4.0);
        compute_shape_data_local_bounds(&mut out, &data);
        assert_eq!(out.x, 0.0);
        assert_eq!(out.width, 0.0);
    }

    // create_capsule_shape_commands

    #[test]
    fn create_capsule_shape_commands_adds_commands() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        create_capsule_shape_commands(&mut arena, shape, 50.0, 50.0, 100.0, 40.0);
        let data = get_shape_data(&arena, shape).unwrap();
        assert!(!data.commands.is_empty());
    }

    #[test]
    fn create_capsule_shape_commands_zero_size_noop() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        create_capsule_shape_commands(&mut arena, shape, 50.0, 50.0, 0.0, 40.0);
        let data = get_shape_data(&arena, shape).unwrap();
        assert!(data.commands.is_empty());
    }

    // create_grid_shape_commands

    #[test]
    fn create_grid_shape_commands_adds_lines() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        create_grid_shape_commands(&mut arena, shape, 0.0, 0.0, 2, 2, 10.0, 10.0);
        let data = get_shape_data(&arena, shape).unwrap();
        assert!(!data.commands.is_empty());
    }

    // create_star_shape_commands

    #[test]
    fn create_star_shape_commands_five_point_star() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        create_star_shape_commands(&mut arena, shape, 50.0, 50.0, 5, 30.0, 15.0, 0.0);
        let data = get_shape_data(&arena, shape).unwrap();
        assert!(!data.commands.is_empty());
    }

    #[test]
    fn create_star_shape_commands_too_few_points_noop() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        create_star_shape_commands(&mut arena, shape, 50.0, 50.0, 1, 30.0, 15.0, 0.0);
        let data = get_shape_data(&arena, shape).unwrap();
        assert!(data.commands.is_empty());
    }

    // get_shape_data_transform_revision

    #[test]
    fn get_shape_data_transform_revision_changes_on_invalidate() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        let rev1 = get_shape_data_transform_revision(&arena, shape);
        invalidate_shape_geometry(&mut arena, shape);
        let rev2 = get_shape_data_transform_revision(&arena, shape);
        assert_ne!(rev1, rev2);
    }

    // is_scale9_shape_data

    #[test]
    fn is_scale9_shape_data_returns_false_for_shape() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        assert!(!is_scale9_shape_data(&arena, shape));
    }

    #[test]
    fn is_scale9_shape_data_returns_true_for_scale9() {
        let mut arena = new_arena();
        let grid = create_rectangle(10.0, 10.0, 80.0, 80.0);
        let shape = create_scale9_shape(&mut arena, grid);
        assert!(is_scale9_shape_data(&arena, shape));
    }

    // refresh_scale9_shape_data

    #[test]
    fn refresh_scale9_shape_data_updates_grid() {
        let mut arena = new_arena();
        let grid = create_rectangle(10.0, 10.0, 80.0, 80.0);
        let shape = create_scale9_shape(&mut arena, grid);
        let new_grid = create_rectangle(5.0, 5.0, 90.0, 90.0);
        refresh_scale9_shape_data(&mut arena, shape, new_grid);
        let data = arena[shape]
            .data
            .as_ref()
            .unwrap()
            .downcast_ref::<Scale9ShapeData>()
            .unwrap();
        assert_eq!(data.scale9_grid, new_grid);
    }

    // tessellate_shape_commands

    #[test]
    fn tessellate_shape_commands_empty_returns_empty() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        let verts = tessellate_shape_commands(&arena, shape);
        assert!(verts.is_empty());
    }

    #[test]
    fn tessellate_shape_commands_rectangle_returns_12_floats() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_rectangle(&mut arena, shape, 0.0, 0.0, 10.0, 10.0);
        let verts = tessellate_shape_commands(&arena, shape);
        // 2 triangles x 3 vertices x 2 coords = 12 floats.
        assert_eq!(verts.len(), 12);
    }

    #[test]
    fn tessellate_shape_commands_triangle_fan() {
        let mut arena = new_arena();
        let shape = create_shape(&mut arena);
        append_shape_move_to(&mut arena, shape, 0.0, 0.0);
        append_shape_line_to(&mut arena, shape, 10.0, 0.0);
        append_shape_line_to(&mut arena, shape, 10.0, 10.0);
        append_shape_line_to(&mut arena, shape, 0.0, 10.0);
        append_shape_end_fill(&mut arena, shape);
        let verts = tessellate_shape_commands(&arena, shape);
        // 4-point polygon -> 2 triangles -> 12 floats.
        assert_eq!(verts.len(), 12);
    }
}
