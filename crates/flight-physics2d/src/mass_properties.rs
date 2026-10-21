//! Mass properties derived from collider geometry (TS `massProperties.ts`). A body's mass is never
//! assigned, only derived, so its inertia cannot disagree with its shape.

use flight_collision::CollisionShape2D;

use crate::types::*;

/// Writes one collider's mass, inertia about its own centre and local centre (TS
/// `computePhysics2DColliderMassData`). Area-less kinds carry no mass.
// flight-lint: allow(conform-params) D9b: out-first
pub fn compute_physics2d_collider_mass_data(out: &mut Physics2DMassData, collider: &Physics2DCollider) {
    let density = collider.material.density;
    match &collider.local {
        CollisionShape2D::Circle(shape) => {
            let radius = shape.radius as f32;
            let area = std::f32::consts::PI * radius * radius;
            out.mass = area * density;
            out.inertia = 0.5 * out.mass * radius * radius;
            out.center_x = shape.x as f32;
            out.center_y = shape.y as f32;
        }
        CollisionShape2D::Capsule(shape) => {
            let axis_x = shape.x1 - shape.x0;
            let axis_y = shape.y1 - shape.y0;
            let length = (axis_x * axis_x + axis_y * axis_y).sqrt();
            let radius = shape.radius;
            let rectangle_mass = 2.0 * radius * length * density;
            let disc_mass = std::f32::consts::PI * radius * radius * density;
            out.mass = rectangle_mass + disc_mass;
            out.inertia = (rectangle_mass * (length * length + 4.0 * radius * radius)) / 12.0
                + disc_mass
                    * ((radius * radius) / 2.0
                        + (length * length) / 4.0
                        + (4.0 * radius * length) / (3.0 * std::f32::consts::PI));
            out.center_x = (shape.x0 + shape.x1) / 2.0;
            out.center_y = (shape.y0 + shape.y1) / 2.0;
        }
        CollisionShape2D::Aabb(shape) => {
            let width = shape.max_x - shape.min_x;
            let height = shape.max_y - shape.min_y;
            out.mass = width * height * density;
            out.inertia = (out.mass * (width * width + height * height)) / 12.0;
            out.center_x = (shape.min_x + shape.max_x) / 2.0;
            out.center_y = (shape.min_y + shape.max_y) / 2.0;
        }
        CollisionShape2D::Obb(shape) => {
            let width = shape.half_w * 2.0;
            let height = shape.half_h * 2.0;
            out.mass = width * height * density;
            out.inertia = (out.mass * (width * width + height * height)) / 12.0;
            out.center_x = shape.x;
            out.center_y = shape.y;
        }
        CollisionShape2D::Polygon(shape) => write_polygon_mass_data(out, &shape.points, density),
        CollisionShape2D::Segment(_) | CollisionShape2D::Point(_) => {
            out.mass = 0.0;
            out.inertia = 0.0;
            out.center_x = 0.0;
            out.center_y = 0.0;
        }
    }
}

/// Re-derives a body's mass, inertia about the combined centre of mass, centre and inverses from its
/// colliders (TS `updateRigidBody2DMassData`). Only dynamic bodies carry mass; a fixed-rotation body
/// keeps its mass and exposes zero inverse inertia.
pub fn update_rigid_body2d_mass_data(body: &mut RigidBody2D) {
    let mut scratch = Physics2DMassData::default();
    let mut mass = 0.0;
    let mut weighted_x = 0.0;
    let mut weighted_y = 0.0;
    for collider in &body.colliders {
        compute_physics2d_collider_mass_data(&mut scratch, &collider.read().unwrap());
        mass += scratch.mass;
        weighted_x += scratch.center_x * scratch.mass;
        weighted_y += scratch.center_y * scratch.mass;
    }

    if mass > 0.0 {
        body.center_x = weighted_x / mass;
        body.center_y = weighted_y / mass;
    } else {
        body.center_x = 0.0;
        body.center_y = 0.0;
    }

    let mut inertia = 0.0;
    for collider in &body.colliders {
        compute_physics2d_collider_mass_data(&mut scratch, &collider.read().unwrap());
        let offset_x = scratch.center_x - body.center_x;
        let offset_y = scratch.center_y - body.center_y;
        inertia += scratch.inertia + scratch.mass * (offset_x * offset_x + offset_y * offset_y);
    }

    let simulated = body.body_type == Physics2DBodyType::Dynamic;
    body.mass = if simulated { mass } else { 0.0 };
    body.inertia = if simulated { inertia } else { 0.0 };
    body.inverse_mass = if simulated && mass > 0.0 { 1.0 / mass } else { 0.0 };
    body.inverse_inertia = if simulated && !body.fixed_rotation && inertia > 0.0 {
        1.0 / inertia
    } else {
        0.0
    };
}

// The polygon's absolute coordinates are f64 in the canonical collision shape (measured there); the
// signed-area sums run in that width and the derived mass data narrows to the body's f32.
fn write_polygon_mass_data(out: &mut Physics2DMassData, points: &[f64], density: f32) {
    let count = points.len() >> 1;
    if count < 3 {
        out.mass = 0.0;
        out.inertia = 0.0;
        out.center_x = 0.0;
        out.center_y = 0.0;
        return;
    }

    let mut area = 0.0_f64;
    let mut centroid_x = 0.0_f64;
    let mut centroid_y = 0.0_f64;
    let mut moment = 0.0_f64;
    for i in 0..count {
        let j = (i + 1) % count;
        let x0 = points[i * 2];
        let y0 = points[i * 2 + 1];
        let x1 = points[j * 2];
        let y1 = points[j * 2 + 1];
        let cross = x0 * y1 - x1 * y0;
        area += cross;
        centroid_x += (x0 + x1) * cross;
        centroid_y += (y0 + y1) * cross;
        moment += cross * (x0 * x0 + x0 * x1 + x1 * x1 + y0 * y0 + y0 * y1 + y1 * y1);
    }

    area *= 0.5;
    if area == 0.0 {
        out.mass = 0.0;
        out.inertia = 0.0;
        out.center_x = 0.0;
        out.center_y = 0.0;
        return;
    }

    let density = density as f64;
    let mass = area.abs() * density;
    let center_x = centroid_x / (6.0 * area);
    let center_y = centroid_y / (6.0 * area);
    let origin_moment = (moment.abs() / 12.0) * density;
    let offset_squared = center_x * center_x + center_y * center_y;
    out.mass = mass as f32;
    out.center_x = center_x as f32;
    out.center_y = center_y as f32;
    out.inertia = (origin_moment - mass * offset_squared) as f32;
}
