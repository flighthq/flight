//! Stroke OUTLINE regions for the direct-fill path (TS `shapeStrokeOutline.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens, path geometry and morph progress use the canonical f64 Path lane; matrices stay f32

use std::sync::{Arc, RwLock};

use flight_path::{Path, PathCommand, StrokeStyle};

use crate::compact_stroke_path::compact_stroke_path;
use crate::shape_command_geometry::{ShapeGeometryEnd, write_shape_geometry_command_end};
use crate::shape_fill::{append_shape_geometry_command, get_path_command_operand_count};
use crate::shape_stroke::{
    has_non_solid_shape_stroke, is_shape_geometry_command, stroke_cap, stroke_join,
};
use crate::types::*;

const CLOSE_EPSILON: f64 = 1e-6;

fn flush_outline(
    regions: &mut Vec<ShapeFillRegion>,
    deferred: &mut bool,
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
    if is_centerline_closed(&current) {
        *deferred = true;
        return;
    }
    let mut outline = flight_path::contract::create_path();
    compact_stroke_path(&mut outline, &current, &current_style, None);
    if !outline.commands.is_empty() {
        regions.push(ShapeFillRegion {
            alpha: alpha as f32,
            color,
            path: Arc::new(RwLock::new(outline)),
        });
    }
}

/// Resolves solid open strokes into fillable outline regions; `None` when the stream uses a
/// gradient/bitmap stroke or a closed stroke (TS `getShapeStrokeOutlineRegions`).
pub fn get_shape_stroke_outline_regions(
    commands: &[ShapeCommandToken],
) -> Option<Vec<ShapeFillRegion>> {
    if has_non_solid_shape_stroke(commands) {
        return None;
    }
    let mut regions: Vec<ShapeFillRegion> = Vec::new();
    let mut centerline: Option<Path> = None;
    let mut style: Option<StrokeStyle> = None;
    let mut color: u32 = 0;
    let mut alpha: f64 = 1.0;
    let mut pen_x: f64 = 0.0;
    let mut pen_y: f64 = 0.0;
    let mut deferred = false;
    let mut geometry_end = ShapeGeometryEnd::default();
    let mut index = 0;
    while index < commands.len() {
        let name = commands[index].as_str().unwrap_or("");
        let argument_count = commands[index + 1].as_number().unwrap_or(0.0) as usize;
        let argument_index = index + 2;
        index = argument_index + argument_count;
        if name == "lineStyle" {
            flush_outline(
                &mut regions,
                &mut deferred,
                &mut style,
                &mut centerline,
                color,
                alpha,
            );
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
                centerline = Some(flight_path::contract::create_path());
            } else {
                style = None;
                centerline = None;
            }
        } else if is_shape_geometry_command(name) {
            if let Some(path) = centerline.as_mut() {
                if path.commands.is_empty() && name != "moveTo" {
                    path.commands.push(PathCommand::MoveTo as u8);
                    path.data.push(pen_x);
                    path.data.push(pen_y);
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
    flush_outline(
        &mut regions,
        &mut deferred,
        &mut style,
        &mut centerline,
        color,
        alpha,
    );
    return if deferred { None } else { Some(regions) };
}

fn is_centerline_closed(path: &Path) -> bool {
    let mut data_index = 0;
    let mut subpath_start_x: f64 = 0.0;
    let mut subpath_start_y: f64 = 0.0;
    let mut last_x: f64 = 0.0;
    let mut last_y: f64 = 0.0;
    let mut segments = 0;
    for command in &path.commands {
        let verb = *command;
        if verb == PathCommand::Close as u8 {
            return true;
        }
        let operand_count = get_path_command_operand_count(verb);
        if verb == PathCommand::MoveTo as u8 || verb == PathCommand::WideMoveTo as u8 {
            if segments >= 2
                && (last_x - subpath_start_x).abs() < CLOSE_EPSILON
                && (last_y - subpath_start_y).abs() < CLOSE_EPSILON
            {
                return true;
            }
            last_x = path.data[data_index + operand_count - 2];
            last_y = path.data[data_index + operand_count - 1];
            subpath_start_x = last_x;
            subpath_start_y = last_y;
            segments = 0;
        } else if operand_count >= 2 {
            last_x = path.data[data_index + operand_count - 2];
            last_y = path.data[data_index + operand_count - 1];
            segments += 1;
        }
        data_index += operand_count;
    }
    return segments >= 2
        && (last_x - subpath_start_x).abs() < CLOSE_EPSILON
        && (last_y - subpath_start_y).abs() < CLOSE_EPSILON;
}

fn number_at(commands: &[ShapeCommandToken], index: usize) -> f64 {
    return commands
        .get(index)
        .and_then(|token| token.as_number())
        .unwrap_or(f64::NAN);
}
