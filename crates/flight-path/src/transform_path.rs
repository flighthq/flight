use flight_geometry::MatrixLike;

use crate::copy_path::copy_path;
use crate::path::{Path, PathCommand};

#[cfg(test)]
mod sugar_tests {
    use flight_geometry::create_matrix;

    use crate::contract::*;

    fn test_path() -> Path {
        let mut out = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut out, 0.0, 0.0);
        append_path_line_to(&mut out, 10.0, 0.0);
        append_path_quadratic_curve_to(&mut out, 14.0, 4.0, 10.0, 10.0);
        append_path_line_to(&mut out, 0.0, 10.0);
        append_path_close(&mut out);
        return out;
    }

    #[test]
    fn path_transform_matches_transform_path() {
        let mut oa1 = create_path(Some(PathWinding::NonZero));
        let mut ob1 = create_path(Some(PathWinding::NonZero));
        let s = test_path();
        s.transform(&create_matrix(2.0, 0.0, 0.0, 2.0, 1.0, 1.0), &mut oa1);
        transform_path(&s, &create_matrix(2.0, 0.0, 0.0, 2.0, 1.0, 1.0), &mut ob1);
        assert_eq!(format!("{:?}", oa1), format!("{:?}", ob1));
    }

    #[test]
    fn path_translate_matches_translate_path() {
        let mut oa2 = create_path(Some(PathWinding::NonZero));
        let mut ob2 = create_path(Some(PathWinding::NonZero));
        let s = test_path();
        s.translate(2.0, -1.0, &mut oa2);
        translate_path(&s, 2.0, -1.0, &mut ob2);
        assert_eq!(format!("{:?}", oa2), format!("{:?}", ob2));
    }
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
/// Applies a 2D affine matrix to all anchor and control-point coordinate pairs in `source`,
/// writing the result into `out`. Alias-safe. Commands and winding are copied unchanged.
pub fn transform_path(source: &Path, matrix: &MatrixLike, out: &mut Path) {
    transform_path_coordinates(
        source,
        matrix.a as f64,
        matrix.b as f64,
        matrix.c as f64,
        matrix.d as f64,
        matrix.tx as f64,
        matrix.ty as f64,
        out,
    );
}

// flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
// The affine map as plain coefficients, so translation needs no `Matrix` entity and the path runtime
// keeps no value dependency on geometry.
#[allow(clippy::needless_range_loop)] // indexed loop remains portable to generated TypeScript
fn transform_path_coordinates(
    source: &Path,
    a: f64,
    b: f64,
    c: f64,
    d: f64,
    tx: f64,
    ty: f64,
    out: &mut Path,
) {
    copy_path(out, source);
    let commands = out.commands.clone();
    let data = &mut out.data;
    let mut di: usize = 0;
    for ci in 0..commands.len() {
        let command = commands[ci];
        if command == PathCommand::MOVE_TO as u8 || command == PathCommand::LINE_TO as u8 {
            let x = data[di];
            let y = data[di + 1];
            data[di] = a * x + c * y + tx;
            data[di + 1] = b * x + d * y + ty;
            di += 2;
        } else if command == PathCommand::QUADRATIC_CURVE_TO as u8 {
            for pair in 0..2 {
                let k = pair * 2;
                let x = data[di + k];
                let y = data[di + k + 1];
                data[di + k] = a * x + c * y + tx;
                data[di + k + 1] = b * x + d * y + ty;
            }
            di += 4;
        } else if command == PathCommand::CUBIC_CURVE_TO as u8 {
            for pair in 0..3 {
                let k = pair * 2;
                let x = data[di + k];
                let y = data[di + k + 1];
                data[di + k] = a * x + c * y + tx;
                data[di + k + 1] = b * x + d * y + ty;
            }
            di += 6;
        } else if command == PathCommand::WIDE_MOVE_TO as u8
            || command == PathCommand::WIDE_LINE_TO as u8
        {
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
    transform_path_coordinates(source, 1.0, 0.0, 0.0, 1.0, dx, dy, out);
}

impl Path {
    pub fn transform(&self, matrix: &MatrixLike, out: &mut Path) {
        return transform_path(self, matrix, out);
    }

    // flight-lint: allow(f64) operates on f64 Path.data coordinates (TS number); f32 sufficiency not measured
    pub fn translate(&self, dx: f64, dy: f64, out: &mut Path) {
        return translate_path(self, dx, dy, out);
    }
}
