//! Solid stroke-region resolution (TS `shapeStroke.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use flight_path::{Path, PathCommand, PathWinding, StrokeCap, StrokeJoin, StrokeStyle};

use crate::shape_command_geometry::{ShapeGeometryEnd, write_shape_geometry_command_end};
use crate::shape_fill::{append_shape_geometry_command, new_path_ref};
use crate::types::*;

fn flush_stroke(
    regions: &mut Vec<ShapeStrokeRegion>,
    style: &mut Option<StrokeStyle>,
    centerline: &mut Option<Path>,
    color: u32,
    alpha: f64,
) {
    let Some(current_style) = style.clone() else {
        return;
    };
    let Some(current) = centerline.take() else {
        return;
    };
    if current.commands.is_empty() {
        return;
    }
    let path = new_path_ref(PathWinding::NonZero);
    {
        let mut guard = path.write().unwrap();
        *guard = current;
    }
    regions.push(ShapeStrokeRegion {
        alpha: alpha as f32,
        color,
        path,
        style: current_style,
    });
}

/// Resolves each solid lineStyle span into its centerline and style, or `None` for non-solid
/// strokes (TS `getShapeStrokeRegions`).
pub fn get_shape_stroke_regions(commands: &[ShapeCommandToken]) -> Option<Vec<ShapeStrokeRegion>> {
    if has_non_solid_shape_stroke(commands) {
        return None;
    }
    let mut regions: Vec<ShapeStrokeRegion> = Vec::new();
    let mut centerline: Option<Path> = None;
    let mut style: Option<StrokeStyle> = None;
    let mut color: u32 = 0;
    let mut alpha: f64 = 1.0;
    let mut pen_x: f64 = 0.0;
    let mut pen_y: f64 = 0.0;
    let mut geometry_end = ShapeGeometryEnd::default();
    let mut index = 0;
    while index < commands.len() {
        let name = commands[index].as_str().unwrap_or("");
        let argument_count = commands[index + 1].as_number().unwrap_or(0.0) as usize;
        let argument_index = index + 2;
        index = argument_index + argument_count;
        if name == "lineStyle" {
            flush_stroke(&mut regions, &mut style, &mut centerline, color, alpha);
            let thickness = number_at(commands, argument_index);
            if thickness > 0.0 {
                color = number_at(commands, argument_index + 1) as u32;
                alpha = number_at(commands, argument_index + 2);
                let caps = commands
                    .get(argument_index + 5)
                    .and_then(|token| token.as_str())
                    .unwrap_or("none");
                let joints = commands
                    .get(argument_index + 6)
                    .and_then(|token| token.as_str())
                    .unwrap_or("round");
                style = Some(StrokeStyle {
                    cap: stroke_cap(caps),
                    dash: Vec::new(),
                    dash_offset: 0.0,
                    join: stroke_join(joints),
                    miter_limit: number_at(commands, argument_index + 7),
                    width: thickness,
                });
                let mut path =
                    flight_path::contract::create_path(flight_path::PathWinding::NonZero);
                path.winding = PathWinding::NonZero;
                centerline = Some(path);
            } else {
                style = None;
                centerline = None;
            }
        } else if is_shape_geometry_command(name) {
            if let Some(path) = centerline.as_mut() {
                if path.commands.is_empty() && name != "moveTo" {
                    path.commands.push(PathCommand::MoveTo as u8);
                    path.data.extend_from_slice(&[pen_x, pen_y]);
                }
                append_shape_geometry_command(path, name, commands, argument_index);
            }
            if write_shape_geometry_command_end(
                &mut geometry_end,
                pen_x,
                pen_y,
                name,
                commands,
                argument_index,
            ) {
                pen_x = geometry_end.x;
                pen_y = geometry_end.y;
            }
        }
    }
    flush_stroke(&mut regions, &mut style, &mut centerline, color, alpha);
    return Some(regions);
}

/// True when the stream declares a gradient or bitmap stroke (TS `hasNonSolidShapeStroke`).
pub fn has_non_solid_shape_stroke(commands: &[ShapeCommandToken]) -> bool {
    let mut index = 0;
    while index < commands.len() {
        let name = commands[index].as_str().unwrap_or("");
        if name == "lineGradientStyle" || name == "lineTextureStyle" {
            return true;
        }
        index += 2 + commands[index + 1].as_number().unwrap_or(0.0) as usize;
    }
    return false;
}

pub(crate) fn is_shape_geometry_command(name: &str) -> bool {
    return matches!(
        name,
        "moveTo"
            | "lineTo"
            | "quadraticCurveTo"
            | "cubicCurveTo"
            | "drawCircle"
            | "drawEllipse"
            | "drawRectangle"
            | "drawRoundedRectangle"
            | "drawPath"
    );
}

fn number_at(commands: &[ShapeCommandToken], index: usize) -> f64 {
    return commands
        .get(index)
        .and_then(|token| token.as_number())
        .unwrap_or(f64::NAN);
}

pub(crate) fn stroke_cap(caps: &str) -> StrokeCap {
    return match caps {
        "round" => StrokeCap::Round,
        "square" => StrokeCap::Square,
        _ => StrokeCap::Butt,
    };
}

pub(crate) fn stroke_join(joints: &str) -> StrokeJoin {
    return match joints {
        "bevel" => StrokeJoin::Bevel,
        "miter" => StrokeJoin::Miter,
        _ => StrokeJoin::Round,
    };
}
