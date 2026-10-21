//! Publishing body bounds to the spatial broadphase (TS `broadphase.ts`).

use flight_spatial::SpatialAabb2D;

use crate::collider_transform::{update_physics2d_collider_world_shape, write_physics2d_collider_bounds};
use crate::material::{js_max, js_min};
use crate::types::*;

const MAX_SIMULATED_EXTENT: f32 = 1e7;

/// Refreshes every collider's world shape and republishes each body's bounds (TS
/// `synchronizePhysics2DBroadphase`).
pub fn synchronize_physics2d_broadphase(world: &Physics2DWorld) {
    synchronize_physics2d_broadphase_bounds(world, 0.0);
}

/// As `synchronize_physics2d_broadphase`, with each awake moving body's bounds swept over `dt`
/// (TS `synchronizePhysics2DSweptBroadphase`).
pub fn synchronize_physics2d_swept_broadphase(world: &Physics2DWorld, dt: f32) {
    synchronize_physics2d_broadphase_bounds(world, dt);
}

// One f32 ulp-scale pad (TS `Number.EPSILON * 4`, the same "a few ulps" in the bounds' own width),
// so a closed upper bound is never lost to rounding.
fn padded_upper_bound(value: f32) -> f32 {
    let padded = value + js_max(1.0, value.abs()) * f32::EPSILON * 4.0;
    return if padded.is_finite() { padded } else { value };
}

fn synchronize_physics2d_broadphase_bounds(world: &Physics2DWorld, dt: f32) {
    let mut bounds = SpatialAabb2D::default();
    let mut body_bounds = SpatialAabb2D::default();
    for body in &world.bodies {
        let body = body.read().unwrap();
        let mut min_x = f32::INFINITY;
        let mut min_y = f32::INFINITY;
        let mut max_x = f32::NEG_INFINITY;
        let mut max_y = f32::NEG_INFINITY;
        let mut rotation_radius_squared = 0.0;
        for collider in &body.colliders {
            let mut collider = collider.write().unwrap();
            update_physics2d_collider_world_shape(&mut collider, &body);
            write_physics2d_collider_bounds(&mut bounds, &collider);
            if bounds.min_x < min_x {
                min_x = bounds.min_x;
            }
            if bounds.min_y < min_y {
                min_y = bounds.min_y;
            }
            if bounds.max_x > max_x {
                max_x = bounds.max_x;
            }
            if bounds.max_y > max_y {
                max_y = bounds.max_y;
            }
            let radius_x = js_max((bounds.min_x - body.x).abs(), (bounds.max_x - body.x).abs());
            let radius_y = js_max((bounds.min_y - body.y).abs(), (bounds.max_y - body.y).abs());
            let radius_squared = radius_x * radius_x + radius_y * radius_y;
            if radius_squared > rotation_radius_squared {
                rotation_radius_squared = radius_squared;
            }
        }
        if min_x > max_x {
            (world.index.remove_spatial_object)(body.index);
            continue;
        }
        if dt > 0.0 && body.body_type != Physics2DBodyType::Static && !body.sleeping {
            let translation_x = body.velocity_x * dt;
            let translation_y = body.velocity_y * dt;
            if body.angular_velocity != 0.0 {
                let radius = rotation_radius_squared.sqrt();
                min_x = js_min(js_min(min_x, body.x - radius), body.x + translation_x - radius);
                min_y = js_min(js_min(min_y, body.y - radius), body.y + translation_y - radius);
                max_x = js_max(js_max(max_x, body.x + radius), body.x + translation_x + radius);
                max_y = js_max(js_max(max_y, body.y + radius), body.y + translation_y + radius);
            } else {
                if translation_x < 0.0 {
                    min_x += translation_x;
                } else {
                    max_x += translation_x;
                }
                if translation_y < 0.0 {
                    min_y += translation_y;
                } else {
                    max_y += translation_y;
                }
            }
        }
        if !min_x.is_finite()
            || !min_y.is_finite()
            || !max_x.is_finite()
            || !max_y.is_finite()
            || max_x - min_x > MAX_SIMULATED_EXTENT
            || max_y - min_y > MAX_SIMULATED_EXTENT
        {
            (world.index.remove_spatial_object)(body.index);
            continue;
        }
        body_bounds.min_x = min_x;
        body_bounds.min_y = min_y;
        body_bounds.max_x = padded_upper_bound(max_x);
        body_bounds.max_y = padded_upper_bound(max_y);
        (world.index.update_spatial_object)(body.index, &body_bounds);
    }
}
