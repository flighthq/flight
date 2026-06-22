//! Converts a Flight 2D `Matrix` into a tiny-skia `Transform`. Both are
//! row-major 2x3 affine transforms with the same field order, so this is a
//! straight field map (`a,b,c,d,tx,ty` -> `sx,ky,kx,sy,tx,ty`).

use flighthq_types::geometry::Matrix;
use tiny_skia::Transform;

/// Builds a tiny-skia `Transform` from a Flight `Matrix`. The Flight convention
/// `(a, b, c, d, tx, ty)` matches tiny-skia's `from_row(sx, ky, kx, sy, tx, ty)`
/// 1:1, so no transposition is needed.
pub fn create_skia_transform(matrix: &Matrix) -> Transform {
    Transform::from_row(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_skia_transform_identity() {
        let t = create_skia_transform(&Matrix::default());
        assert!(t.is_identity());
    }

    #[test]
    fn create_skia_transform_maps_translation() {
        let m = Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 5.0,
            ty: 7.0,
        };
        let t = create_skia_transform(&m);
        assert_eq!(t.tx, 5.0);
        assert_eq!(t.ty, 7.0);
    }

    #[test]
    fn create_skia_transform_maps_scale() {
        let m = Matrix {
            a: 2.0,
            b: 0.0,
            c: 0.0,
            d: 3.0,
            tx: 0.0,
            ty: 0.0,
        };
        let t = create_skia_transform(&m);
        assert_eq!(t.sx, 2.0);
        assert_eq!(t.sy, 3.0);
    }
}
