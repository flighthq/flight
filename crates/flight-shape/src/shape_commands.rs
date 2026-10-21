//! Retained shape command stream appenders (TS `shapeCommands.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32
// flight-lint: allow-file(contract-vocabulary) D16 open shape family: ShapeNode bounds and structural node dispatch on the shape command/bounds surface are contract dispatch, not arbitrary vocabulary types

use flight_entity::Ref;
use flight_geometry::Matrix;
use flight_math::CIRCLE_KAPPA;
use flight_node::contract::{NodeRef, invalidate_content};
use flight_texture::contract::Texture;

use crate::types::*;

// flight-lint: allow(f64) D1: shape command tokens carry path-space coordinates and morph progress in the canonical f64 Path lane
fn append<T: ShapeNode + 'static>(shape: &Ref<T>, tokens: &[ShapeCommandToken]) {
    {
        let mut guard = shape.write().unwrap();
        guard.shape_commands_mut().extend_from_slice(tokens);
    }
    invalidate(shape);
}

/// Appends a standalone arc as a moveTo followed by cubic approximations (TS `appendShapeArc`).
// flight-lint: allow(f64) D1: angles and radii are JS numbers converted exactly into the f64 command lane
pub fn append_shape_arc<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    center_x: f64,
    center_y: f64,
    radius: f64,
    start_angle: f64,
    end_angle: f64,
    anticlockwise: Option<bool>,
) {
    let anticlockwise = anticlockwise.unwrap_or(false);
    let sweep = normalize_arc_sweep(start_angle, end_angle, anticlockwise);
    let segment_count = ((sweep.abs() / (std::f64::consts::PI / 2.0)).ceil() as usize).max(1);
    let segment_angle = sweep / segment_count as f64;
    let alpha = (4.0 / 3.0) * (segment_angle / 4.0).tan();
    let mut tokens = command(
        "moveTo",
        &[
            number(center_x + radius * start_angle.cos()),
            number(center_y + radius * start_angle.sin()),
        ],
    );
    push_arc_cubics(
        &mut tokens,
        center_x,
        center_y,
        radius,
        start_angle,
        segment_count,
        segment_angle,
        alpha,
    );
    append(shape, &tokens);
}

/// Appends `beginFill` (TS `appendShapeBeginFill`).
// flight-lint: allow(f64) D1: the alpha is a JS number in the f64 command lane
pub fn append_shape_begin_fill<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    color: u32,
    alpha: Option<f64>,
) {
    append(
        shape,
        &command(
            "beginFill",
            &[number(color as f64), number(alpha.unwrap_or(1.0))],
        ),
    );
}

/// Appends `beginGradientFill` (TS `appendShapeBeginGradientFill`).
// flight-lint: allow(f64) D1: alphas, ratios and the focal point ratio are JS numbers in the f64 command lane
// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f64] slice lane
pub fn append_shape_begin_gradient_fill<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    gradient_type: GradientType,
    colors: &[u32],
    alphas: &[f64],
    ratios: &[f64],
    matrix: Option<&Matrix>,
    spread_method: Option<SpreadMethod>,
    interpolation_method: Option<InterpolationMethod>,
    focal_point_ratio: Option<f64>,
) {
    let mut args = gradient_args(
        gradient_type,
        colors,
        alphas,
        ratios,
        matrix,
        spread_method.unwrap_or(SpreadMethod::Pad),
        interpolation_method.unwrap_or(InterpolationMethod::Rgb),
        focal_point_ratio.unwrap_or(0.0),
    );
    let mut tokens = command("beginGradientFill", &[]);
    tokens.append(&mut args);
    tokens[1] = number(8.0);
    append(shape, &tokens);
}

/// Appends `beginTextureFill` (TS `appendShapeBeginTextureFill`).
pub fn append_shape_begin_texture_fill<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    texture: &Ref<Texture>,
    matrix: Option<&Matrix>,
) {
    append(
        shape,
        &command(
            "beginTextureFill",
            &[texture_token(texture), matrix_token(matrix)],
        ),
    );
}

/// Appends `drawCircle` (TS `appendShapeCircle`).
pub fn append_shape_circle<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    center_x: f64,
    center_y: f64,
    radius: f64,
) {
    append(
        shape,
        &command(
            "drawCircle",
            &[number(center_x), number(center_y), number(radius)],
        ),
    );
}

/// Appends `cubicCurveTo` (TS `appendShapeCubicCurveTo`).
pub fn append_shape_cubic_curve_to<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    control_x1: f64,
    control_y1: f64,
    control_x2: f64,
    control_y2: f64,
    x: f64,
    y: f64,
) {
    append(
        shape,
        &command(
            "cubicCurveTo",
            &[
                number(control_x1),
                number(control_y1),
                number(control_x2),
                number(control_y2),
                number(x),
                number(y),
            ],
        ),
    );
}

/// Appends `drawTriangles` (TS `appendShapeDrawTriangles`).
// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f64] slice lane
pub fn append_shape_draw_triangles<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    vertices: &[f64],
    indices: Option<&[f64]>,
    uvt_data: Option<&[f64]>,
    culling: Option<TriangleCulling>,
) {
    append(
        shape,
        &command(
            "drawTriangles",
            &[
                numbers(vertices),
                match indices {
                    Some(values) => numbers(values),
                    None => ShapeCommandToken::Null,
                },
                match uvt_data {
                    Some(values) => numbers(values),
                    None => ShapeCommandToken::Null,
                },
                string(triangle_culling_string(
                    culling.unwrap_or(TriangleCulling::None),
                )),
            ],
        ),
    );
}

/// Appends `drawEllipse` (TS `appendShapeEllipse`).
pub fn append_shape_ellipse<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    center_x: f64,
    center_y: f64,
    radius_x: f64,
    radius_y: f64,
) {
    append(
        shape,
        &command(
            "drawEllipse",
            &[
                number(center_x),
                number(center_y),
                number(radius_x),
                number(radius_y),
            ],
        ),
    );
}

/// Appends an SVG-style elliptical arc starting from the current pen (TS
/// `appendShapeEllipticalArcTo`).
pub fn append_shape_elliptical_arc_to<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    radius_x: f64,
    radius_y: f64,
    x_axis_rotation: f64,
    large_arc: bool,
    sweep: bool,
    x: f64,
    y: f64,
) {
    if radius_x == 0.0 || radius_y == 0.0 {
        append(shape, &command("lineTo", &[number(x), number(y)]));
        return;
    }
    let (pen_x, pen_y) = {
        let guard = shape.read().unwrap();
        pen_position(guard.shape_commands())
    };
    if pen_x == x && pen_y == y {
        return;
    }
    let mut rx = radius_x.abs();
    let mut ry = radius_y.abs();
    let cos_phi = x_axis_rotation.cos();
    let sin_phi = x_axis_rotation.sin();
    let dx = (pen_x - x) / 2.0;
    let dy = (pen_y - y) / 2.0;
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
    let sq = if den <= 0.0 {
        0.0
    } else {
        (num / den).max(0.0).sqrt()
    };
    let sign = if large_arc == sweep { -1.0 } else { 1.0 };
    let cxp = (sign * sq * (rx * y1p)) / ry;
    let cyp = (sign * sq * (-ry * x1p)) / rx;
    let cx = cos_phi * cxp - sin_phi * cyp + (pen_x + x) / 2.0;
    let cy = sin_phi * cxp + cos_phi * cyp + (pen_y + y) / 2.0;
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
    if dtheta == 0.0 {
        return;
    }
    let segment_count = ((dtheta.abs() / (std::f64::consts::PI / 2.0)).ceil() as usize).max(1);
    let segment_angle = dtheta / segment_count as f64;
    let alpha = (4.0 / 3.0) * (segment_angle / 4.0).tan();
    let mut tokens: Vec<ShapeCommandToken> = Vec::new();
    for seg in 0..segment_count {
        let t1 = theta1 + seg as f64 * segment_angle;
        let t2 = t1 + segment_angle;
        let cos1 = t1.cos();
        let sin1 = t1.sin();
        let cos2 = t2.cos();
        let sin2 = t2.sin();
        let d1x = -rx * sin1 * alpha;
        let d1y = ry * cos1 * alpha;
        let d2x = rx * sin2 * alpha;
        let d2y = -ry * cos2 * alpha;
        let p1x = cx + cos_phi * rx * cos1 - sin_phi * ry * sin1;
        let p1y = cy + sin_phi * rx * cos1 + cos_phi * ry * sin1;
        let p2x = cx + cos_phi * rx * cos2 - sin_phi * ry * sin2;
        let p2y = cy + sin_phi * rx * cos2 + cos_phi * ry * sin2;
        let c1x = p1x + cos_phi * d1x - sin_phi * d1y;
        let c1y = p1y + sin_phi * d1x + cos_phi * d1y;
        let c2x = p2x + cos_phi * d2x - sin_phi * d2y;
        let c2y = p2y + sin_phi * d2x + cos_phi * d2y;
        tokens.extend(command(
            "cubicCurveTo",
            &[
                number(c1x),
                number(c1y),
                number(c2x),
                number(c2y),
                number(p2x),
                number(p2y),
            ],
        ));
    }
    append(shape, &tokens);
}

/// Appends `endFill` (TS `appendShapeEndFill`).
pub fn append_shape_end_fill<T: ShapeNode + 'static>(shape: &Ref<T>) {
    append(shape, &command("endFill", &[]));
}

/// Appends `lineGradientStyle` (TS `appendShapeLineGradientStyle`).
// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f64] slice lane
pub fn append_shape_line_gradient_style<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    gradient_type: GradientType,
    colors: &[u32],
    alphas: &[f64],
    ratios: &[f64],
    matrix: Option<&Matrix>,
    spread_method: Option<SpreadMethod>,
    interpolation_method: Option<InterpolationMethod>,
    focal_point_ratio: Option<f64>,
) {
    let mut args = gradient_args(
        gradient_type,
        colors,
        alphas,
        ratios,
        matrix,
        spread_method.unwrap_or(SpreadMethod::Pad),
        interpolation_method.unwrap_or(InterpolationMethod::Rgb),
        focal_point_ratio.unwrap_or(0.0),
    );
    let mut tokens = command("lineGradientStyle", &[]);
    tokens.append(&mut args);
    tokens[1] = number(8.0);
    append(shape, &tokens);
}

/// Appends `lineStyle` (TS `appendShapeLineStyle`).
pub fn append_shape_line_style<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    thickness: Option<f64>,
    color: u32,
    alpha: Option<f64>,
    pixel_hinting: Option<bool>,
    scale_mode: Option<LineScaleMode>,
    caps: Option<CapsStyle>,
    joints: Option<JointStyle>,
    miter_limit: Option<f64>,
) {
    append(
        shape,
        &command(
            "lineStyle",
            &[
                number(thickness.unwrap_or(1.0)),
                number(color as f64),
                number(alpha.unwrap_or(1.0)),
                ShapeCommandToken::Boolean(pixel_hinting.unwrap_or(false)),
                string(line_scale_mode_string(
                    scale_mode.unwrap_or(LineScaleMode::Normal),
                )),
                string(caps_style_string(caps.unwrap_or(CapsStyle::None))),
                string(joint_style_string(joints.unwrap_or(JointStyle::Round))),
                number(miter_limit.unwrap_or(3.0)),
            ],
        ),
    );
}

/// Appends `lineTextureStyle` (TS `appendShapeLineTextureStyle`).
pub fn append_shape_line_texture_style<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    texture: &Ref<Texture>,
    matrix: Option<&Matrix>,
) {
    append(
        shape,
        &command(
            "lineTextureStyle",
            &[texture_token(texture), matrix_token(matrix)],
        ),
    );
}

/// Appends `lineTo` (TS `appendShapeLineTo`).
pub fn append_shape_line_to<T: ShapeNode + 'static>(shape: &Ref<T>, x: f64, y: f64) {
    append(shape, &command("lineTo", &[number(x), number(y)]));
}

/// Appends `moveTo` (TS `appendShapeMoveTo`).
pub fn append_shape_move_to<T: ShapeNode + 'static>(shape: &Ref<T>, x: f64, y: f64) {
    append(shape, &command("moveTo", &[number(x), number(y)]));
}

/// Appends `drawPath` (TS `appendShapePath`).
// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f64] slice lane
pub fn append_shape_path<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    commands: &[u8],
    path_data: &[f64],
    winding: Option<flight_path::PathWinding>,
) {
    let command_values: Vec<f64> = commands.iter().map(|value| *value as f64).collect();
    append(
        shape,
        &command(
            "drawPath",
            &[
                shape_token_numbers(&command_values),
                numbers(path_data),
                crate::types::winding(winding.unwrap_or(flight_path::PathWinding::EvenOdd)),
            ],
        ),
    );
}

/// Appends a closed polygon as moveTo/lineTo commands (TS `appendShapePolygon`).
// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f64] slice lane
pub fn append_shape_polygon<T: ShapeNode + 'static>(shape: &Ref<T>, points: &[f64]) {
    if points.len() < 4 {
        return;
    }
    let mut tokens = command("moveTo", &[number(points[0]), number(points[1])]);
    let mut index = 2;
    while index < points.len() - 1 {
        tokens.extend(command(
            "lineTo",
            &[number(points[index]), number(points[index + 1])],
        ));
        index += 2;
    }
    tokens.extend(command("lineTo", &[number(points[0]), number(points[1])]));
    append(shape, &tokens);
}

/// Appends an open polyline as moveTo/lineTo commands (TS `appendShapePolyline`).
// flight-lint: allow(conform-array) D9 array negotiation: TS readonly number[] maps to the canonical &[f64] slice lane
pub fn append_shape_polyline<T: ShapeNode + 'static>(shape: &Ref<T>, points: &[f64]) {
    if points.len() < 4 {
        return;
    }
    let mut tokens = command("moveTo", &[number(points[0]), number(points[1])]);
    let mut index = 2;
    while index < points.len() - 1 {
        tokens.extend(command(
            "lineTo",
            &[number(points[index]), number(points[index + 1])],
        ));
        index += 2;
    }
    append(shape, &tokens);
}

/// Appends `quadraticCurveTo` (TS `appendShapeQuadraticCurveTo`).
pub fn append_shape_quadratic_curve_to<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    control_x: f64,
    control_y: f64,
    x: f64,
    y: f64,
) {
    append(
        shape,
        &command(
            "quadraticCurveTo",
            &[number(control_x), number(control_y), number(x), number(y)],
        ),
    );
}

/// Appends `drawRectangle` (TS `appendShapeRectangle`).
pub fn append_shape_rectangle<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) {
    append(
        shape,
        &command(
            "drawRectangle",
            &[number(x), number(y), number(width), number(height)],
        ),
    );
}

/// Appends `drawRoundedRectangle` (TS `appendShapeRoundedRectangle`).
pub fn append_shape_rounded_rectangle<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    radius: f64,
) {
    append(
        shape,
        &command(
            "drawRoundedRectangle",
            &[
                number(x),
                number(y),
                number(width),
                number(height),
                number(radius),
            ],
        ),
    );
}

/// Appends a rectangle with per-corner radii as moveTo/lineTo/cubicCurveTo commands (TS
/// `appendShapeRoundedRectangleWithCornerRadii`).
pub fn append_shape_rounded_rectangle_with_corner_radii<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    top_left: f64,
    top_right: f64,
    bottom_right: f64,
    bottom_left: f64,
) {
    let right = x + width;
    let bottom = y + height;
    let kappa = CIRCLE_KAPPA as f64;
    let k_tr = top_right * kappa;
    let k_br = bottom_right * kappa;
    let k_bl = bottom_left * kappa;
    let k_tl = top_left * kappa;
    let mut tokens = command("moveTo", &[number(x + top_left), number(y)]);
    tokens.extend(command("lineTo", &[number(right - top_right), number(y)]));
    tokens.extend(command(
        "cubicCurveTo",
        &[
            number(right - top_right + k_tr),
            number(y),
            number(right),
            number(y + top_right - k_tr),
            number(right),
            number(y + top_right),
        ],
    ));
    tokens.extend(command(
        "lineTo",
        &[number(right), number(bottom - bottom_right)],
    ));
    tokens.extend(command(
        "cubicCurveTo",
        &[
            number(right),
            number(bottom - bottom_right + k_br),
            number(right - bottom_right + k_br),
            number(bottom),
            number(right - bottom_right),
            number(bottom),
        ],
    ));
    tokens.extend(command(
        "lineTo",
        &[number(x + bottom_left), number(bottom)],
    ));
    tokens.extend(command(
        "cubicCurveTo",
        &[
            number(x + bottom_left - k_bl),
            number(bottom),
            number(x),
            number(bottom - bottom_left + k_bl),
            number(x),
            number(bottom - bottom_left),
        ],
    ));
    tokens.extend(command("lineTo", &[number(x), number(y + top_left)]));
    tokens.extend(command(
        "cubicCurveTo",
        &[
            number(x),
            number(y + top_left - k_tl),
            number(x + top_left - k_tl),
            number(y),
            number(x + top_left),
            number(y),
        ],
    ));
    append(shape, &tokens);
}

/// Appends an SVG-style tangent arc from the current pen (TS `appendShapeTangentArcTo`).
pub fn append_shape_tangent_arc_to<T: ShapeNode + 'static>(
    shape: &Ref<T>,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    radius: f64,
) {
    let (pen_x, pen_y) = {
        let guard = shape.read().unwrap();
        pen_position(guard.shape_commands())
    };
    let d1x = pen_x - x1;
    let d1y = pen_y - y1;
    let d2x = x2 - x1;
    let d2y = y2 - y1;
    let len1 = (d1x * d1x + d1y * d1y).sqrt();
    let len2 = (d2x * d2x + d2y * d2y).sqrt();
    if radius <= 0.0 || len1 < 1e-10 || len2 < 1e-10 {
        append(shape, &command("lineTo", &[number(x1), number(y1)]));
        return;
    }
    let cos_half = (d1x * d2x + d1y * d2y) / (len1 * len2);
    let clamped_cos = cos_half.max(-1.0).min(1.0);
    let half_angle = clamped_cos.acos() / 2.0;
    if half_angle.sin().abs() < 1e-10 {
        append(shape, &command("lineTo", &[number(x1), number(y1)]));
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
    let mut tokens = command("lineTo", &[number(tx1), number(ty1)]);
    let bx = (n1x + n2x) / 2.0;
    let by = (n1y + n2y) / 2.0;
    let blen = (bx * bx + by * by).sqrt();
    let dist_to_center = radius / half_angle.sin();
    let ocx = x1 + (bx / blen) * dist_to_center;
    let ocy = y1 + (by / blen) * dist_to_center;
    let start_a = (ty1 - ocy).atan2(tx1 - ocx);
    let end_a = (ty2 - ocy).atan2(tx2 - ocx);
    let mut sweep = end_a - start_a;
    if sweep > std::f64::consts::PI {
        sweep -= std::f64::consts::PI * 2.0;
    }
    if sweep < -std::f64::consts::PI {
        sweep += std::f64::consts::PI * 2.0;
    }
    let segment_count = ((sweep.abs() / (std::f64::consts::PI / 2.0)).ceil() as usize).max(1);
    let segment_angle = sweep / segment_count as f64;
    let alpha = (4.0 / 3.0) * (segment_angle / 4.0).tan();
    push_arc_cubics(
        &mut tokens,
        ocx,
        ocy,
        radius,
        start_a,
        segment_count,
        segment_angle,
        alpha,
    );
    append(shape, &tokens);
}

pub(crate) fn caps_style_string(value: CapsStyle) -> &'static str {
    return match value {
        CapsStyle::None => "none",
        CapsStyle::Round => "round",
        CapsStyle::Square => "square",
    };
}

fn command(key: &str, args: &[ShapeCommandToken]) -> Vec<ShapeCommandToken> {
    let mut out = Vec::with_capacity(args.len() + 2);
    out.push(string(key));
    out.push(number(args.len() as f64));
    out.extend_from_slice(args);
    return out;
}

fn gradient_args(
    gradient_type: GradientType,
    colors: &[u32],
    alphas: &[f64],
    ratios: &[f64],
    matrix: Option<&Matrix>,
    spread_method: SpreadMethod,
    interpolation_method: InterpolationMethod,
    focal_point_ratio: f64,
) -> Vec<ShapeCommandToken> {
    let color_values: Vec<f64> = colors.iter().map(|value| *value as f64).collect();
    return vec![
        string(gradient_type_string(gradient_type)),
        shape_token_numbers(&color_values),
        numbers(alphas),
        numbers(ratios),
        matrix_token(matrix),
        string(spread_method_string(spread_method)),
        string(interpolation_method_string(interpolation_method)),
        number(focal_point_ratio),
    ];
}

pub(crate) fn gradient_type_string(value: GradientType) -> &'static str {
    return match value {
        GradientType::Linear => "linear",
        GradientType::Radial => "radial",
    };
}

pub(crate) fn interpolation_method_string(value: InterpolationMethod) -> &'static str {
    return match value {
        InterpolationMethod::LinearRgb => "linearRGB",
        InterpolationMethod::Rgb => "rgb",
    };
}

fn invalidate<T: ShapeNode + 'static>(shape: &Ref<T>) {
    let node: NodeRef = shape.clone();
    invalidate_content(&node);
}

pub(crate) fn joint_style_string(value: JointStyle) -> &'static str {
    return match value {
        JointStyle::Bevel => "bevel",
        JointStyle::Miter => "miter",
        JointStyle::Round => "round",
    };
}

pub(crate) fn line_scale_mode_string(value: LineScaleMode) -> &'static str {
    return match value {
        LineScaleMode::Horizontal => "horizontal",
        LineScaleMode::None => "none",
        LineScaleMode::Normal => "normal",
        LineScaleMode::Vertical => "vertical",
    };
}

fn matrix_token(matrix: Option<&Matrix>) -> ShapeCommandToken {
    return match matrix {
        Some(value) => ShapeCommandToken::Matrix(value.clone()),
        None => ShapeCommandToken::Null,
    };
}

fn normalize_arc_sweep(start_angle: f64, end_angle: f64, anticlockwise: bool) -> f64 {
    let mut sweep = end_angle - start_angle;
    if anticlockwise {
        if sweep > 0.0 {
            sweep -= std::f64::consts::PI * 2.0;
        }
    } else if sweep < 0.0 {
        sweep += std::f64::consts::PI * 2.0;
    }
    return sweep;
}

pub(crate) fn parse_caps_style(value: &str) -> CapsStyle {
    return match value {
        "round" => CapsStyle::Round,
        "square" => CapsStyle::Square,
        _ => CapsStyle::None,
    };
}

pub(crate) fn parse_joint_style(value: &str) -> JointStyle {
    return match value {
        "bevel" => JointStyle::Bevel,
        "miter" => JointStyle::Miter,
        _ => JointStyle::Round,
    };
}

/// The current pen position recovered from the command stream (TS scans the same verbs).
pub(crate) fn pen_position(commands: &[ShapeCommandToken]) -> (f64, f64) {
    let mut pen_x = 0.0;
    let mut pen_y = 0.0;
    let mut index = 0;
    while index < commands.len() {
        let key = commands[index].as_str().unwrap_or("");
        let argument_count = commands[index + 1].as_number().unwrap_or(0.0);
        let base = index + 2;
        match key {
            "moveTo" | "lineTo" => {
                pen_x = commands[base].as_number().unwrap_or(0.0);
                pen_y = commands[base + 1].as_number().unwrap_or(0.0);
            }
            "quadraticCurveTo" => {
                pen_x = commands[base + 2].as_number().unwrap_or(0.0);
                pen_y = commands[base + 3].as_number().unwrap_or(0.0);
            }
            "cubicCurveTo" => {
                pen_x = commands[base + 4].as_number().unwrap_or(0.0);
                pen_y = commands[base + 5].as_number().unwrap_or(0.0);
            }
            _ => {}
        }
        index = base + argument_count as usize;
    }
    return (pen_x, pen_y);
}

fn push_arc_cubics(
    tokens: &mut Vec<ShapeCommandToken>,
    cx: f64,
    cy: f64,
    radius: f64,
    start_angle: f64,
    segment_count: usize,
    segment_angle: f64,
    alpha: f64,
) {
    let mut angle = start_angle;
    for _ in 0..segment_count {
        let next_angle = angle + segment_angle;
        let cos_a = angle.cos();
        let sin_a = angle.sin();
        let cos_b = next_angle.cos();
        let sin_b = next_angle.sin();
        tokens.extend(command(
            "cubicCurveTo",
            &[
                number(cx + radius * (cos_a - alpha * sin_a)),
                number(cy + radius * (sin_a + alpha * cos_a)),
                number(cx + radius * (cos_b + alpha * sin_b)),
                number(cy + radius * (sin_b - alpha * cos_b)),
                number(cx + radius * cos_b),
                number(cy + radius * sin_b),
            ],
        ));
        angle = next_angle;
    }
}

fn shape_token_numbers(values: &[f64]) -> ShapeCommandToken {
    return numbers(values);
}

pub(crate) fn spread_method_string(value: SpreadMethod) -> &'static str {
    return match value {
        SpreadMethod::Pad => "pad",
        SpreadMethod::Reflect => "reflect",
        SpreadMethod::Repeat => "repeat",
    };
}

fn texture_token(texture: &Ref<Texture>) -> ShapeCommandToken {
    return ShapeCommandToken::Texture(texture.clone());
}

pub(crate) fn triangle_culling_string(value: TriangleCulling) -> &'static str {
    return match value {
        TriangleCulling::Negative => "negative",
        TriangleCulling::None => "none",
        TriangleCulling::Positive => "positive",
    };
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
    return if ux * vy - uy * vx < 0.0 {
        -angle
    } else {
        angle
    };
}
