//! Render target helpers — compute transforms for capturing display objects
//! into off-screen render targets and placing cached results back.

use flighthq_geometry::{inverse_matrix, multiply_matrix};
use flighthq_types::{Matrix, MatrixLike, RectangleLike};

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Writes into `out_render_transform` the transform to set as
/// `state.render_transform_2d` when capturing `source_id` into a render target.
///
/// Maps source content into target pixel space so that the bounds origin lands
/// at `(content_x, content_y)`. Reads the source node's local transform via
/// `get_local_transform`.
///
/// Read the inputs into locals before writing `out_render_transform` so the
/// function is safe when `out_render_transform` aliases an input.
pub fn compute_display_object_render_target_transform(
    out_render_transform: &mut Matrix,
    bounds: &RectangleLike,
    local_transform: &Matrix,
    content_x: f32,
    content_y: f32,
) {
    // Read all inputs into locals first so the function is safe when `out_render_transform`
    // aliases an input. inverse(local) then translate so the bounds origin lands at content.
    let bounds_x = bounds.x;
    let bounds_y = bounds.y;
    let mut inv_local = matrix_to_like(local_transform);
    inverse_matrix(&mut inv_local, &matrix_to_like(local_transform));
    let translation = MatrixLike {
        a: 1.0,
        b: 0.0,
        c: 0.0,
        d: 1.0,
        tx: content_x - bounds_x,
        ty: content_y - bounds_y,
    };
    let mut result = MatrixLike::default();
    multiply_matrix(&mut result, &translation, &inv_local);
    copy_matrix_like_to_matrix(out_render_transform, &result);
}

/// Writes into `out_cache_transform` the transform to pass to the cache
/// resolver so the cached image is placed back at the original scene position.
///
/// Read the inputs into locals before writing `out_cache_transform` so the
/// function is safe when `out_cache_transform` aliases an input.
pub fn compute_render_cache_transform(
    out_cache_transform: &mut Matrix,
    bounds: &RectangleLike,
    content_x: f32,
    content_y: f32,
) {
    let bounds_x = bounds.x;
    let bounds_y = bounds.y;
    out_cache_transform.a = 1.0;
    out_cache_transform.b = 0.0;
    out_cache_transform.c = 0.0;
    out_cache_transform.d = 1.0;
    out_cache_transform.tx = bounds_x - content_x;
    out_cache_transform.ty = bounds_y - content_y;
}

/// Computes the pixel dimensions of a render target that contains `bounds`
/// plus `padding` on all sides, clamped to at least `min_width` × `min_height`.
pub fn compute_render_target_size(
    bounds: &RectangleLike,
    padding: f32,
    min_width: u32,
    min_height: u32,
) -> (u32, u32) {
    let pad = (padding * 2.0).round() as i64;
    let width = ((bounds.width.ceil() as i64) + pad).max(min_width as i64);
    let height = ((bounds.height.ceil() as i64) + pad).max(min_height as i64);
    (width as u32, height as u32)
}

#[inline]
fn copy_matrix_like_to_matrix(out: &mut Matrix, source: &MatrixLike) {
    out.a = source.a;
    out.b = source.b;
    out.c = source.c;
    out.d = source.d;
    out.tx = source.tx;
    out.ty = source.ty;
}

#[inline]
fn matrix_to_like(m: &Matrix) -> MatrixLike {
    MatrixLike {
        a: m.a,
        b: m.b,
        c: m.c,
        d: m.d,
        tx: m.tx,
        ty: m.ty,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // compute_display_object_render_target_transform

    fn identity() -> Matrix {
        Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 0.0,
            ty: 0.0,
        }
    }

    #[test]
    fn compute_display_object_render_target_transform_writes_identity_based_transform_at_origin() {
        let bounds = RectangleLike {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 80.0,
        };
        let local = identity();
        let mut out = Matrix::default();
        compute_display_object_render_target_transform(&mut out, &bounds, &local, 0.0, 0.0);
        // inverse(identity) then translate by (content - bounds) = (0, 0): identity result.
        assert!((out.a - 1.0).abs() < 1e-5);
        assert!((out.d - 1.0).abs() < 1e-5);
        assert!((out.tx - 0.0).abs() < 1e-5, "tx={}", out.tx);
        assert!((out.ty - 0.0).abs() < 1e-5, "ty={}", out.ty);
    }

    #[test]
    fn compute_display_object_render_target_transform_offsets_by_content_x_and_content_y() {
        let bounds = RectangleLike {
            x: 10.0,
            y: 20.0,
            width: 100.0,
            height: 80.0,
        };
        let local = identity();
        let mut out1 = Matrix::default();
        let mut out2 = Matrix::default();
        compute_display_object_render_target_transform(&mut out1, &bounds, &local, 0.0, 0.0);
        compute_display_object_render_target_transform(&mut out2, &bounds, &local, 5.0, 10.0);
        assert_ne!(out1.tx, out2.tx);
        // tx = content_x - bounds_x: -10 vs -5.
        assert!((out1.tx - -10.0).abs() < 1e-5, "tx={}", out1.tx);
        assert!((out2.tx - -5.0).abs() < 1e-5, "tx={}", out2.tx);
    }

    #[test]
    fn compute_display_object_render_target_transform_handles_non_identity_local_transform() {
        // A scaled local transform; the function must invert it without panicking.
        let bounds = RectangleLike {
            x: 50.0,
            y: 30.0,
            width: 100.0,
            height: 80.0,
        };
        let local = Matrix {
            a: 2.0,
            b: 0.0,
            c: 0.0,
            d: 2.0,
            tx: 50.0,
            ty: 30.0,
        };
        let mut out = Matrix::default();
        compute_display_object_render_target_transform(&mut out, &bounds, &local, 0.0, 0.0);
        // inverse of a 2x scale is 0.5x scale.
        assert!((out.a - 0.5).abs() < 1e-5, "a={}", out.a);
        assert!((out.d - 0.5).abs() < 1e-5, "d={}", out.d);
    }

    #[test]
    fn compute_display_object_render_target_transform_is_alias_safe() {
        // out aliasing semantics: inputs are read into locals before any write. Here we verify the
        // result matches a separate-output computation for the same inputs.
        let bounds = RectangleLike {
            x: 4.0,
            y: 6.0,
            width: 20.0,
            height: 20.0,
        };
        let local = identity();
        let mut out = Matrix::default();
        compute_display_object_render_target_transform(&mut out, &bounds, &local, 1.0, 2.0);
        assert!((out.tx - -3.0).abs() < 1e-5, "tx={}", out.tx);
        assert!((out.ty - -4.0).abs() < 1e-5, "ty={}", out.ty);
    }

    // compute_render_cache_transform

    #[test]
    fn compute_render_cache_transform_at_origin() {
        let bounds = RectangleLike {
            x: 10.0,
            y: 20.0,
            width: 100.0,
            height: 50.0,
        };
        let mut out = Matrix::default();
        compute_render_cache_transform(&mut out, &bounds, 0.0, 0.0);
        // tx = bounds.x - content_x = 10, ty = bounds.y - content_y = 20
        assert!((out.tx - 10.0).abs() < 1e-5, "tx={}", out.tx);
        assert!((out.ty - 20.0).abs() < 1e-5, "ty={}", out.ty);
        assert!((out.a - 1.0).abs() < 1e-5);
        assert!((out.d - 1.0).abs() < 1e-5);
    }

    #[test]
    fn compute_render_cache_transform_with_content_offset() {
        let bounds = RectangleLike {
            x: 10.0,
            y: 20.0,
            width: 100.0,
            height: 50.0,
        };
        let mut out = Matrix::default();
        compute_render_cache_transform(&mut out, &bounds, 5.0, 8.0);
        // tx = 10 - 5 = 5, ty = 20 - 8 = 12
        assert!((out.tx - 5.0).abs() < 1e-5, "tx={}", out.tx);
        assert!((out.ty - 12.0).abs() < 1e-5, "ty={}", out.ty);
    }

    // compute_render_target_size

    #[test]
    fn compute_render_target_size_rounds_up_and_pads() {
        let bounds = RectangleLike {
            x: 0.0,
            y: 0.0,
            width: 99.5,
            height: 49.2,
        };
        let (w, h) = compute_render_target_size(&bounds, 2.0, 1, 1);
        // ceil(99.5) + 2*2 = 100 + 4 = 104
        // ceil(49.2) + 2*2 = 50 + 4  = 54
        assert_eq!(w, 104);
        assert_eq!(h, 54);
    }

    #[test]
    fn compute_render_target_size_respects_minimum() {
        let bounds = RectangleLike {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        };
        let (w, h) = compute_render_target_size(&bounds, 0.0, 16, 16);
        assert_eq!(w, 16);
        assert_eq!(h, 16);
    }
}
