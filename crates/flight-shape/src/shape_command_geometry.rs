//! The end position of one shape geometry command (TS `shapeCommandGeometry.ts`).
// flight-lint: allow-file(f64) D1: shape command tokens and path geometry use the canonical f64 Path lane

use crate::types::*;

/// The mutable pen position the traversal tracks (TS inline `{x, y}`).
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ShapeGeometryEnd {
    pub x: f64,
    pub y: f64,
}

fn number_at(commands: &[ShapeCommandToken], index: usize) -> f64 {
    return commands
        .get(index)
        .and_then(|token| token.as_number())
        .unwrap_or(f64::NAN);
}

fn write_raw_path_end(
    out: &mut ShapeGeometryEnd,
    current_x: f64,
    current_y: f64,
    path_commands: &[f64],
    data: &[f64],
) {
    let mut data_index = 0;
    let mut subpath_start_x = current_x;
    let mut subpath_start_y = current_y;
    out.x = current_x;
    out.y = current_y;
    for command in path_commands {
        match *command as u8 {
            1 => {
                out.x = data[data_index];
                out.y = data[data_index + 1];
                subpath_start_x = out.x;
                subpath_start_y = out.y;
                data_index += 2;
            }
            2 => {
                out.x = data[data_index];
                out.y = data[data_index + 1];
                data_index += 2;
            }
            3 => {
                out.x = data[data_index + 2];
                out.y = data[data_index + 3];
                data_index += 4;
            }
            4 => {
                out.x = data[data_index + 2];
                out.y = data[data_index + 3];
                subpath_start_x = out.x;
                subpath_start_y = out.y;
                data_index += 4;
            }
            5 => {
                out.x = data[data_index + 2];
                out.y = data[data_index + 3];
                data_index += 4;
            }
            6 => {
                out.x = data[data_index + 4];
                out.y = data[data_index + 5];
                data_index += 6;
            }
            7 => {
                out.x = subpath_start_x;
                out.y = subpath_start_y;
            }
            _ => {}
        }
    }
}

/// Writes the command's end position into `out`, returning whether the command is geometry (TS
/// `writeShapeGeometryCommandEnd`).
pub fn write_shape_geometry_command_end(
    out: &mut ShapeGeometryEnd,
    current_x: f64,
    current_y: f64,
    name: &str,
    commands: &[ShapeCommandToken],
    argument_index: usize,
) -> bool {
    match name {
        "moveTo" | "lineTo" => {
            out.x = number_at(commands, argument_index);
            out.y = number_at(commands, argument_index + 1);
            true
        }
        "quadraticCurveTo" => {
            out.x = number_at(commands, argument_index + 2);
            out.y = number_at(commands, argument_index + 3);
            true
        }
        "cubicCurveTo" => {
            out.x = number_at(commands, argument_index + 4);
            out.y = number_at(commands, argument_index + 5);
            true
        }
        "drawCircle" | "drawEllipse" => {
            out.x = number_at(commands, argument_index) + number_at(commands, argument_index + 2);
            out.y = number_at(commands, argument_index + 1);
            true
        }
        "drawRectangle" => {
            out.x = number_at(commands, argument_index);
            out.y = number_at(commands, argument_index + 1);
            true
        }
        "drawRoundedRectangle" => {
            let radius = number_at(commands, argument_index + 4)
                .max(0.0)
                .min(number_at(commands, argument_index + 2).abs() / 2.0)
                .min(number_at(commands, argument_index + 3).abs() / 2.0);
            out.x = number_at(commands, argument_index) + radius;
            out.y = number_at(commands, argument_index + 1);
            true
        }
        "drawPath" => {
            write_raw_path_end(
                out,
                current_x,
                current_y,
                commands[argument_index]
                    .as_numbers()
                    .map(|values| values.as_slice())
                    .unwrap_or(&[]),
                commands[argument_index + 1]
                    .as_numbers()
                    .map(|values| values.as_slice())
                    .unwrap_or(&[]),
            );
            true
        }
        _ => false,
    }
}
