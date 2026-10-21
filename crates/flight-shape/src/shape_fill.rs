//! Solid fill-region resolution and shared geometry expansion (TS `shapeFill.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_math::CIRCLE_KAPPA;
use flight_path::{Path, PathCommand, PathWinding, create_path};

use crate::types::*;

fn append_ellipse_to_path(path: &mut Path, cx: f64, cy: f64, rx: f64, ry: f64) {
    let kappa = CIRCLE_KAPPA as f64;
    let kx = rx * kappa;
    let ky = ry * kappa;
    push_verb(path, PathCommand::MoveTo, cx + rx, cy);
    push_cubic(path, cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry);
    push_cubic(path, cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy);
    push_cubic(path, cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry);
    push_cubic(path, cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy);
}

fn append_raw_path(path: &mut Path, verbs: &[f64], data: &[f64]) {
    let mut data_index = 0;
    for verb in verbs {
        let operand_count = get_path_command_operand_count(*verb as u8);
        path.commands.push(*verb as u8);
        let mut offset = 0;
        while offset < operand_count {
            path.data.push(data[data_index + offset]);
            offset += 1;
        }
        data_index += operand_count;
    }
}

fn append_rectangle_to_path(path: &mut Path, x: f64, y: f64, width: f64, height: f64) {
    push_verb(path, PathCommand::MoveTo, x, y);
    push_verb(path, PathCommand::LineTo, x + width, y);
    push_verb(path, PathCommand::LineTo, x + width, y + height);
    push_verb(path, PathCommand::LineTo, x, y + height);
    push_verb(path, PathCommand::LineTo, x, y);
}

fn append_round_rectangle_to_path(
    path: &mut Path,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    authored_radius: f64,
) {
    let radius = authored_radius
        .max(0.0)
        .min(width.abs() / 2.0)
        .min(height.abs() / 2.0);
    let right = x + width;
    let bottom = y + height;
    let kappa_radius = radius * CIRCLE_KAPPA as f64;
    push_verb(path, PathCommand::MoveTo, x + radius, y);
    push_verb(path, PathCommand::LineTo, right - radius, y);
    push_cubic(
        path,
        right - radius + kappa_radius,
        y,
        right,
        y + radius - kappa_radius,
        right,
        y + radius,
    );
    push_verb(path, PathCommand::LineTo, right, bottom - radius);
    push_cubic(
        path,
        right,
        bottom - radius + kappa_radius,
        right - radius + kappa_radius,
        bottom,
        right - radius,
        bottom,
    );
    push_verb(path, PathCommand::LineTo, x + radius, bottom);
    push_cubic(
        path,
        x + radius - kappa_radius,
        bottom,
        x,
        bottom - radius + kappa_radius,
        x,
        bottom - radius,
    );
    push_verb(path, PathCommand::LineTo, x, y + radius);
    push_cubic(
        path,
        x,
        y + radius - kappa_radius,
        x + radius - kappa_radius,
        y,
        x + radius,
        y,
    );
}

/// Appends one geometry command onto `path`, expanding primitives into MOVE/LINE/CURVE verbs (TS
/// `appendShapeGeometryCommand`); non-geometry names are a no-op.
pub fn append_shape_geometry_command(
    path: &mut Path,
    name: &str,
    commands: &[ShapeCommandToken],
    a: usize,
) {
    match name {
        "moveTo" => push_verb(
            path,
            PathCommand::MoveTo,
            arg(commands, a),
            arg(commands, a + 1),
        ),
        "lineTo" => push_verb(
            path,
            PathCommand::LineTo,
            arg(commands, a),
            arg(commands, a + 1),
        ),
        "quadraticCurveTo" => push_quadratic(
            path,
            arg(commands, a),
            arg(commands, a + 1),
            arg(commands, a + 2),
            arg(commands, a + 3),
        ),
        "cubicCurveTo" => push_cubic(
            path,
            arg(commands, a),
            arg(commands, a + 1),
            arg(commands, a + 2),
            arg(commands, a + 3),
            arg(commands, a + 4),
            arg(commands, a + 5),
        ),
        "drawCircle" => append_ellipse_to_path(
            path,
            arg(commands, a),
            arg(commands, a + 1),
            arg(commands, a + 2),
            arg(commands, a + 2),
        ),
        "drawEllipse" => append_ellipse_to_path(
            path,
            arg(commands, a),
            arg(commands, a + 1),
            arg(commands, a + 2),
            arg(commands, a + 3),
        ),
        "drawRectangle" => append_rectangle_to_path(
            path,
            arg(commands, a),
            arg(commands, a + 1),
            arg(commands, a + 2),
            arg(commands, a + 3),
        ),
        "drawRoundedRectangle" => append_round_rectangle_to_path(
            path,
            arg(commands, a),
            arg(commands, a + 1),
            arg(commands, a + 2),
            arg(commands, a + 3),
            arg(commands, a + 4),
        ),
        "drawPath" => {
            let winding = commands
                .get(a + 2)
                .and_then(|token| token.as_str())
                .map(crate::types::parse_winding)
                .unwrap_or(PathWinding::NonZero);
            path.winding = winding;
            let verbs = numbers(commands, a);
            let data = numbers(commands, a + 1);
            append_raw_path(path, verbs, data);
        }
        _ => {}
    }
}

fn arg(commands: &[ShapeCommandToken], index: usize) -> f64 {
    return number(commands, index);
}

fn fill_region(path: Path, color: u32, alpha: f64) -> ShapeFillRegion {
    return ShapeFillRegion {
        alpha: alpha as f32,
        color,
        path: Arc::new(RwLock::new(path)),
    };
}

/// The number of `data` numbers a Path verb consumes (TS `getPathCommandOperandCount`).
pub fn get_path_command_operand_count(verb: u8) -> usize {
    return match verb {
        1 | 2 => 2,
        3 | 4 | 5 => 4,
        6 => 6,
        _ => 0,
    };
}

/// Resolves solid fill spans into fill regions, or `None` for non-solid fills (TS
/// `getShapeFillRegions`).
pub fn get_shape_fill_regions(commands: &[ShapeCommandToken]) -> Option<Vec<ShapeFillRegion>> {
    if has_non_solid_shape_fill(commands) {
        return None;
    }
    let mut regions: Vec<ShapeFillRegion> = Vec::new();
    let mut path: Option<Path> = None;
    let mut color: u32 = 0;
    let mut alpha: f64 = 1.0;
    let winding = PathWinding::NonZero;
    let mut index = 0;
    while index < commands.len() {
        let name = commands[index].as_str().unwrap_or("");
        let argument_count = commands[index + 1].as_number().unwrap_or(0.0) as usize;
        let a = index + 2;
        index = a + argument_count;
        match name {
            "beginFill" => {
                if let Some(current) = path.take() {
                    if !current.commands.is_empty() {
                        regions.push(fill_region(current, color, alpha));
                    }
                }
                color = number(commands, a) as u32;
                alpha = number(commands, a + 1);
                let mut next = create_path();
                next.winding = winding;
                path = Some(next);
            }
            "endFill" => {
                if let Some(current) = path.take() {
                    if !current.commands.is_empty() {
                        regions.push(fill_region(current, color, alpha));
                    }
                }
            }
            _ => {
                if let Some(current) = path.as_mut() {
                    append_shape_geometry_command(current, name, commands, a);
                }
            }
        }
    }
    if let Some(current) = path.take() {
        if !current.commands.is_empty() {
            regions.push(fill_region(current, color, alpha));
        }
    }
    return Some(regions);
}

/// True when the stream uses a fill the solid path cannot express (TS `hasNonSolidShapeFill`).
pub fn has_non_solid_shape_fill(commands: &[ShapeCommandToken]) -> bool {
    let mut index = 0;
    while index < commands.len() {
        let name = commands[index].as_str().unwrap_or("");
        let argument_count = commands[index + 1].as_number().unwrap_or(0.0) as usize;
        if name == "beginGradientFill" || name == "beginTextureFill" {
            return true;
        }
        if name == "drawTriangles" && !commands[index + 4].is_null() {
            return true;
        }
        index += 2 + argument_count;
    }
    return false;
}

/// True when the stream declares any fill (TS `hasShapeFill`).
pub fn has_shape_fill(commands: &[ShapeCommandToken]) -> bool {
    let mut index = 0;
    while index < commands.len() {
        let name = commands[index].as_str().unwrap_or("");
        if name == "beginFill" || name == "beginGradientFill" || name == "beginTextureFill" {
            return true;
        }
        index += 2 + commands[index + 1].as_number().unwrap_or(0.0) as usize;
    }
    return false;
}

pub(crate) fn new_path_ref(winding: PathWinding) -> Ref<Path> {
    let mut path = create_path();
    path.winding = winding;
    return Arc::new(RwLock::new(path));
}

fn number(commands: &[ShapeCommandToken], index: usize) -> f64 {
    return commands
        .get(index)
        .and_then(|token| token.as_number())
        .unwrap_or(f64::NAN);
}

fn numbers<'a>(commands: &'a [ShapeCommandToken], index: usize) -> &'a [f64] {
    return commands
        .get(index)
        .and_then(|token| token.as_numbers())
        .map(|values| values.as_slice())
        .unwrap_or(&[]);
}

fn push_cubic(path: &mut Path, c1x: f64, c1y: f64, c2x: f64, c2y: f64, x: f64, y: f64) {
    path.commands.push(PathCommand::CubicCurveTo as u8);
    path.data.extend_from_slice(&[c1x, c1y, c2x, c2y, x, y]);
}

fn push_quadratic(path: &mut Path, cx: f64, cy: f64, x: f64, y: f64) {
    path.commands.push(PathCommand::QuadraticCurveTo as u8);
    path.data.extend_from_slice(&[cx, cy, x, y]);
}

fn push_verb(path: &mut Path, verb: PathCommand, x: f64, y: f64) {
    path.commands.push(verb as u8);
    path.data.extend_from_slice(&[x, y]);
}
