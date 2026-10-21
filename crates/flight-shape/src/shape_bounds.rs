//! The shape bounds traversal: fill and ink contributions through a stateful pen (TS
//! `shapeBounds.ts`).

use flight_geometry::Rectangle;

use flight_node::Node;

use crate::shape_bounds_registry::get_shape_bounds_command;

use crate::types::*;

// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32
use std::sync::Arc;

struct ShapeBoundsLaneState {
    first_segment: ShapeBoundsSegment,
    has_current_point: bool,
    has_first_segment: bool,
    has_pending_segment: bool,
    has_stroke: bool,
    pen_x: f64,
    pen_y: f64,
    pending_segment: ShapeBoundsSegment,
    stroke_cap: CapsStyle,
    stroke_join: JointStyle,
    stroke_miter_limit: f64,
    stroke_width: f64,
    subpath_start_x: f64,
    subpath_start_y: f64,
    tangent_end: ShapeBoundsTangent,
    tangent_start: ShapeBoundsTangent,
    writes_stroke: bool,
}

struct ShapeCommandCursor<'a> {
    argument_count: usize,
    argument_offset: usize,
    commands: &'a [ShapeCommandToken],
}

struct ShapeBoundsContextImpl<'a> {
    accumulator: &'a mut ShapeBoundsAccumulator,
    lane: &'a mut ShapeBoundsLaneState,
}

type Handler = fn(&mut dyn ShapeBoundsContext, &dyn ShapeCommandArgumentCursor);

/// The bounds accumulator (TS `ShapeBoundsAccumulator`).
#[derive(Clone, Copy)]
struct ShapeBoundsAccumulator {
    max_x: f64,
    max_y: f64,
    min_x: f64,
    min_y: f64,
}

#[derive(Clone, Copy)]
struct ShapeBoundsSegment {
    end_tangent_x: f64,
    end_tangent_y: f64,
    end_x: f64,
    end_y: f64,
    start_tangent_x: f64,
    start_tangent_y: f64,
    start_x: f64,
    start_y: f64,
}

#[derive(Clone, Copy)]
struct ShapeBoundsTangent {
    x: f64,
    y: f64,
}

fn create_shape_bounds_accumulator() -> ShapeBoundsAccumulator {
    return ShapeBoundsAccumulator {
        max_x: -f64::INFINITY,
        max_y: -f64::INFINITY,
        min_x: f64::INFINITY,
        min_y: f64::INFINITY,
    };
}

fn create_shape_bounds_lane_state(writes_stroke: bool) -> ShapeBoundsLaneState {
    return ShapeBoundsLaneState {
        first_segment: create_shape_bounds_segment(),
        has_current_point: false,
        has_first_segment: false,
        has_pending_segment: false,
        has_stroke: false,
        pen_x: 0.0,
        pen_y: 0.0,
        pending_segment: create_shape_bounds_segment(),
        stroke_cap: CapsStyle::None,
        stroke_join: JointStyle::Round,
        stroke_miter_limit: 3.0,
        stroke_width: DEFAULT_SHAPE_STROKE_WIDTH,
        subpath_start_x: 0.0,
        subpath_start_y: 0.0,
        tangent_end: ShapeBoundsTangent { x: 0.0, y: 0.0 },
        tangent_start: ShapeBoundsTangent { x: 0.0, y: 0.0 },
        writes_stroke,
    };
}

fn create_shape_bounds_segment() -> ShapeBoundsSegment {
    return ShapeBoundsSegment {
        end_tangent_x: 0.0,
        end_tangent_y: 0.0,
        end_x: 0.0,
        end_y: 0.0,
        start_tangent_x: 0.0,
        start_tangent_y: 0.0,
        start_x: 0.0,
        start_y: 0.0,
    };
}

/// Default stroke width when the authored width is not usable (TS `DEFAULT_SHAPE_STROKE_WIDTH`).
pub const DEFAULT_SHAPE_STROKE_WIDTH: f64 = 1.0;

/// Default miter limit when the authored limit is not usable (TS
/// `DEFAULT_SHAPE_STROKE_MITER_LIMIT`).
pub const DEFAULT_SHAPE_STROKE_MITER_LIMIT: f64 = 10.0;

fn append_shape_bounds_segment(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    start_x: f64,
    start_y: f64,
    end_x: f64,
    end_y: f64,
    start_tangent_x: f64,
    start_tangent_y: f64,
    end_tangent_x: f64,
    end_tangent_y: f64,
) {
    if state.has_pending_segment {
        expand_shape_bounds_join(
            accumulator,
            state,
            start_x,
            start_y,
            state.pending_segment.end_tangent_x,
            state.pending_segment.end_tangent_y,
            start_tangent_x,
            start_tangent_y,
        );
    }
    if !state.has_first_segment {
        set_shape_bounds_segment(
            &mut state.first_segment,
            start_x,
            start_y,
            end_x,
            end_y,
            start_tangent_x,
            start_tangent_y,
            end_tangent_x,
            end_tangent_y,
        );
        state.has_first_segment = true;
    }
    set_shape_bounds_segment(
        &mut state.pending_segment,
        start_x,
        start_y,
        end_x,
        end_y,
        start_tangent_x,
        start_tangent_y,
        end_tangent_x,
        end_tangent_y,
    );
    state.has_pending_segment = true;
}

fn both_command(key: &str, handler: Handler) -> ShapeBoundsCommand {
    return ShapeBoundsCommand {
        fill_bounds: Some(Arc::new(handler)),
        key: String::from(key),
        stroke_bounds: Some(Arc::new(handler)),
    };
}

fn close_shape_bounds_path(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
) {
    if !state.has_current_point {
        return;
    }
    if state.writes_stroke && state.has_stroke && state.has_pending_segment {
        let dx = state.subpath_start_x - state.pen_x;
        let dy = state.subpath_start_y - state.pen_y;
        if dx != 0.0 || dy != 0.0 {
            set_shape_bounds_tangent(&mut state.tangent_start, dx, dy);
            expand_shape_bounds_line(
                accumulator,
                state,
                state.pen_x,
                state.pen_y,
                state.subpath_start_x,
                state.subpath_start_y,
            );
            append_shape_bounds_segment(
                accumulator,
                state,
                state.pen_x,
                state.pen_y,
                state.subpath_start_x,
                state.subpath_start_y,
                state.tangent_start.x,
                state.tangent_start.y,
                state.tangent_start.x,
                state.tangent_start.y,
            );
        }
        if state.has_first_segment && state.has_pending_segment {
            expand_shape_bounds_join(
                accumulator,
                state,
                state.subpath_start_x,
                state.subpath_start_y,
                state.pending_segment.end_tangent_x,
                state.pending_segment.end_tangent_y,
                state.first_segment.start_tangent_x,
                state.first_segment.start_tangent_y,
            );
        }
    }
    state.pen_x = state.subpath_start_x;
    state.pen_y = state.subpath_start_y;
    state.has_first_segment = false;
    state.has_pending_segment = false;
}

/// Computes the bounds rectangle, reporting whether every command had a registered contribution
/// (TS `computeShapeBoundsRectangle`). Missing contributions keep their known geometry in `out` for
/// diagnostics; callers wanting a complete box use `get_shape_bounds`.
pub fn compute_shape_bounds_rectangle(
    out: &mut Rectangle,
    source: &dyn Node,
    mode: Option<ShapeBoundsMode>,
) -> bool {
    let mode = mode.unwrap_or(ShapeBoundsMode::Ink);
    let Some(commands) = shape_commands_of(source) else {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return false;
    };
    let Some(state) = shape_bounds_state_of(source) else {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return false;
    };
    let mut accumulator = create_shape_bounds_accumulator();
    let mut complete = true;
    {
        let mut lane = create_shape_bounds_lane_state(false);
        let mut cursor = ShapeCommandCursor {
            argument_count: 0,
            argument_offset: 0,
            commands,
        };
        run_lane(
            &mut accumulator,
            &mut lane,
            commands,
            &state,
            &mut cursor,
            source,
            mode,
            true,
            &mut complete,
        );
        let mut context = ShapeBoundsContextImpl {
            accumulator: &mut accumulator,
            lane: &mut lane,
        };
        context.flush_path();
    }
    if mode == ShapeBoundsMode::Ink {
        let mut lane = create_shape_bounds_lane_state(true);
        let mut cursor = ShapeCommandCursor {
            argument_count: 0,
            argument_offset: 0,
            commands,
        };
        let mut ignored_complete = true;
        run_lane(
            &mut accumulator,
            &mut lane,
            commands,
            &state,
            &mut cursor,
            source,
            mode,
            false,
            &mut ignored_complete,
        );
        let mut context = ShapeBoundsContextImpl {
            accumulator: &mut accumulator,
            lane: &mut lane,
        };
        context.flush_path();
    }
    write_shape_bounds_rectangle(out, &accumulator);
    return complete;
}

fn cubic_shape_bounds_curve_to(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    c1x: f64,
    c1y: f64,
    c2x: f64,
    c2y: f64,
    x: f64,
    y: f64,
) {
    ensure_shape_bounds_current_point(state);
    let padding = get_shape_bounds_lane_padding(state);
    if padding >= 0.0 {
        expand_shape_bounds_cubic(
            accumulator,
            state.pen_x,
            state.pen_y,
            c1x,
            c1y,
            c2x,
            c2y,
            x,
            y,
            padding,
        );
    }
    if state.writes_stroke && state.has_stroke {
        set_shape_bounds_tangent(
            &mut state.tangent_start,
            c1x - state.pen_x,
            c1y - state.pen_y,
        );
        if state.tangent_start.x == 0.0 && state.tangent_start.y == 0.0 {
            set_shape_bounds_tangent(
                &mut state.tangent_start,
                c2x - state.pen_x,
                c2y - state.pen_y,
            );
        }
        if state.tangent_start.x == 0.0 && state.tangent_start.y == 0.0 {
            set_shape_bounds_tangent(&mut state.tangent_start, x - state.pen_x, y - state.pen_y);
        }
        set_shape_bounds_tangent(&mut state.tangent_end, x - c2x, y - c2y);
        if state.tangent_end.x == 0.0 && state.tangent_end.y == 0.0 {
            set_shape_bounds_tangent(&mut state.tangent_end, x - c1x, y - c1y);
        }
        if state.tangent_end.x == 0.0 && state.tangent_end.y == 0.0 {
            set_shape_bounds_tangent(&mut state.tangent_end, x - state.pen_x, y - state.pen_y);
        }
        append_shape_bounds_segment(
            accumulator,
            state,
            state.pen_x,
            state.pen_y,
            x,
            y,
            state.tangent_start.x,
            state.tangent_start.y,
            state.tangent_end.x,
            state.tangent_end.y,
        );
    }
    state.pen_x = x;
    state.pen_y = y;
}

/// The source's exported handler set, as registry entries.
pub(crate) fn default_shape_bounds_commands() -> Vec<ShapeBoundsCommand> {
    return vec![
        flush_command("beginTextureFill"),
        flush_command("beginFill"),
        flush_command("beginGradientFill"),
        both_command("cubicCurveTo", default_shape_bounds_cubic_curve_to),
        both_command("quadraticCurveTo", default_shape_bounds_quadratic_curve_to),
        both_command("drawCircle", default_shape_bounds_draw_circle),
        both_command("drawEllipse", default_shape_bounds_draw_ellipse),
        both_command("drawPath", default_shape_bounds_draw_path),
        both_command("drawRectangle", default_shape_bounds_draw_rectangle),
        both_command(
            "drawRoundedRectangle",
            default_shape_bounds_draw_rounded_rectangle,
        ),
        flush_command("endFill"),
        null_command("lineTextureStyle"),
        null_command("lineGradientStyle"),
        split_command(
            "lineStyle",
            default_shape_bounds_flush,
            default_shape_bounds_line_style,
        ),
        both_command("lineTo", default_shape_bounds_line_to),
        both_command("moveTo", default_shape_bounds_move_to),
    ];
}

/// The default cubic controller handler (TS `defaultShapeBoundsCubicCurveTo`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_cubic_curve_to(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    context.cubic_curve_to(
        number_at(command, 0),
        number_at(command, 1),
        number_at(command, 2),
        number_at(command, 3),
        number_at(command, 4),
        number_at(command, 5),
    );
}

/// The default circle handler (TS `defaultShapeBoundsDrawCircle`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_draw_circle(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    context.draw_circle(
        number_at(command, 0),
        number_at(command, 1),
        number_at(command, 2),
    );
}

/// The default ellipse handler (TS `defaultShapeBoundsDrawEllipse`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_draw_ellipse(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    context.draw_ellipse(
        number_at(command, 0),
        number_at(command, 1),
        number_at(command, 2),
        number_at(command, 3),
    );
}

/// The default raw path handler (TS `defaultShapeBoundsDrawPath`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_draw_path(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    let path_commands = numbers_at(command, 0);
    let data = numbers_at(command, 1);
    let mut data_index = 0;
    for path_command in path_commands {
        match *path_command as u8 {
            0 => {}
            1 => {
                context.move_to(data[data_index], data[data_index + 1]);
                data_index += 2;
            }
            2 => {
                context.line_to(data[data_index], data[data_index + 1]);
                data_index += 2;
            }
            3 => {
                context.quadratic_curve_to(
                    data[data_index],
                    data[data_index + 1],
                    data[data_index + 2],
                    data[data_index + 3],
                );
                data_index += 4;
            }
            4 => {
                context.move_to(data[data_index + 2], data[data_index + 3]);
                data_index += 4;
            }
            5 => {
                context.line_to(data[data_index + 2], data[data_index + 3]);
                data_index += 4;
            }
            6 => {
                context.cubic_curve_to(
                    data[data_index],
                    data[data_index + 1],
                    data[data_index + 2],
                    data[data_index + 3],
                    data[data_index + 4],
                    data[data_index + 5],
                );
                data_index += 6;
            }
            7 => context.close_path(),
            _ => {}
        }
    }
}

/// The default rectangle handler (TS `defaultShapeBoundsDrawRectangle`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_draw_rectangle(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    context.draw_rectangle(
        number_at(command, 0),
        number_at(command, 1),
        number_at(command, 2),
        number_at(command, 3),
    );
}

/// The default rounded rectangle handler (TS `defaultShapeBoundsDrawRoundedRectangle`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_draw_rounded_rectangle(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    context.draw_rounded_rectangle(
        number_at(command, 0),
        number_at(command, 1),
        number_at(command, 2),
        number_at(command, 3),
        number_at(command, 4),
    );
}

/// Expands every (x, y) pair of the first argument (TS `defaultShapeBoundsExpandPointPairs`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_expand_point_pairs(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    let values = numbers_at(command, 0);
    let mut index = 0;
    while index + 1 < values.len() {
        context.expand_point(values[index], values[index + 1]);
        index += 2;
    }
}

/// Flushes the active subpath (TS `defaultShapeBoundsFlush`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_flush(
    context: &mut dyn ShapeBoundsContext,
    _command: &dyn ShapeCommandArgumentCursor,
) {
    context.flush_path();
}

/// Applies the authored line style to the stroke lane (TS `defaultShapeBoundsLineStyle`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_line_style(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    let caps = crate::shape_commands::parse_caps_style(string_at(command, 5));
    let joints = crate::shape_commands::parse_joint_style(string_at(command, 6));
    context.set_stroke_style(number_at(command, 0), caps, joints, number_at(command, 7));
}

/// The default lineTo handler (TS `defaultShapeBoundsLineTo`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_line_to(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    context.line_to(number_at(command, 0), number_at(command, 1));
}

/// The default moveTo handler (TS `defaultShapeBoundsMoveTo`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_move_to(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    context.move_to(number_at(command, 0), number_at(command, 1));
}

/// The default quadratic controller handler (TS `defaultShapeBoundsQuadraticCurveTo`).
// flight-lint: allow(conform-extra) TS exports these handler values as constants; Rust exports them as the free functions the registry wraps
pub fn default_shape_bounds_quadratic_curve_to(
    context: &mut dyn ShapeBoundsContext,
    command: &dyn ShapeCommandArgumentCursor,
) {
    context.quadratic_curve_to(
        number_at(command, 0),
        number_at(command, 1),
        number_at(command, 2),
        number_at(command, 3),
    );
}

fn draw_shape_bounds_circle(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    center_x: f64,
    center_y: f64,
    radius: f64,
) {
    finish_shape_bounds_open_subpath(accumulator, state, false);
    let padding = get_shape_bounds_lane_padding(state);
    if padding >= 0.0 {
        let magnitude = radius.abs();
        expand_shape_bounds_point(
            accumulator,
            center_x - magnitude,
            center_y - magnitude,
            padding,
        );
        expand_shape_bounds_point(
            accumulator,
            center_x + magnitude,
            center_y + magnitude,
            padding,
        );
    }
    state.has_current_point = true;
    state.pen_x = center_x + radius;
    state.pen_y = center_y;
    state.subpath_start_x = state.pen_x;
    state.subpath_start_y = state.pen_y;
}

fn draw_shape_bounds_ellipse(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    center_x: f64,
    center_y: f64,
    radius_x: f64,
    radius_y: f64,
) {
    finish_shape_bounds_open_subpath(accumulator, state, false);
    let padding = get_shape_bounds_lane_padding(state);
    if padding >= 0.0 {
        expand_shape_bounds_point(
            accumulator,
            center_x - radius_x.abs(),
            center_y - radius_y.abs(),
            padding,
        );
        expand_shape_bounds_point(
            accumulator,
            center_x + radius_x.abs(),
            center_y + radius_y.abs(),
            padding,
        );
    }
    state.has_current_point = true;
    state.pen_x = center_x + radius_x;
    state.pen_y = center_y;
    state.subpath_start_x = state.pen_x;
    state.subpath_start_y = state.pen_y;
}

fn draw_shape_bounds_rectangle(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) {
    finish_shape_bounds_open_subpath(accumulator, state, false);
    let padding = get_shape_bounds_lane_padding(state);
    if padding >= 0.0 {
        expand_shape_bounds_point(accumulator, x.min(x + width), y.min(y + height), padding);
        expand_shape_bounds_point(accumulator, x.max(x + width), y.max(y + height), padding);
    }
    state.has_current_point = true;
    state.pen_x = x;
    state.pen_y = y;
    state.subpath_start_x = x;
    state.subpath_start_y = y;
}

fn draw_shape_bounds_rounded_rectangle(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    authored_radius: f64,
) {
    finish_shape_bounds_open_subpath(accumulator, state, false);
    let padding = get_shape_bounds_lane_padding(state);
    if padding >= 0.0 {
        expand_shape_bounds_point(accumulator, x.min(x + width), y.min(y + height), padding);
        expand_shape_bounds_point(accumulator, x.max(x + width), y.max(y + height), padding);
    }
    let radius = authored_radius
        .max(0.0)
        .min(width.abs() / 2.0)
        .min(height.abs() / 2.0);
    state.has_current_point = true;
    state.pen_x = x + radius;
    state.pen_y = y;
    state.subpath_start_x = state.pen_x;
    state.subpath_start_y = state.pen_y;
}

fn ensure_shape_bounds_current_point(state: &mut ShapeBoundsLaneState) {
    if state.has_current_point {
        return;
    }
    state.has_current_point = true;
    state.pen_x = 0.0;
    state.pen_y = 0.0;
    state.subpath_start_x = 0.0;
    state.subpath_start_y = 0.0;
}

fn expand_shape_bounds_cubic(
    accumulator: &mut ShapeBoundsAccumulator,
    p0x: f64,
    p0y: f64,
    p1x: f64,
    p1y: f64,
    p2x: f64,
    p2y: f64,
    p3x: f64,
    p3y: f64,
    padding: f64,
) {
    expand_shape_bounds_point(accumulator, p0x, p0y, padding);
    expand_shape_bounds_point(accumulator, p3x, p3y, padding);
    expand_shape_bounds_cubic_axis(
        accumulator,
        p0x,
        p1x,
        p2x,
        p3x,
        p0y,
        p1y,
        p2y,
        p3y,
        padding,
        true,
    );
    expand_shape_bounds_cubic_axis(
        accumulator,
        p0y,
        p1y,
        p2y,
        p3y,
        p0x,
        p1x,
        p2x,
        p3x,
        padding,
        false,
    );
}

fn expand_shape_bounds_cubic_axis(
    accumulator: &mut ShapeBoundsAccumulator,
    p0: f64,
    p1: f64,
    p2: f64,
    p3: f64,
    q0: f64,
    q1: f64,
    q2: f64,
    q3: f64,
    padding: f64,
    primary_is_x: bool,
) {
    let a = -p0 + 3.0 * p1 - 3.0 * p2 + p3;
    let b = 2.0 * (p0 - 2.0 * p1 + p2);
    let c = -p0 + p1;
    if a.abs() < 1e-12 {
        if b.abs() > 1e-12 {
            let t = -c / b;
            if t > 0.0 && t < 1.0 {
                expand_shape_bounds_cubic_axis_point(
                    accumulator,
                    t,
                    p0,
                    p1,
                    p2,
                    p3,
                    q0,
                    q1,
                    q2,
                    q3,
                    padding,
                    primary_is_x,
                );
            }
        }
        return;
    }
    let discriminant = b * b - 4.0 * a * c;
    if discriminant < 0.0 {
        return;
    }
    let root = discriminant.sqrt();
    let t1 = (-b + root) / (2.0 * a);
    let t2 = (-b - root) / (2.0 * a);
    if t1 > 0.0 && t1 < 1.0 {
        expand_shape_bounds_cubic_axis_point(
            accumulator,
            t1,
            p0,
            p1,
            p2,
            p3,
            q0,
            q1,
            q2,
            q3,
            padding,
            primary_is_x,
        );
    }
    if t2 > 0.0 && t2 < 1.0 {
        expand_shape_bounds_cubic_axis_point(
            accumulator,
            t2,
            p0,
            p1,
            p2,
            p3,
            q0,
            q1,
            q2,
            q3,
            padding,
            primary_is_x,
        );
    }
}

#[allow(clippy::too_many_arguments)]
fn expand_shape_bounds_cubic_axis_point(
    accumulator: &mut ShapeBoundsAccumulator,
    t: f64,
    p0: f64,
    p1: f64,
    p2: f64,
    p3: f64,
    q0: f64,
    q1: f64,
    q2: f64,
    q3: f64,
    padding: f64,
    primary_is_x: bool,
) {
    let primary = get_shape_bounds_cubic_point(t, p0, p1, p2, p3);
    let secondary = get_shape_bounds_cubic_point(t, q0, q1, q2, q3);
    if primary_is_x {
        expand_shape_bounds_point(accumulator, primary, secondary, padding);
    } else {
        expand_shape_bounds_point(accumulator, secondary, primary, padding);
    }
}

fn expand_shape_bounds_join(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &ShapeBoundsLaneState,
    x: f64,
    y: f64,
    incoming_x: f64,
    incoming_y: f64,
    outgoing_x: f64,
    outgoing_y: f64,
) {
    if state.stroke_join != JointStyle::Miter {
        return;
    }
    let cross = incoming_x * outgoing_y - incoming_y * outgoing_x;
    if cross.abs() < 1e-8 {
        return;
    }
    let half_width = state.stroke_width / 2.0;
    let incoming_normal_x = -incoming_y;
    let incoming_normal_y = incoming_x;
    let outgoing_normal_x = -outgoing_y;
    let outgoing_normal_y = outgoing_x;
    let delta_x = (outgoing_normal_x - incoming_normal_x) * half_width;
    let delta_y = (outgoing_normal_y - incoming_normal_y) * half_width;
    let distance = (delta_x * outgoing_y - delta_y * outgoing_x) / cross;
    let miter_x = x + incoming_normal_x * half_width + incoming_x * distance;
    let miter_y = y + incoming_normal_y * half_width + incoming_y * distance;
    let length = ((miter_x - x).powi(2) + (miter_y - y).powi(2)).sqrt();
    if length > half_width * state.stroke_miter_limit {
        return;
    }
    expand_shape_bounds_point(accumulator, miter_x, miter_y, 0.0);
    expand_shape_bounds_point(accumulator, x * 2.0 - miter_x, y * 2.0 - miter_y, 0.0);
}

fn expand_shape_bounds_line(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &ShapeBoundsLaneState,
    start_x: f64,
    start_y: f64,
    end_x: f64,
    end_y: f64,
) {
    let padding = get_shape_bounds_lane_padding(state);
    if padding < 0.0 {
        return;
    }
    expand_shape_bounds_point(accumulator, start_x, start_y, padding);
    expand_shape_bounds_point(accumulator, end_x, end_y, padding);
}

fn expand_shape_bounds_point(
    accumulator: &mut ShapeBoundsAccumulator,
    x: f64,
    y: f64,
    padding: f64,
) {
    accumulator.min_x = accumulator.min_x.min(x - padding);
    accumulator.min_y = accumulator.min_y.min(y - padding);
    accumulator.max_x = accumulator.max_x.max(x + padding);
    accumulator.max_y = accumulator.max_y.max(y + padding);
}

fn expand_shape_bounds_point_for_lane(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &ShapeBoundsLaneState,
    x: f64,
    y: f64,
) {
    let padding = get_shape_bounds_lane_padding(state);
    if padding >= 0.0 {
        expand_shape_bounds_point(accumulator, x, y, padding);
    }
}

fn expand_shape_bounds_quadratic(
    accumulator: &mut ShapeBoundsAccumulator,
    p0x: f64,
    p0y: f64,
    p1x: f64,
    p1y: f64,
    p2x: f64,
    p2y: f64,
    padding: f64,
) {
    expand_shape_bounds_point(accumulator, p0x, p0y, padding);
    expand_shape_bounds_point(accumulator, p2x, p2y, padding);
    let denominator_x = p0x - 2.0 * p1x + p2x;
    if denominator_x != 0.0 {
        let t = (p0x - p1x) / denominator_x;
        if t > 0.0 && t < 1.0 {
            expand_shape_bounds_point(
                accumulator,
                get_shape_bounds_quadratic_point(t, p0x, p1x, p2x),
                get_shape_bounds_quadratic_point(t, p0y, p1y, p2y),
                padding,
            );
        }
    }
    let denominator_y = p0y - 2.0 * p1y + p2y;
    if denominator_y != 0.0 {
        let t = (p0y - p1y) / denominator_y;
        if t > 0.0 && t < 1.0 {
            expand_shape_bounds_point(
                accumulator,
                get_shape_bounds_quadratic_point(t, p0x, p1x, p2x),
                get_shape_bounds_quadratic_point(t, p0y, p1y, p2y),
                padding,
            );
        }
    }
}

fn expand_shape_bounds_square_cap(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &ShapeBoundsLaneState,
    x: f64,
    y: f64,
    direction: f64,
) {
    let segment = if direction < 0.0 {
        &state.first_segment
    } else {
        &state.pending_segment
    };
    let tangent_x = if direction < 0.0 {
        segment.start_tangent_x
    } else {
        segment.end_tangent_x
    };
    let tangent_y = if direction < 0.0 {
        segment.start_tangent_y
    } else {
        segment.end_tangent_y
    };
    let half_width = state.stroke_width / 2.0;
    let extension_x = tangent_x * half_width * direction;
    let extension_y = tangent_y * half_width * direction;
    let normal_x = -tangent_y * half_width;
    let normal_y = tangent_x * half_width;
    expand_shape_bounds_point(
        accumulator,
        x + extension_x + normal_x,
        y + extension_y + normal_y,
        0.0,
    );
    expand_shape_bounds_point(
        accumulator,
        x + extension_x - normal_x,
        y + extension_y - normal_y,
        0.0,
    );
}

/// The explanation of missing bounds contributions (TS `explainShapeBounds`).
pub fn explain_shape_bounds(
    source: &dyn Node,
    mode: Option<ShapeBoundsMode>,
) -> ShapeBoundsExplanation {
    let mode = mode.unwrap_or(ShapeBoundsMode::Ink);
    let Some(commands) = shape_commands_of(source) else {
        return ShapeBoundsExplanation {
            complete: true,
            missing_command_keys: Vec::new(),
            mode,
        };
    };
    let state = shape_bounds_state_of(source);
    let mut missing: Vec<String> = Vec::new();
    let mut index = 0;
    while index < commands.len() {
        let key = commands[index].as_str().unwrap_or("");
        let registered = state
            .as_ref()
            .and_then(|state| get_shape_bounds_command(state, key))
            .is_some();
        if !registered && !missing.iter().any(|entry| entry == key) {
            missing.push(String::from(key));
        }
        index += commands[index + 1].as_number().unwrap_or(0.0) as usize + 2;
    }
    return ShapeBoundsExplanation {
        complete: missing.is_empty(),
        missing_command_keys: missing,
        mode,
    };
}

fn finish_shape_bounds_open_subpath(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    reset_current_point: bool,
) {
    if state.writes_stroke && state.has_stroke && state.has_pending_segment {
        if state.stroke_cap == CapsStyle::Square {
            expand_shape_bounds_square_cap(
                accumulator,
                state,
                state.first_segment.start_x,
                state.first_segment.start_y,
                -1.0,
            );
            expand_shape_bounds_square_cap(
                accumulator,
                state,
                state.pending_segment.end_x,
                state.pending_segment.end_y,
                1.0,
            );
        }
    }
    state.has_first_segment = false;
    state.has_pending_segment = false;
    if reset_current_point {
        state.has_current_point = false;
    }
}

fn flush_command(key: &str) -> ShapeBoundsCommand {
    return ShapeBoundsCommand {
        fill_bounds: Some(Arc::new(default_shape_bounds_flush)),
        key: String::from(key),
        stroke_bounds: Some(Arc::new(default_shape_bounds_flush)),
    };
}

fn flush_shape_bounds_path(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
) {
    finish_shape_bounds_open_subpath(accumulator, state, true);
}

fn get_shape_bounds_cubic_point(t: f64, p0: f64, p1: f64, p2: f64, p3: f64) -> f64 {
    let u = 1.0 - t;
    return u * u * u * p0 + 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * p3;
}

fn get_shape_bounds_lane_padding(state: &ShapeBoundsLaneState) -> f64 {
    if !state.writes_stroke {
        return 0.0;
    }
    return if state.has_stroke {
        state.stroke_width / 2.0
    } else {
        -1.0
    };
}

fn get_shape_bounds_quadratic_point(t: f64, p0: f64, p1: f64, p2: f64) -> f64 {
    let u = 1.0 - t;
    return u * u * p0 + 2.0 * u * t * p1 + t * t * p2;
}

fn line_shape_bounds_to(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    x: f64,
    y: f64,
) {
    ensure_shape_bounds_current_point(state);
    expand_shape_bounds_line(accumulator, state, state.pen_x, state.pen_y, x, y);
    if state.writes_stroke && state.has_stroke {
        set_shape_bounds_tangent(&mut state.tangent_start, x - state.pen_x, y - state.pen_y);
        append_shape_bounds_segment(
            accumulator,
            state,
            state.pen_x,
            state.pen_y,
            x,
            y,
            state.tangent_start.x,
            state.tangent_start.y,
            state.tangent_start.x,
            state.tangent_start.y,
        );
    }
    state.pen_x = x;
    state.pen_y = y;
}

fn move_shape_bounds_to(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    x: f64,
    y: f64,
) {
    finish_shape_bounds_open_subpath(accumulator, state, false);
    state.has_current_point = true;
    state.pen_x = x;
    state.pen_y = y;
    state.subpath_start_x = x;
    state.subpath_start_y = y;
}

/// Normalizes a stroke miter limit (TS `normalizeShapeStrokeMiterLimit`).
pub fn normalize_shape_stroke_miter_limit(miter_limit: f64) -> f64 {
    return if miter_limit.is_finite() && miter_limit > 0.0 {
        miter_limit
    } else {
        DEFAULT_SHAPE_STROKE_MITER_LIMIT
    };
}

/// Normalizes a stroke width; zero stays zero (TS `normalizeShapeStrokeWidth`).
pub fn normalize_shape_stroke_width(width: f64) -> f64 {
    if width == 0.0 {
        return 0.0;
    }
    return if width.is_finite() && width > 0.0 {
        width
    } else {
        DEFAULT_SHAPE_STROKE_WIDTH
    };
}

fn null_command(key: &str) -> ShapeBoundsCommand {
    return ShapeBoundsCommand {
        fill_bounds: None,
        key: String::from(key),
        stroke_bounds: None,
    };
}

fn number_at(command: &dyn ShapeCommandArgumentCursor, index: usize) -> f64 {
    return command
        .get_argument(index)
        .and_then(|token| token.as_number())
        .unwrap_or(f64::NAN);
}

fn numbers_at<'a>(command: &'a dyn ShapeCommandArgumentCursor, index: usize) -> &'a Vec<f64> {
    return command
        .get_argument(index)
        .and_then(|token| token.as_numbers())
        .expect("shape bounds handler expects a numeric array argument");
}

fn quadratic_shape_bounds_curve_to(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    control_x: f64,
    control_y: f64,
    x: f64,
    y: f64,
) {
    ensure_shape_bounds_current_point(state);
    let padding = get_shape_bounds_lane_padding(state);
    if padding >= 0.0 {
        expand_shape_bounds_quadratic(
            accumulator,
            state.pen_x,
            state.pen_y,
            control_x,
            control_y,
            x,
            y,
            padding,
        );
    }
    if state.writes_stroke && state.has_stroke {
        set_shape_bounds_tangent(
            &mut state.tangent_start,
            control_x - state.pen_x,
            control_y - state.pen_y,
        );
        if state.tangent_start.x == 0.0 && state.tangent_start.y == 0.0 {
            set_shape_bounds_tangent(&mut state.tangent_start, x - state.pen_x, y - state.pen_y);
        }
        set_shape_bounds_tangent(&mut state.tangent_end, x - control_x, y - control_y);
        if state.tangent_end.x == 0.0 && state.tangent_end.y == 0.0 {
            set_shape_bounds_tangent(&mut state.tangent_end, x - state.pen_x, y - state.pen_y);
        }
        append_shape_bounds_segment(
            accumulator,
            state,
            state.pen_x,
            state.pen_y,
            x,
            y,
            state.tangent_start.x,
            state.tangent_start.y,
            state.tangent_end.x,
            state.tangent_end.y,
        );
    }
    state.pen_x = x;
    state.pen_y = y;
}

fn run_lane(
    accumulator: &mut ShapeBoundsAccumulator,
    lane: &mut ShapeBoundsLaneState,
    commands: &[ShapeCommandToken],
    state: &ShapeBoundsStateRef,
    cursor: &mut ShapeCommandCursor,
    source: &dyn Node,
    mode: ShapeBoundsMode,
    fill: bool,
    complete: &mut bool,
) {
    let mut index = 0;
    while index < commands.len() {
        let key = commands[index].as_str().unwrap_or("");
        let argument_count = commands[index + 1].as_number().unwrap_or(0.0) as usize;
        cursor.set(index + 2, argument_count);
        let command = get_shape_bounds_command(state, key);
        match command {
            None => {
                if fill {
                    *complete = false;
                    let guard = state.read().unwrap().guard.clone();
                    if let Some(guard) = guard {
                        guard(source, mode, key);
                    }
                }
            }
            Some(command) => {
                let handler = if fill {
                    command.fill_bounds.clone()
                } else {
                    command.stroke_bounds.clone()
                };
                if let Some(handler) = handler {
                    let mut context = ShapeBoundsContextImpl { accumulator, lane };
                    handler(&mut context, cursor);
                }
            }
        }
        index += argument_count + 2;
    }
}

fn set_shape_bounds_segment(
    out: &mut ShapeBoundsSegment,
    start_x: f64,
    start_y: f64,
    end_x: f64,
    end_y: f64,
    start_tangent_x: f64,
    start_tangent_y: f64,
    end_tangent_x: f64,
    end_tangent_y: f64,
) {
    out.start_x = start_x;
    out.start_y = start_y;
    out.end_x = end_x;
    out.end_y = end_y;
    out.start_tangent_x = start_tangent_x;
    out.start_tangent_y = start_tangent_y;
    out.end_tangent_x = end_tangent_x;
    out.end_tangent_y = end_tangent_y;
}

fn set_shape_bounds_stroke_style(
    accumulator: &mut ShapeBoundsAccumulator,
    state: &mut ShapeBoundsLaneState,
    width: f64,
    caps: CapsStyle,
    joints: JointStyle,
    miter_limit: f64,
) {
    flush_shape_bounds_path(accumulator, state);
    if !state.writes_stroke {
        return;
    }
    state.stroke_width = normalize_shape_stroke_width(width);
    state.has_stroke = state.stroke_width > 0.0;
    state.stroke_cap = caps;
    state.stroke_join = joints;
    state.stroke_miter_limit = normalize_shape_stroke_miter_limit(miter_limit);
}

fn set_shape_bounds_tangent(out: &mut ShapeBoundsTangent, x: f64, y: f64) {
    let length = (x * x + y * y).sqrt();
    if length == 0.0 {
        out.x = 0.0;
        out.y = 0.0;
        return;
    }
    out.x = x / length;
    out.y = y / length;
}

pub(crate) fn shape_bounds_state_of(node: &dyn Node) -> Option<ShapeBoundsStateRef> {
    return crate::types::shape_bounds_state_of(node);
}

pub(crate) fn shape_commands_of(node: &dyn Node) -> Option<&Vec<ShapeCommandToken>> {
    return shape_commands(node);
}

fn split_command(key: &str, fill: Handler, stroke: Handler) -> ShapeBoundsCommand {
    return ShapeBoundsCommand {
        fill_bounds: Some(Arc::new(fill)),
        key: String::from(key),
        stroke_bounds: Some(Arc::new(stroke)),
    };
}

fn string_at<'a>(command: &'a dyn ShapeCommandArgumentCursor, index: usize) -> &'a str {
    return command
        .get_argument(index)
        .and_then(|token| token.as_str())
        .unwrap_or("");
}

fn write_shape_bounds_rectangle(out: &mut Rectangle, accumulator: &ShapeBoundsAccumulator) {
    if accumulator.min_x == f64::INFINITY {
        out.x = 0.0;
        out.y = 0.0;
        out.width = 0.0;
        out.height = 0.0;
        return;
    }
    out.x = accumulator.min_x as f32;
    out.y = accumulator.min_y as f32;
    out.width = (accumulator.max_x - accumulator.min_x) as f32;
    out.height = (accumulator.max_y - accumulator.min_y) as f32;
}

impl ShapeCommandCursor<'_> {
    // flight-lint: allow(sugar-delegates) data-view adapter: the cursor stores a borrow window, it is not public sugar
    fn set(&mut self, argument_offset: usize, argument_count: usize) {
        self.argument_offset = argument_offset;
        self.argument_count = argument_count;
    }
}

// flight-lint: allow(sugar-delegates) data-view adapter: the cursor exposes the command window through the shape cursor trait
impl ShapeCommandArgumentCursor for ShapeCommandCursor<'_> {
    fn get_argument(&self, relative_index: usize) -> Option<&ShapeCommandToken> {
        if relative_index >= self.argument_count {
            return None;
        }
        return self.commands.get(self.argument_offset + relative_index);
    }

    fn length(&self) -> usize {
        return self.argument_count;
    }
}

impl ShapeBoundsContext for ShapeBoundsContextImpl<'_> {
    fn close_path(&mut self) {
        close_shape_bounds_path(self.accumulator, self.lane);
    }

    // flight-lint: allow(f64) D1: bounds geometry runs in the f64 command lane
    fn cubic_curve_to(&mut self, c1x: f64, c1y: f64, c2x: f64, c2y: f64, x: f64, y: f64) {
        cubic_shape_bounds_curve_to(self.accumulator, self.lane, c1x, c1y, c2x, c2y, x, y);
    }

    fn draw_circle(&mut self, cx: f64, cy: f64, radius: f64) {
        draw_shape_bounds_circle(self.accumulator, self.lane, cx, cy, radius);
    }

    fn draw_ellipse(&mut self, cx: f64, cy: f64, rx: f64, ry: f64) {
        draw_shape_bounds_ellipse(self.accumulator, self.lane, cx, cy, rx, ry);
    }

    fn draw_rectangle(&mut self, x: f64, y: f64, width: f64, height: f64) {
        draw_shape_bounds_rectangle(self.accumulator, self.lane, x, y, width, height);
    }

    fn draw_rounded_rectangle(&mut self, x: f64, y: f64, width: f64, height: f64, radius: f64) {
        draw_shape_bounds_rounded_rectangle(
            self.accumulator,
            self.lane,
            x,
            y,
            width,
            height,
            radius,
        );
    }

    fn expand_point(&mut self, x: f64, y: f64) {
        expand_shape_bounds_point_for_lane(self.accumulator, self.lane, x, y);
    }

    fn flush_path(&mut self) {
        flush_shape_bounds_path(self.accumulator, self.lane);
    }

    fn line_to(&mut self, x: f64, y: f64) {
        line_shape_bounds_to(self.accumulator, self.lane, x, y);
    }

    fn move_to(&mut self, x: f64, y: f64) {
        move_shape_bounds_to(self.accumulator, self.lane, x, y);
    }

    fn quadratic_curve_to(&mut self, cx: f64, cy: f64, x: f64, y: f64) {
        quadratic_shape_bounds_curve_to(self.accumulator, self.lane, cx, cy, x, y);
    }

    fn set_stroke_style(
        &mut self,
        width: f64,
        caps: CapsStyle,
        joints: JointStyle,
        miter_limit: f64,
    ) {
        set_shape_bounds_stroke_style(
            self.accumulator,
            self.lane,
            width,
            caps,
            joints,
            miter_limit,
        );
    }
}
