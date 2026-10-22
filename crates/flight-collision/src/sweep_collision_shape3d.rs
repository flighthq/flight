use crate::gjk_distance3d::*;
use crate::types::*;

const SWEEP_TOUCH_TOLERANCE: f32 = 1e-6;
const MAX_SWEEP_ITERATIONS: usize = 32;

pub fn create_collision_time_of_impact3d() -> CollisionTimeOfImpact3D {
    let mut out: CollisionTimeOfImpact3D = flight_entity::allocate_entity();
    initialize_collision_time_of_impact3d(&mut out);
    return out;
}

pub fn initialize_collision_time_of_impact3d(out: &mut CollisionTimeOfImpact3D) {
    out.fraction = 0.0;
    out.x = 0.0;
    out.y = 0.0;
    out.z = 0.0;
    out.normal_x = 0.0;
    out.normal_y = 0.0;
    out.normal_z = 0.0;
}

// flight-lint: allow(conform-params) D5/D9: caller-owned output stays first and registry is explicit
pub fn sweep_collision_shape3d(
    out: &mut CollisionTimeOfImpact3D,
    registry: &CollisionRegistry3D,
    shape_a: &CollisionShape3D,
    translation_ax: f32,
    translation_ay: f32,
    translation_az: f32,
    shape_b: &CollisionShape3D,
    translation_bx: f32,
    translation_by: f32,
    translation_bz: f32,
    max_fraction: Option<f32>,
) -> bool {
    initialize_collision_time_of_impact3d(out);
    let max_fraction = max_fraction.unwrap_or(1.0);

    if !translation_ax.is_finite()
        || !translation_ay.is_finite()
        || !translation_az.is_finite()
        || !translation_bx.is_finite()
        || !translation_by.is_finite()
        || !translation_bz.is_finite()
        || !max_fraction.is_finite()
        || max_fraction < 0.0
    {
        return false;
    }
    let translation_x = translation_ax - translation_bx;
    let translation_y = translation_ay - translation_by;
    let translation_z = translation_az - translation_bz;

    // Conservative advancement using GJK distance, matching the TS implementation.
    let mut distance = create_collision_distance3d();

    // The last measurement taken while the pair was measurably apart.
    let mut normal_x = 0.0_f32;
    let mut normal_y = 0.0_f32;
    let mut normal_z = 0.0_f32;
    let mut point_a_x = 0.0_f32;
    let mut point_a_y = 0.0_f32;
    let mut point_a_z = 0.0_f32;
    let mut point_b_x = 0.0_f32;
    let mut point_b_y = 0.0_f32;
    let mut point_b_z = 0.0_f32;
    let mut measured_fraction = 0.0_f32;
    let mut impacted = false;
    let mut fraction = 0.0_f32;

    for _iteration in 0..MAX_SWEEP_ITERATIONS {
        let separated = write_collision_distance3d(
            &mut distance,
            registry,
            shape_a,
            shape_b,
            Some(translation_x * fraction),
            Some(translation_y * fraction),
            Some(translation_z * fraction),
        );

        if !separated {
            // The pair is already touching or overlapping at this fraction.
            if !distance.overlapping {
                return false;
            }
            impacted = true;
            break;
        }

        // Store the separated measurement.
        normal_x = distance.direction_x;
        normal_y = distance.direction_y;
        normal_z = distance.direction_z;
        point_a_x = distance.point_a_x;
        point_a_y = distance.point_a_y;
        point_a_z = distance.point_a_z;
        point_b_x = distance.point_b_x;
        point_b_y = distance.point_b_y;
        point_b_z = distance.point_b_z;
        measured_fraction = fraction;

        if distance.distance <= SWEEP_TOUCH_TOLERANCE {
            impacted = true;
            break;
        }

        // The closing speed along the separation axis. The direction points from B toward A,
        // so A moving TOWARD B projects negative onto it -- negate to get a positive closing rate.
        let closing_speed =
            -(translation_x * normal_x + translation_y * normal_y + translation_z * normal_z);
        if closing_speed <= 0.0 {
            return false;
        }

        fraction += distance.distance / closing_speed;
        if fraction > max_fraction {
            return false;
        }
    }

    if !impacted {
        return false;
    }

    out.fraction = fraction;
    out.normal_x = normal_x;
    out.normal_y = normal_y;
    out.normal_z = normal_z;

    // Witness point: midpoint between the two closest points, advanced to the impact fraction.
    let advance = fraction - measured_fraction;
    out.x = (point_a_x + translation_x * advance + point_b_x) * 0.5 + translation_bx * fraction;
    out.y = (point_a_y + translation_y * advance + point_b_y) * 0.5 + translation_by * fraction;
    out.z = (point_a_z + translation_z * advance + point_b_z) * 0.5 + translation_bz * fraction;

    true
}
