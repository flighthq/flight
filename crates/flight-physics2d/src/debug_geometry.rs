//! Renderer-neutral debug primitives for a world (TS `debugGeometry.ts`).

use flight_collision::CollisionShape2D;
use flight_entity::allocate_entity;

use crate::joints::{PHYSICS2D_MOUSE_JOINT_KIND, PHYSICS2D_PULLEY_JOINT_KIND};
use crate::types::*;
use crate::world::find_physics2d_body;

const DEFAULT_CENTER_OF_MASS_RADIUS: f32 = 0.08;
const DEFAULT_CONTACT_NORMAL_LENGTH: f32 = 0.5;
const DEFAULT_POINT_RADIUS: f32 = 0.04;

/// An empty reusable debug geometry (TS `createPhysics2DDebugGeometry`).
pub fn create_physics2d_debug_geometry() -> Physics2DDebugGeometry {
    let mut out: Physics2DDebugGeometry = allocate_entity();
    initialize_physics2d_debug_geometry(&mut out);
    return out;
}

/// The construction initializer of `create_physics2d_debug_geometry` (TS
/// `initializePhysics2DDebugGeometry`).
pub fn initialize_physics2d_debug_geometry(out: &mut Physics2DDebugGeometry) {
    out.circles = Vec::new();
    out.circle_count = 0;
    out.lines = Vec::new();
    out.line_count = 0;
}

/// Rewrites `out` with the world's colliders, touching contact normals, joints and centres of mass
/// (TS `writePhysics2DDebugGeometry`). `None` options draw everything at the default sizes.
// flight-lint: allow(conform-params) D9b: out-first
pub fn write_physics2d_debug_geometry(
    out: &mut Physics2DDebugGeometry,
    world: &Physics2DWorld,
    options: Option<&Physics2DDebugGeometryOptions>,
) {
    let options = options.copied().unwrap_or_default();
    out.line_count = 0;
    out.circle_count = 0;

    if options.draw_colliders.unwrap_or(true) {
        for body in &world.bodies {
            let body = body.read().unwrap();
            for collider in &body.colliders {
                let collider = collider.read().unwrap();
                write_collider(out, &collider.local, &body, &options);
            }
        }
    }

    if options.draw_contacts.unwrap_or(true) {
        let length = options.contact_normal_length.unwrap_or(DEFAULT_CONTACT_NORMAL_LENGTH);
        for contact in &world.contacts {
            let contact = contact.read().unwrap();
            if !contact.touching {
                continue;
            }
            for i in 0..contact.point_count {
                let point = contact.points[i];
                write_line(
                    out,
                    Physics2DDebugFeature::ContactNormal,
                    contact.body_a,
                    contact.body_b,
                    point.x,
                    point.y,
                    point.x + contact.normal_x * length,
                    point.y + contact.normal_y * length,
                );
            }
        }
    }

    if options.draw_joints.unwrap_or(true) {
        for joint in &world.joints {
            write_joint(out, world, &*joint.read().unwrap());
        }
    }

    if options.draw_centers_of_mass.unwrap_or(true) {
        let radius = options.center_of_mass_radius.unwrap_or(DEFAULT_CENTER_OF_MASS_RADIUS);
        for body in &world.bodies {
            let body = body.read().unwrap();
            let cos = body.angle.cos();
            let sin = body.angle.sin();
            write_circle(
                out,
                Physics2DDebugFeature::CenterOfMass,
                body.index,
                -1,
                body.x + body.center_x * cos - body.center_y * sin,
                body.y + body.center_x * sin + body.center_y * cos,
                radius,
            );
        }
    }
}

fn joint_anchor(body: &RigidBody2D, local_x: f32, local_y: f32) -> (f32, f32) {
    let x = local_x - body.center_x;
    let y = local_y - body.center_y;
    return (
        body.x + x * body.angle.cos() - y * body.angle.sin(),
        body.y + x * body.angle.sin() + y * body.angle.cos(),
    );
}

fn local_to_world(body: &RigidBody2D, cos: f32, sin: f32, x: f32, y: f32) -> (f32, f32) {
    return (body.x + x * cos - y * sin, body.y + x * sin + y * cos);
}

fn write_circle(out: &mut Physics2DDebugGeometry, feature: Physics2DDebugFeature, body_a: i32, body_b: i32, x: f32, y: f32, radius: f32) {
    let circle = Physics2DDebugCircle {
        body_a,
        body_b,
        feature,
        radius,
        x,
        y,
    };
    if out.circle_count < out.circles.len() {
        out.circles[out.circle_count] = circle;
    } else {
        out.circles.push(circle);
    }
    out.circle_count += 1;
}

// flight-lint: allow(f64) D1: circle and polygon local shapes carry the canonical f64 collision coordinates
fn write_collider(out: &mut Physics2DDebugGeometry, shape: &CollisionShape2D, body: &RigidBody2D, options: &Physics2DDebugGeometryOptions) {
    let cos = body.angle.cos();
    let sin = body.angle.sin();
    match shape {
        CollisionShape2D::Circle(shape) => {
            let (x, y) = local_to_world(body, cos, sin, shape.x as f32, shape.y as f32);
            write_circle(out, Physics2DDebugFeature::Collider, body.index, -1, x, y, shape.radius as f32);
        }
        CollisionShape2D::Aabb(shape) => {
            let center_x = (shape.min_x + shape.max_x) / 2.0;
            let center_y = (shape.min_y + shape.max_y) / 2.0;
            let (x, y) = local_to_world(body, cos, sin, center_x, center_y);
            write_oriented_box(
                out,
                body.index,
                x,
                y,
                (shape.max_x - shape.min_x) / 2.0,
                (shape.max_y - shape.min_y) / 2.0,
                body.angle,
            );
        }
        CollisionShape2D::Obb(shape) => {
            let (x, y) = local_to_world(body, cos, sin, shape.x, shape.y);
            write_oriented_box(out, body.index, x, y, shape.half_w, shape.half_h, body.angle + shape.rotation);
        }
        CollisionShape2D::Polygon(shape) => {
            let points = &shape.points;
            if points.len() < 4 {
                return;
            }
            let (mut previous_x, mut previous_y) =
                local_to_world(body, cos, sin, points[points.len() - 2] as f32, points[points.len() - 1] as f32);
            let mut i = 0;
            while i < points.len() {
                let local_y = points.get(i + 1).copied().unwrap_or(f64::NAN);
                let (x, y) = local_to_world(body, cos, sin, points[i] as f32, local_y as f32);
                write_line(out, Physics2DDebugFeature::Collider, body.index, -1, previous_x, previous_y, x, y);
                previous_x = x;
                previous_y = y;
                i += 2;
            }
        }
        CollisionShape2D::Capsule(shape) => {
            let (x0, y0) = local_to_world(body, cos, sin, shape.x0, shape.y0);
            let (x1, y1) = local_to_world(body, cos, sin, shape.x1, shape.y1);
            write_circle(out, Physics2DDebugFeature::Collider, body.index, -1, x0, y0, shape.radius);
            write_circle(out, Physics2DDebugFeature::Collider, body.index, -1, x1, y1, shape.radius);
            let axis_x = x1 - x0;
            let axis_y = y1 - y0;
            let length = (axis_x * axis_x + axis_y * axis_y).sqrt();
            if length > 0.0 {
                let offset_x = (-axis_y / length) * shape.radius;
                let offset_y = (axis_x / length) * shape.radius;
                write_line(out, Physics2DDebugFeature::Collider, body.index, -1, x0 + offset_x, y0 + offset_y, x1 + offset_x, y1 + offset_y);
                write_line(out, Physics2DDebugFeature::Collider, body.index, -1, x0 - offset_x, y0 - offset_y, x1 - offset_x, y1 - offset_y);
            }
        }
        CollisionShape2D::Segment(shape) => {
            let (x0, y0) = local_to_world(body, cos, sin, shape.x0, shape.y0);
            let (x1, y1) = local_to_world(body, cos, sin, shape.x1, shape.y1);
            write_line(out, Physics2DDebugFeature::Collider, body.index, -1, x0, y0, x1, y1);
        }
        CollisionShape2D::Point(shape) => {
            let (x, y) = local_to_world(body, cos, sin, shape.x, shape.y);
            let radius = options.point_radius.unwrap_or(DEFAULT_POINT_RADIUS);
            write_circle(out, Physics2DDebugFeature::Collider, body.index, -1, x, y, radius);
        }
    }
}

fn write_joint(out: &mut Physics2DDebugGeometry, world: &Physics2DWorld, joint: &dyn Physics2DJoint) {
    let fields = joint.joint_fields();
    let Some(body_b) = find_physics2d_body(world, fields.body_b) else {
        return;
    };
    let (anchor_bx, anchor_by) = joint_anchor(&body_b.read().unwrap(), fields.local_anchor_bx, fields.local_anchor_by);
    if fields.kind == PHYSICS2D_MOUSE_JOINT_KIND {
        if let Some(mouse) = joint.as_any().downcast_ref::<Physics2DMouseJoint>() {
            write_line(out, Physics2DDebugFeature::Joint, fields.body_a, fields.body_b, mouse.target_x, mouse.target_y, anchor_bx, anchor_by);
        }
        return;
    }
    if world.joint_solvers.get(&fields.kind).is_some_and(|solver| solver.uses_body_a == Some(false)) {
        return;
    }
    let Some(body_a) = find_physics2d_body(world, fields.body_a) else {
        return;
    };
    let (anchor_ax, anchor_ay) = joint_anchor(&body_a.read().unwrap(), fields.local_anchor_ax, fields.local_anchor_ay);
    if fields.kind == PHYSICS2D_PULLEY_JOINT_KIND
        && let Some(pulley) = joint.as_any().downcast_ref::<Physics2DPulleyJoint>()
    {
        let (a, b) = (fields.body_a, fields.body_b);
        write_line(out, Physics2DDebugFeature::Joint, a, b, pulley.ground_anchor_ax, pulley.ground_anchor_ay, anchor_ax, anchor_ay);
        write_line(out, Physics2DDebugFeature::Joint, a, b, pulley.ground_anchor_bx, pulley.ground_anchor_by, anchor_bx, anchor_by);
        write_line(
            out,
            Physics2DDebugFeature::Joint,
            a,
            b,
            pulley.ground_anchor_ax,
            pulley.ground_anchor_ay,
            pulley.ground_anchor_bx,
            pulley.ground_anchor_by,
        );
        return;
    }
    write_line(out, Physics2DDebugFeature::Joint, fields.body_a, fields.body_b, anchor_ax, anchor_ay, anchor_bx, anchor_by);
}

fn write_line(
    out: &mut Physics2DDebugGeometry,
    feature: Physics2DDebugFeature,
    body_a: i32,
    body_b: i32,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
) {
    let line = Physics2DDebugLine {
        body_a,
        body_b,
        feature,
        x0,
        x1,
        y0,
        y1,
    };
    if out.line_count < out.lines.len() {
        out.lines[out.line_count] = line;
    } else {
        out.lines.push(line);
    }
    out.line_count += 1;
}

fn write_oriented_box(out: &mut Physics2DDebugGeometry, body_index: i32, center_x: f32, center_y: f32, half_w: f32, half_h: f32, rotation: f32) {
    let cos = rotation.cos();
    let sin = rotation.sin();
    let x0 = center_x - half_w * cos + half_h * sin;
    let y0 = center_y - half_w * sin - half_h * cos;
    let x1 = center_x + half_w * cos + half_h * sin;
    let y1 = center_y + half_w * sin - half_h * cos;
    let x2 = center_x + half_w * cos - half_h * sin;
    let y2 = center_y + half_w * sin + half_h * cos;
    let x3 = center_x - half_w * cos - half_h * sin;
    let y3 = center_y - half_w * sin + half_h * cos;
    let feature = Physics2DDebugFeature::Collider;
    write_line(out, feature, body_index, -1, x0, y0, x1, y1);
    write_line(out, feature, body_index, -1, x1, y1, x2, y2);
    write_line(out, feature, body_index, -1, x2, y2, x3, y3);
    write_line(out, feature, body_index, -1, x3, y3, x0, y0);
}
