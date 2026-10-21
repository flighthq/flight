use crate::gjk_distance3d::*;
use crate::types::*;

const SWEEP_TOUCH_TOLERANCE: f32 = 1e-6;
const MAX_SWEEP_ITERATIONS: usize = 32;
const EPSILON: f32 = 1e-12;

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

// flight-lint: allow(conform-params) registry passed explicitly (D5)
pub fn sweep_collision_shape3d(
    registry: &CollisionRegistry3D,
    a: &CollisionShape3D,
    b: &CollisionShape3D,
    velocity_x: f32,
    velocity_y: f32,
    velocity_z: f32,
    out: &mut CollisionTimeOfImpact3D,
) -> bool {
    initialize_collision_time_of_impact3d(out);

    // Reject non-finite inputs.
    if !velocity_x.is_finite() || !velocity_y.is_finite() || !velocity_z.is_finite() {
        return false;
    }

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
        let shifted_a = translate_shape3d(a, velocity_x * fraction, velocity_y * fraction, velocity_z * fraction);
        let separated = write_collision_distance3d(
            &mut distance, registry, &shifted_a, b, None, None, None,
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
        let closing_speed = -(velocity_x * normal_x + velocity_y * normal_y + velocity_z * normal_z);
        if closing_speed <= 0.0 {
            return false;
        }

        fraction += distance.distance / closing_speed;
        if fraction > 1.0 {
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
    out.x = (point_a_x + velocity_x * advance + point_b_x) * 0.5;
    out.y = (point_a_y + velocity_y * advance + point_b_y) * 0.5;
    out.z = (point_a_z + velocity_z * advance + point_b_z) * 0.5;

    true
}

fn translate_shape3d(shape: &CollisionShape3D, dx: f32, dy: f32, dz: f32) -> CollisionShape3D {
    match shape {
        CollisionShape3D::Sphere(s) => {
            CollisionShape3D::Sphere(CollisionSphere3D {
                x: s.x + dx, y: s.y + dy, z: s.z + dz, radius: s.radius,
            })
        }
        CollisionShape3D::Aabb(a) => {
            CollisionShape3D::Aabb(CollisionAabb3D {
                min_x: a.min_x + dx, min_y: a.min_y + dy, min_z: a.min_z + dz,
                max_x: a.max_x + dx, max_y: a.max_y + dy, max_z: a.max_z + dz,
            })
        }
        CollisionShape3D::Box(b) => {
            CollisionShape3D::Box(CollisionBox3D {
                x: b.x + dx, y: b.y + dy, z: b.z + dz,
                half_x: b.half_x, half_y: b.half_y, half_z: b.half_z,
                rotation_x: b.rotation_x, rotation_y: b.rotation_y,
                rotation_z: b.rotation_z, rotation_w: b.rotation_w,
            })
        }
        CollisionShape3D::Capsule(c) => {
            CollisionShape3D::Capsule(CollisionCapsule3D {
                x0: c.x0 + dx, y0: c.y0 + dy, z0: c.z0 + dz,
                x1: c.x1 + dx, y1: c.y1 + dy, z1: c.z1 + dz,
                radius: c.radius,
            })
        }
        CollisionShape3D::Cylinder(c) => {
            CollisionShape3D::Cylinder(CollisionCylinder3D {
                x0: c.x0 + dx, y0: c.y0 + dy, z0: c.z0 + dz,
                x1: c.x1 + dx, y1: c.y1 + dy, z1: c.z1 + dz,
                radius: c.radius,
            })
        }
        CollisionShape3D::Cone(c) => {
            CollisionShape3D::Cone(CollisionCone3D {
                x0: c.x0 + dx, y0: c.y0 + dy, z0: c.z0 + dz,
                x1: c.x1 + dx, y1: c.y1 + dy, z1: c.z1 + dz,
                radius: c.radius,
            })
        }
        CollisionShape3D::Convex(c) => {
            let mut pts = c.points.clone();
            let count = pts.len() / 3;
            for i in 0..count {
                pts[i * 3] += dx;
                pts[i * 3 + 1] += dy;
                pts[i * 3 + 2] += dz;
            }
            CollisionShape3D::Convex(CollisionConvex3D { points: pts })
        }
    }
}
