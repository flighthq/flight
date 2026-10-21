//! Plain-data diagnosis of the camera view matrix orthonormality precondition (TS
//! `explainCamera3DView.ts`).

use crate::types::*;

/// Loose enough to pass a matrix through a decompose/recompose float32 round trip, tight enough to
/// report a deliberate 1% scale.
const ORTHONORMAL_TOLERANCE: f32 = 1e-3;

/// Reports whether a camera's view matrix satisfies the orthonormality precondition its consumers
/// rely on, as plain data (TS `explainCamera3DView`). Reflections pass: the determinant is reported
/// so a caller can distinguish a mirror from a rigid basis.
pub fn explain_camera_3d_view(camera: &Camera3D) -> Camera3DViewExplanation {
    let m = camera.view.read().unwrap().m;
    let x = (m[0], m[1], m[2]);
    let y = (m[4], m[5], m[6]);
    let z = (m[8], m[9], m[10]);
    let length_x = (x.0 * x.0 + x.1 * x.1 + x.2 * x.2).sqrt();
    let length_y = (y.0 * y.0 + y.1 * y.1 + y.2 * y.2).sqrt();
    let length_z = (z.0 * z.0 + z.1 * z.1 + z.2 * z.2).sqrt();
    let determinant = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9])
        + m[8] * (m[1] * m[6] - m[2] * m[5]);
    let scale_deviation = max3(
        (length_x - 1.0).abs(),
        (length_y - 1.0).abs(),
        (length_z - 1.0).abs(),
    );
    let shear_deviation = max3(
        (x.0 * y.0 + x.1 * y.1 + x.2 * y.2).abs(),
        (x.0 * z.0 + x.1 * z.1 + x.2 * z.2).abs(),
        (y.0 * z.0 + y.1 * z.1 + y.2 * z.2).abs(),
    );
    return Camera3DViewExplanation {
        determinant,
        is_orthonormal: scale_deviation <= ORTHONORMAL_TOLERANCE
            && shear_deviation <= ORTHONORMAL_TOLERANCE,
        is_reflection: determinant < 0.0,
        scale_deviation,
        shear_deviation,
    };
}

fn max3(a: f32, b: f32, c: f32) -> f32 {
    let mut out = a;
    if b > out {
        out = b;
    }
    if c > out {
        out = c;
    }
    return out;
}
