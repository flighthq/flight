use flight_geometry::{Matrix, create_matrix};

use crate::path::{Path, PathCommand};
use crate::copy_path::copy_path_into;

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Applies a 2D affine matrix to all anchor and control-point coordinate pairs in `source`,
/// writing the result into `out`. Alias-safe. Commands and winding are copied unchanged.
pub fn transform_path(source: &Path, matrix: &Matrix, out: &mut Path) {
    let a = matrix.a as f64;
    let b = matrix.b as f64;
    let c = matrix.c as f64;
    let d = matrix.d as f64;
    let tx = matrix.tx as f64;
    let ty = matrix.ty as f64;
    copy_path_into(source, out);
    let commands = out.commands.clone();
    let data = &mut out.data;
    let mut di: usize = 0;
    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == PathCommand::MoveTo as u8 || command == PathCommand::LineTo as u8 {
            let x = data[di];
            let y = data[di + 1];
            data[di] = a * x + c * y + tx;
            data[di + 1] = b * x + d * y + ty;
            di += 2;
        } else if command == PathCommand::QuadraticCurveTo as u8 {
            for k in (0..4).step_by(2) {
                let x = data[di + k];
                let y = data[di + k + 1];
                data[di + k] = a * x + c * y + tx;
                data[di + k + 1] = b * x + d * y + ty;
            }
            di += 4;
        } else if command == PathCommand::CubicCurveTo as u8 {
            for k in (0..6).step_by(2) {
                let x = data[di + k];
                let y = data[di + k + 1];
                data[di + k] = a * x + c * y + tx;
                data[di + k + 1] = b * x + d * y + ty;
            }
            di += 6;
        } else if command == PathCommand::WideMoveTo as u8 || command == PathCommand::WideLineTo as u8 {
            let x = data[di + 2];
            let y = data[di + 3];
            data[di + 2] = a * x + c * y + tx;
            data[di + 3] = b * x + d * y + ty;
            di += 4;
        }
    }
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Translates all points in `source` by (dx, dy). Alias-safe.
pub fn translate_path(source: &Path, dx: f64, dy: f64, out: &mut Path) {
    let matrix = create_matrix(1.0, 0.0, 0.0, 1.0, dx as f32, dy as f32);
    transform_path(source, &matrix, out);
}
