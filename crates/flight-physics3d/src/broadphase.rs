use flight_spatial::SpatialAabb3D;

use crate::collider_transform::{
    update_physics_3d_collider_world_shape, write_physics_3d_collider_bounds,
};
use crate::physics_3d_broadphase_publication::{
    publish_physics_3d_broadphase_body, withdraw_physics_3d_broadphase_body,
};
use crate::{Physics3DBodyType, Physics3DWorld};

const MAX_SIMULATED_EXTENT: f32 = 1e7;

fn padded_upper_bound(value: f32) -> f32 {
    let padded = value + value.abs().max(1.0) * f32::EPSILON * 4.0;
    return if padded.is_finite() { padded } else { value };
}

pub fn synchronize_physics_3d_broadphase(world: &mut Physics3DWorld) {
    synchronize_physics_3d_broadphase_with_dt(world, 0.0);
}

fn synchronize_physics_3d_broadphase_with_dt(world: &mut Physics3DWorld, dt: f32) {
    let bodies = world.bodies.clone();
    for body_ref in bodies {
        let body = body_ref.read().unwrap();
        let mut bounds = SpatialAabb3D::default();
        let (mut min_x, mut min_y, mut min_z) = (f32::INFINITY, f32::INFINITY, f32::INFINITY);
        let (mut max_x, mut max_y, mut max_z) =
            (f32::NEG_INFINITY, f32::NEG_INFINITY, f32::NEG_INFINITY);
        let mut rotation_radius_squared = 0.0_f32;
        for collider_ref in &body.colliders {
            let mut collider = collider_ref.write().unwrap();
            update_physics_3d_collider_world_shape(&mut collider, &body);
            write_physics_3d_collider_bounds(&collider, &mut bounds);
            min_x = min_x.min(bounds.min_x);
            min_y = min_y.min(bounds.min_y);
            min_z = min_z.min(bounds.min_z);
            max_x = max_x.max(bounds.max_x);
            max_y = max_y.max(bounds.max_y);
            max_z = max_z.max(bounds.max_z);
            if dt > 0.0 {
                let rx = (bounds.min_x - body.x)
                    .abs()
                    .max((bounds.max_x - body.x).abs());
                let ry = (bounds.min_y - body.y)
                    .abs()
                    .max((bounds.max_y - body.y).abs());
                let rz = (bounds.min_z - body.z)
                    .abs()
                    .max((bounds.max_z - body.z).abs());
                rotation_radius_squared = rotation_radius_squared.max(rx * rx + ry * ry + rz * rz);
            }
        }
        if min_x > max_x {
            withdraw_physics_3d_broadphase_body(world, body.index);
            continue;
        }
        if dt > 0.0 && body.body_type != Physics3DBodyType::Static && !body.sleeping {
            let translation = [
                body.velocity_x * dt,
                body.velocity_y * dt,
                body.velocity_z * dt,
            ];
            let spinning = body.angular_velocity_x != 0.0
                || body.angular_velocity_y != 0.0
                || body.angular_velocity_z != 0.0;
            if spinning {
                let radius = rotation_radius_squared.sqrt();
                min_x = min_x
                    .min(body.x - radius)
                    .min(body.x + translation[0] - radius);
                min_y = min_y
                    .min(body.y - radius)
                    .min(body.y + translation[1] - radius);
                min_z = min_z
                    .min(body.z - radius)
                    .min(body.z + translation[2] - radius);
                max_x = max_x
                    .max(body.x + radius)
                    .max(body.x + translation[0] + radius);
                max_y = max_y
                    .max(body.y + radius)
                    .max(body.y + translation[1] + radius);
                max_z = max_z
                    .max(body.z + radius)
                    .max(body.z + translation[2] + radius);
            } else {
                if translation[0] < 0.0 {
                    min_x += translation[0]
                } else {
                    max_x += translation[0]
                }
                if translation[1] < 0.0 {
                    min_y += translation[1]
                } else {
                    max_y += translation[1]
                }
                if translation[2] < 0.0 {
                    min_z += translation[2]
                } else {
                    max_z += translation[2]
                }
            }
        }
        if ![min_x, min_y, min_z, max_x, max_y, max_z]
            .iter()
            .all(|value| value.is_finite())
            || max_x - min_x > MAX_SIMULATED_EXTENT
            || max_y - min_y > MAX_SIMULATED_EXTENT
            || max_z - min_z > MAX_SIMULATED_EXTENT
        {
            withdraw_physics_3d_broadphase_body(world, body.index);
            continue;
        }
        let body_bounds = SpatialAabb3D {
            min_x,
            min_y,
            min_z,
            max_x: padded_upper_bound(max_x),
            max_y: padded_upper_bound(max_y),
            max_z: padded_upper_bound(max_z),
        };
        publish_physics_3d_broadphase_body(world, body.index, &body_bounds);
    }
}

pub fn synchronize_physics_3d_swept_broadphase(world: &mut Physics3DWorld, dt: f32) {
    synchronize_physics_3d_broadphase_with_dt(world, dt);
}
