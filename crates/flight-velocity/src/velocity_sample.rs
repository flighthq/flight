use crate::Velocity2D;
use crate::VelocitySample;
use flight_geometry::Matrix;

/// Returns the per-pixel screen-space velocity at local-space point
/// (`point_x`, `point_y`) by computing `current * p - previous * p` using
/// the sample's stored previous_world_transform and the node's current world
/// transform. Writes the result into `out`. Returns zero when the sample has
/// no previous transform.
///
/// Use when the full affine delta (rotation + scale) at a specific point is
/// needed, such as when writing a per-pixel velocity buffer from a
/// screen-space fragment shader.
pub fn get_velocity_sample_at(
    sample: &VelocitySample,
    current_world_transform: &Matrix,
    point_x: f32,
    point_y: f32,
    out: &mut Velocity2D,
) {
    match sample.previous_world_transform {
        None => {
            out.x = 0.0;
            out.y = 0.0;
        }
        Some(prev) => {
            let cx = current_world_transform.a * point_x
                + current_world_transform.c * point_y
                + current_world_transform.tx;
            let cy = current_world_transform.b * point_x
                + current_world_transform.d * point_y
                + current_world_transform.ty;
            let px = prev.a * point_x + prev.c * point_y + prev.tx;
            let py = prev.b * point_x + prev.d * point_y + prev.ty;
            out.x = cx - px;
            out.y = cy - py;
        }
    }
}
