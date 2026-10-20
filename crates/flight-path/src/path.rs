use flight_geometry::Matrix;

/// The CIRCLE_KAPPA constant: 4*(sqrt(2)-1)/3.
/// Optimal cubic Bezier arc approximation constant.
/// Maximum radial error is less than 0.03% of the radius.
const CIRCLE_KAPPA: f64 = 0.5522847498307936;

/// Path command verb codes stored in the commands array.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum PathCommand {
    MoveTo = 0,
    LineTo = 1,
    QuadraticCurveTo = 2,
    CubicCurveTo = 3,
    Close = 4,
    WideMoveTo = 5,
    WideLineTo = 6,
}

/// Path winding rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PathWinding {
    #[default]
    NonZero,
    EvenOdd,
}

/// A 2D vector path: a command stream paired with a flat coordinate data array.
/// Commands encode the verb (move, line, curve, close); data holds the coordinate
/// pairs consumed by each verb. Winding rule determines fill behavior.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Path {
    pub commands: Vec<u8>,
    pub data: Vec<f64>,
    pub winding: PathWinding,
}

/// A triangulated mesh: flat (x,y) vertex pairs and triangle index triples.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PathMesh {
    pub vertices: Vec<f64>,
    pub indices: Vec<u32>,
}

/// Stroke line cap style.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StrokeCap {
    #[default]
    Butt,
    Round,
    Square,
}

/// Stroke line join style.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StrokeJoin {
    #[default]
    Miter,
    Bevel,
    Round,
}

/// Stroke style parameters.
#[derive(Debug, Clone, PartialEq)]
pub struct StrokeStyle {
    pub width: f64,
    pub cap: StrokeCap,
    pub join: StrokeJoin,
    pub miter_limit: f64,
    pub dash: Vec<f64>,
    pub dash_offset: f64,
}

impl Default for StrokeStyle {
    fn default() -> Self {
        return StrokeStyle {
            width: 1.0,
            cap: StrokeCap::Butt,
            join: StrokeJoin::Miter,
            miter_limit: 4.0,
            dash: Vec::new(),
            dash_offset: 0.0,
        };
    }
}

/// Prepared interpolation between two paths for morphing.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PathMorph {
    pub commands: Vec<u8>,
    pub start_data: Vec<f64>,
    pub end_data: Vec<f64>,
    pub winding: PathWinding,
}

/// Reason a path morph could not be created.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PathMorphCreationReason {
    Ok,
    WindingMismatch,
    ContourCountMismatch,
    ContourClosednessMismatch,
    ContourOrientationMismatch,
}

/// Explanation of whether two paths can be morphed.
#[derive(Debug, Clone, PartialEq)]
pub struct PathMorphCreationExplanation {
    pub supported: bool,
    pub reason: PathMorphCreationReason,
    pub contour: Option<usize>,
}

/// Reason a stroke path tessellation failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StrokePathTessellationReason {
    Ok,
    InvalidStyle,
    InvalidPath,
    SelfIntersectingCenterline,
    ReversingJoin,
    SelfIntersectingOutline,
}

/// Explanation of whether a stroke path could be tessellated.
#[derive(Debug, Clone, PartialEq)]
pub struct StrokePathTessellationExplanation {
    pub supported: bool,
    pub reason: StrokePathTessellationReason,
    pub subpath: Option<usize>,
}

/// Decoded path segment for iteration.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PathSegment {
    MoveTo { x: f64, y: f64 },
    LineTo { x: f64, y: f64 },
    QuadraticCurveTo { control_x: f64, control_y: f64, x: f64, y: f64 },
    CubicCurveTo { control_x1: f64, control_y1: f64, control_x2: f64, control_y2: f64, x: f64, y: f64 },
    Close,
}

pub fn create_path(winding: PathWinding) -> Path {
    let mut out = Path::default();
    initialize_path(&mut out, winding);
    return out;
}

pub fn initialize_path(out: &mut Path, winding: PathWinding) {
    out.commands = Vec::new();
    out.data = Vec::new();
    out.winding = winding;
}

pub fn create_path_mesh() -> PathMesh {
    return PathMesh { vertices: Vec::new(), indices: Vec::new() };
}

pub fn create_stroke_style() -> StrokeStyle {
    return StrokeStyle::default();
}

/// Appends a MOVE_TO command and its point to the path.
pub fn append_path_move_to(path: &mut Path, x: f64, y: f64) {
    path.commands.push(PathCommand::MoveTo as u8);
    path.data.push(x);
    path.data.push(y);
}

/// Appends a LINE_TO command and its point to the path.
pub fn append_path_line_to(path: &mut Path, x: f64, y: f64) {
    path.commands.push(PathCommand::LineTo as u8);
    path.data.push(x);
    path.data.push(y);
}

/// Appends a QUADRATIC_CURVE_TO command with its control point and anchor.
pub fn append_path_quadratic_curve_to(path: &mut Path, control_x: f64, control_y: f64, x: f64, y: f64) {
    path.commands.push(PathCommand::QuadraticCurveTo as u8);
    path.data.push(control_x);
    path.data.push(control_y);
    path.data.push(x);
    path.data.push(y);
}

/// Appends a CUBIC_CURVE_TO command with two control points and an anchor.
pub fn append_path_cubic_curve_to(
    path: &mut Path,
    control_x1: f64,
    control_y1: f64,
    control_x2: f64,
    control_y2: f64,
    x: f64,
    y: f64,
) {
    path.commands.push(PathCommand::CubicCurveTo as u8);
    path.data.push(control_x1);
    path.data.push(control_y1);
    path.data.push(control_x2);
    path.data.push(control_y2);
    path.data.push(x);
    path.data.push(y);
}

/// Closes the current contour back to the most recent MOVE_TO origin.
pub fn append_path_close(path: &mut Path) {
    path.commands.push(PathCommand::Close as u8);
}

/// Approximates a circle centered at (center_x, center_y) with the given radius using four cubic
/// bezier segments. Appends a MOVE_TO before the circle and a CLOSE at the end.
pub fn append_path_circle(path: &mut Path, center_x: f64, center_y: f64, radius: f64) {
    append_path_ellipse(path, center_x, center_y, radius, radius);
}

/// Approximates an axis-aligned ellipse using four cubic bezier segments.
pub fn append_path_ellipse(
    path: &mut Path,
    center_x: f64,
    center_y: f64,
    radius_x: f64,
    radius_y: f64,
) {
    let kx = radius_x * CIRCLE_KAPPA;
    let ky = radius_y * CIRCLE_KAPPA;
    append_path_move_to(path, center_x + radius_x, center_y);
    append_path_cubic_curve_to(
        path,
        center_x + radius_x, center_y - ky,
        center_x + kx, center_y - radius_y,
        center_x, center_y - radius_y,
    );
    append_path_cubic_curve_to(
        path,
        center_x - kx, center_y - radius_y,
        center_x - radius_x, center_y - ky,
        center_x - radius_x, center_y,
    );
    append_path_cubic_curve_to(
        path,
        center_x - radius_x, center_y + ky,
        center_x - kx, center_y + radius_y,
        center_x, center_y + radius_y,
    );
    append_path_cubic_curve_to(
        path,
        center_x + kx, center_y + radius_y,
        center_x + radius_x, center_y + ky,
        center_x + radius_x, center_y,
    );
    append_path_close(path);
}

/// Approximates an arc centered at (center_x, center_y) from start_angle to end_angle with the
/// given radius. Uses one or more cubic bezier segments spanning at most pi/2 each.
pub fn append_path_arc(
    path: &mut Path,
    center_x: f64,
    center_y: f64,
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    anticlockwise: bool,
    connect_to_current: bool,
) {
    if radius <= 0.0 {
        return;
    }
    let mut sweep = end_angle - start_angle;
    if anticlockwise {
        if sweep > 0.0 {
            sweep -= std::f64::consts::PI * 2.0;
        }
    } else {
        if sweep < 0.0 {
            sweep += std::f64::consts::PI * 2.0;
        }
    }
    let arc_start_x = center_x + start_angle.cos() * radius;
    let arc_start_y = center_y + start_angle.sin() * radius;
    if connect_to_current {
        append_path_line_to(path, arc_start_x, arc_start_y);
    } else {
        append_path_move_to(path, arc_start_x, arc_start_y);
    }
    append_arc_cubics(path, center_x, center_y, radius, radius, 0.0, start_angle, sweep);
}

/// Appends an SVG-style elliptic arc from the current point to (end_x, end_y).
pub fn append_path_elliptical_arc_to(
    path: &mut Path,
    radius_x: f64,
    radius_y: f64,
    x_axis_rotation: f64,
    large_arc: bool,
    sweep: bool,
    end_x: f64,
    end_y: f64,
) {
    if radius_x == 0.0 || radius_y == 0.0 {
        append_path_line_to(path, end_x, end_y);
        return;
    }
    let last = get_path_last_point(path);
    let x1 = last.map_or(0.0, |p| p.0);
    let y1 = last.map_or(0.0, |p| p.1);
    let x2 = end_x;
    let y2 = end_y;
    if x1 == x2 && y1 == y2 {
        return;
    }
    let mut rx = radius_x.abs();
    let mut ry = radius_y.abs();
    let cos_phi = x_axis_rotation.cos();
    let sin_phi = x_axis_rotation.sin();
    let dx = (x1 - x2) / 2.0;
    let dy = (y1 - y2) / 2.0;
    let x1p = cos_phi * dx + sin_phi * dy;
    let y1p = -sin_phi * dx + cos_phi * dy;
    let x1p_sq = x1p * x1p;
    let y1p_sq = y1p * y1p;
    let rx_sq = rx * rx;
    let ry_sq = ry * ry;
    let lambda = x1p_sq / rx_sq + y1p_sq / ry_sq;
    if lambda > 1.0 {
        let sqrt_lambda = lambda.sqrt();
        rx *= sqrt_lambda;
        ry *= sqrt_lambda;
    }
    let rx_sq2 = rx * rx;
    let ry_sq2 = ry * ry;
    let num = rx_sq2 * ry_sq2 - rx_sq2 * y1p_sq - ry_sq2 * x1p_sq;
    let den = rx_sq2 * y1p_sq + ry_sq2 * x1p_sq;
    let sq = if den <= 0.0 { 0.0 } else { (num / den).max(0.0).sqrt() };
    let sign = if large_arc == sweep { -1.0 } else { 1.0 };
    let cxp = sign * sq * (rx * y1p) / ry;
    let cyp = sign * sq * (-ry * x1p) / rx;
    let cx = cos_phi * cxp - sin_phi * cyp + (x1 + x2) / 2.0;
    let cy = sin_phi * cxp + cos_phi * cyp + (y1 + y2) / 2.0;
    let ux = (x1p - cxp) / rx;
    let uy = (y1p - cyp) / ry;
    let vx = (-x1p - cxp) / rx;
    let vy = (-y1p - cyp) / ry;
    let theta1 = vector_angle(1.0, 0.0, ux, uy);
    let mut dtheta = vector_angle(ux, uy, vx, vy);
    if !sweep && dtheta > 0.0 {
        dtheta -= std::f64::consts::PI * 2.0;
    }
    if sweep && dtheta < 0.0 {
        dtheta += std::f64::consts::PI * 2.0;
    }
    append_arc_cubics(path, cx, cy, rx, ry, x_axis_rotation, theta1, dtheta);
}

/// Appends a closed polygon from a flat array of coordinate pairs.
pub fn append_path_polygon(path: &mut Path, points: &[f64]) {
    if points.len() < 6 {
        return;
    }
    append_path_move_to(path, points[0], points[1]);
    let mut i = 2;
    while i < points.len() {
        append_path_line_to(path, points[i], points[i + 1]);
        i += 2;
    }
    append_path_close(path);
}

/// Appends an open polyline from a flat array of coordinate pairs.
pub fn append_path_polyline(path: &mut Path, points: &[f64]) {
    if points.len() < 4 {
        return;
    }
    append_path_move_to(path, points[0], points[1]);
    let mut i = 2;
    while i < points.len() {
        append_path_line_to(path, points[i], points[i + 1]);
        i += 2;
    }
}

/// Appends a closed axis-aligned rectangle.
pub fn append_path_rectangle(path: &mut Path, x: f64, y: f64, width: f64, height: f64) {
    append_path_move_to(path, x, y);
    append_path_line_to(path, x + width, y);
    append_path_line_to(path, x + width, y + height);
    append_path_line_to(path, x, y + height);
    append_path_close(path);
}

/// Appends a closed rounded rectangle with uniform corner radius.
pub fn append_path_rounded_rectangle(
    path: &mut Path,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    radius: f64,
) {
    append_path_rounded_rectangle_with_corner_radii(path, x, y, width, height, radius, radius, radius, radius);
}

/// Appends a closed rounded rectangle with per-corner radii.
pub fn append_path_rounded_rectangle_with_corner_radii(
    path: &mut Path,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    top_left: f64,
    top_right: f64,
    bottom_right: f64,
    bottom_left: f64,
) {
    let (rtl, rtr, rbr, rbl) = normalize_corner_radii(top_left, top_right, bottom_right, bottom_left, width, height);
    append_path_move_to(path, x + rtl, y);
    append_path_line_to(path, x + width - rtr, y);
    append_corner_arc(path, x + width - rtr, y + rtr, rtr, -std::f64::consts::FRAC_PI_2, 0.0);
    append_path_line_to(path, x + width, y + height - rbr);
    append_corner_arc(path, x + width - rbr, y + height - rbr, rbr, 0.0, std::f64::consts::FRAC_PI_2);
    append_path_line_to(path, x + rbl, y + height);
    append_corner_arc(path, x + rbl, y + height - rbl, rbl, std::f64::consts::FRAC_PI_2, std::f64::consts::PI);
    append_path_line_to(path, x, y + rtl);
    append_corner_arc(path, x + rtl, y + rtl, rtl, std::f64::consts::PI, std::f64::consts::PI * 3.0 / 2.0);
    append_path_close(path);
}

/// Appends an arc tangent to the two lines (pen, x1, y1) and (x1, y1, x2, y2).
pub fn append_path_tangent_arc_to(
    path: &mut Path,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    radius: f64,
) {
    let last = get_path_last_point(path);
    let pen_x = last.map_or(0.0, |p| p.0);
    let pen_y = last.map_or(0.0, |p| p.1);
    let d1x = pen_x - x1;
    let d1y = pen_y - y1;
    let d2x = x2 - x1;
    let d2y = y2 - y1;
    let len1 = (d1x * d1x + d1y * d1y).sqrt();
    let len2 = (d2x * d2x + d2y * d2y).sqrt();
    if radius <= 0.0 || len1 < 1e-10 || len2 < 1e-10 {
        append_path_line_to(path, x1, y1);
        return;
    }
    let cos_half = (d1x * d2x + d1y * d2y) / (len1 * len2);
    let clamped_cos = cos_half.max(-1.0).min(1.0);
    let half_angle = clamped_cos.acos() / 2.0;
    if half_angle.sin().abs() < 1e-10 {
        append_path_line_to(path, x1, y1);
        return;
    }
    let d = radius / half_angle.tan();
    let n1x = d1x / len1;
    let n1y = d1y / len1;
    let tx1 = x1 + n1x * d;
    let ty1 = y1 + n1y * d;
    let n2x = d2x / len2;
    let n2y = d2y / len2;
    let tx2 = x1 + n2x * d;
    let ty2 = y1 + n2y * d;
    append_path_line_to(path, tx1, ty1);
    let bx = (n1x + n2x) / 2.0;
    let by = (n1y + n2y) / 2.0;
    let blen = (bx * bx + by * by).sqrt();
    let dist_to_center = radius / half_angle.sin();
    let ocx = x1 + (bx / blen) * dist_to_center;
    let ocy = y1 + (by / blen) * dist_to_center;
    let start_a = (ty1 - ocy).atan2(tx1 - ocx);
    let end_a = (ty2 - ocy).atan2(tx2 - ocx);
    let mut arc_sweep = end_a - start_a;
    if arc_sweep > std::f64::consts::PI {
        arc_sweep -= std::f64::consts::PI * 2.0;
    }
    if arc_sweep < -std::f64::consts::PI {
        arc_sweep += std::f64::consts::PI * 2.0;
    }
    append_arc_cubics(path, ocx, ocy, radius, radius, 0.0, start_a, arc_sweep);
}

/// Returns the current pen position after the last command, or None for an empty path.
pub fn get_path_last_point(path: &Path) -> Option<(f64, f64)> {
    if path.data.len() < 2 {
        return None;
    }
    let last = path.commands.len();
    if last == 0 {
        return None;
    }
    let last_cmd = path.commands[last - 1];
    if last_cmd != PathCommand::Close as u8 {
        return Some((path.data[path.data.len() - 2], path.data[path.data.len() - 1]));
    }
    let mut di = path.data.len();
    let mut ci = last as isize - 2;
    while ci >= 0 {
        let cmd = path.commands[ci as usize];
        di -= path_command_data_count(cmd);
        if cmd == PathCommand::MoveTo as u8 {
            return Some((path.data[di], path.data[di + 1]));
        }
        if cmd == PathCommand::WideMoveTo as u8 {
            return Some((path.data[di + 2], path.data[di + 3]));
        }
        ci -= 1;
    }
    return None;
}

fn path_command_data_count(cmd: u8) -> usize {
    if cmd == PathCommand::MoveTo as u8 || cmd == PathCommand::LineTo as u8 {
        return 2;
    }
    if cmd == PathCommand::QuadraticCurveTo as u8 || cmd == PathCommand::WideMoveTo as u8 || cmd == PathCommand::WideLineTo as u8 {
        return 4;
    }
    if cmd == PathCommand::CubicCurveTo as u8 {
        return 6;
    }
    return 0;
}

fn normalize_corner_radii(
    top_left: f64,
    top_right: f64,
    bottom_right: f64,
    bottom_left: f64,
    width: f64,
    height: f64,
) -> (f64, f64, f64, f64) {
    let half_w = width.abs() / 2.0;
    let half_h = height.abs() / 2.0;
    let clamp_tl = top_left.max(0.0).min(half_w).min(half_h);
    let clamp_tr = top_right.max(0.0).min(half_w).min(half_h);
    let clamp_br = bottom_right.max(0.0).min(half_w).min(half_h);
    let clamp_bl = bottom_left.max(0.0).min(half_w).min(half_h);
    return (clamp_tl, clamp_tr, clamp_br, clamp_bl);
}

fn append_corner_arc(
    path: &mut Path,
    cx: f64,
    cy: f64,
    radius: f64,
    start_angle: f64,
    end_angle: f64,
) {
    if radius <= 0.0 {
        return;
    }
    let k = radius * CIRCLE_KAPPA;
    let cos_start = start_angle.cos();
    let sin_start = start_angle.sin();
    let cos_end = end_angle.cos();
    let sin_end = end_angle.sin();
    append_path_cubic_curve_to(
        path,
        cx + cos_start * radius - sin_start * k,
        cy + sin_start * radius + cos_start * k,
        cx + cos_end * radius + sin_end * k,
        cy + sin_end * radius - cos_end * k,
        cx + cos_end * radius,
        cy + sin_end * radius,
    );
}

fn append_arc_cubics(
    path: &mut Path,
    cx: f64,
    cy: f64,
    rx: f64,
    ry: f64,
    x_axis_rotation: f64,
    theta1: f64,
    dtheta: f64,
) {
    if dtheta == 0.0 {
        return;
    }
    let n_segs = 1.max((dtheta.abs() / (std::f64::consts::FRAC_PI_2)).ceil() as usize);
    let dt = dtheta / n_segs as f64;
    let cos_phi = x_axis_rotation.cos();
    let sin_phi = x_axis_rotation.sin();
    for i in 0..n_segs {
        let t1 = theta1 + i as f64 * dt;
        let t2 = t1 + dt;
        let cos1 = t1.cos();
        let sin1 = t1.sin();
        let cos2 = t2.cos();
        let sin2 = t2.sin();
        let alpha = (4.0 / 3.0) * (dt / 4.0).tan();
        let dx1 = -rx * sin1 * alpha;
        let dy1 = ry * cos1 * alpha;
        let dx2 = rx * sin2 * alpha;
        let dy2 = -ry * cos2 * alpha;
        let p1x = cx + cos_phi * rx * cos1 - sin_phi * ry * sin1;
        let p1y = cy + sin_phi * rx * cos1 + cos_phi * ry * sin1;
        let p2x = cx + cos_phi * rx * cos2 - sin_phi * ry * sin2;
        let p2y = cy + sin_phi * rx * cos2 + cos_phi * ry * sin2;
        let c1x = p1x + cos_phi * dx1 - sin_phi * dy1;
        let c1y = p1y + sin_phi * dx1 + cos_phi * dy1;
        let c2x = p2x + cos_phi * dx2 - sin_phi * dy2;
        let c2y = p2y + sin_phi * dx2 + cos_phi * dy2;
        append_path_cubic_curve_to(path, c1x, c1y, c2x, c2y, p2x, p2y);
    }
}

fn vector_angle(ux: f64, uy: f64, vx: f64, vy: f64) -> f64 {
    let dot = ux * vx + uy * vy;
    let len_u = (ux * ux + uy * uy).sqrt();
    let len_v = (vx * vx + vy * vy).sqrt();
    if len_u == 0.0 || len_v == 0.0 {
        return 0.0;
    }
    let cos_angle = (dot / (len_u * len_v)).max(-1.0).min(1.0);
    let angle = cos_angle.acos();
    return if ux * vy - uy * vx < 0.0 { -angle } else { angle };
}
