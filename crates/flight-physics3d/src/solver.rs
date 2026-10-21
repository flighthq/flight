// flight-lint: allow-file(conform-params) D5: collision registry is explicit caller-owned state
use std::collections::HashMap;
use std::sync::Arc;

use flight_collision::{CollisionRegistry3D, create_collision_contact_manifold3d};
use flight_entity::allocate_entity;

use crate::collider_collision::collide_physics_3d_collider_shapes;
use crate::collider_transform::update_physics_3d_collider_world_shape;
use crate::symmetric_tensor::apply_symmetric_tensor;
use crate::world::write_rigid_body_3d_world_center;
use crate::{
    Physics3DContactConstraint, Physics3DContactConstraintPoint, Physics3DWorld, RigidBody3D,
};

const AXIS_SELECTION_THRESHOLD: f32 = 0.5773502691896258;

pub fn create_physics_3d_contact_constraint() -> Physics3DContactConstraint {
    let mut out = allocate_entity();
    initialize_physics_3d_contact_constraint(&mut out);
    return out;
}

pub fn create_physics_3d_contact_constraint_point() -> Physics3DContactConstraintPoint {
    let mut out = allocate_entity();
    initialize_physics_3d_contact_constraint_point(&mut out);
    return out;
}

pub fn initialize_physics_3d_contact_constraint(out: &mut Physics3DContactConstraint) {
    *out = Physics3DContactConstraint::default();
    out.contact = -1;
}

pub fn initialize_physics_3d_contact_constraint_point(out: &mut Physics3DContactConstraintPoint) {
    *out = Physics3DContactConstraintPoint::default();
}

#[allow(clippy::too_many_arguments)]
fn apply_body_impulse(
    body: &mut RigidBody3D,
    rx: f32,
    ry: f32,
    rz: f32,
    ix: f32,
    iy: f32,
    iz: f32,
) {
    body.velocity_x += ix * body.inverse_mass;
    body.velocity_y += iy * body.inverse_mass;
    body.velocity_z += iz * body.inverse_mass;
    let torque = [ry * iz - rz * iy, rz * ix - rx * iz, rx * iy - ry * ix];
    let mut turn = [0.0; 3];
    apply_symmetric_tensor(
        &mut turn,
        &world_inertia(body),
        torque[0],
        torque[1],
        torque[2],
    );
    body.angular_velocity_x += turn[0];
    body.angular_velocity_y += turn[1];
    body.angular_velocity_z += turn[2];
}

fn apply_body_position_correction(body: &mut RigidBody3D, r: [f32; 3], c: [f32; 3]) {
    body.x += c[0] * body.inverse_mass;
    body.y += c[1] * body.inverse_mass;
    body.z += c[2] * body.inverse_mass;
    let turn = [
        r[1] * c[2] - r[2] * c[1],
        r[2] * c[0] - r[0] * c[2],
        r[0] * c[1] - r[1] * c[0],
    ];
    let mut angle = [0.0; 3];
    apply_symmetric_tensor(&mut angle, &world_inertia(body), turn[0], turn[1], turn[2]);
    if angle == [0.0; 3] {
        return;
    }
    let (qx, qy, qz, qw) = (
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
    );
    let mut next = [
        qx + 0.5 * (angle[0] * qw + angle[1] * qz - angle[2] * qy),
        qy + 0.5 * (angle[1] * qw + angle[2] * qx - angle[0] * qz),
        qz + 0.5 * (angle[2] * qw + angle[0] * qy - angle[1] * qx),
        qw - 0.5 * (angle[0] * qx + angle[1] * qy + angle[2] * qz),
    ];
    let length = (next.iter().map(|v| v * v).sum::<f32>()).sqrt();
    if length == 0.0 {
        return;
    }
    for value in &mut next {
        *value /= length;
    }
    [
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
    ] = next;
}

#[allow(clippy::too_many_arguments)]
fn apply_contact_impulse(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    rax: f32,
    ray: f32,
    raz: f32,
    rbx: f32,
    rby: f32,
    rbz: f32,
    ix: f32,
    iy: f32,
    iz: f32,
) {
    apply_body_impulse(a, rax, ray, raz, ix, iy, iz);
    apply_body_impulse(b, rbx, rby, rbz, -ix, -iy, -iz);
}

fn apply_position_correction(
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    ra: [f32; 3],
    rb: [f32; 3],
    c: [f32; 3],
) {
    apply_body_position_correction(a, ra, c);
    apply_body_position_correction(b, rb, [-c[0], -c[1], -c[2]]);
}

#[allow(clippy::too_many_arguments)]
fn get_effective_mass(
    a: &RigidBody3D,
    b: &RigidBody3D,
    rax: f32,
    ray: f32,
    raz: f32,
    rbx: f32,
    rby: f32,
    rbz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
) -> f32 {
    let mut denominator = a.inverse_mass + b.inverse_mass;
    for (body, rx, ry, rz) in [(a, rax, ray, raz), (b, rbx, rby, rbz)] {
        let cross = [ry * dz - rz * dy, rz * dx - rx * dz, rx * dy - ry * dx];
        let mut applied = [0.0; 3];
        apply_symmetric_tensor(
            &mut applied,
            &world_inertia(body),
            cross[0],
            cross[1],
            cross[2],
        );
        denominator += cross[0] * applied[0] + cross[1] * applied[1] + cross[2] * applied[2];
    }
    return if denominator > 0.0 {
        1.0 / denominator
    } else {
        0.0
    };
}

#[allow(clippy::too_many_arguments)]
fn get_relative_velocity(
    a: &RigidBody3D,
    b: &RigidBody3D,
    rax: f32,
    ray: f32,
    raz: f32,
    rbx: f32,
    rby: f32,
    rbz: f32,
    dx: f32,
    dy: f32,
    dz: f32,
) -> f32 {
    let pa = [
        a.velocity_x + a.angular_velocity_y * raz - a.angular_velocity_z * ray,
        a.velocity_y + a.angular_velocity_z * rax - a.angular_velocity_x * raz,
        a.velocity_z + a.angular_velocity_x * ray - a.angular_velocity_y * rax,
    ];
    let pb = [
        b.velocity_x + b.angular_velocity_y * rbz - b.angular_velocity_z * rby,
        b.velocity_y + b.angular_velocity_z * rbx - b.angular_velocity_x * rbz,
        b.velocity_z + b.angular_velocity_x * rby - b.angular_velocity_y * rbx,
    ];
    return (pa[0] - pb[0]) * dx + (pa[1] - pb[1]) * dy + (pa[2] - pb[2]) * dz;
}

fn has_rotational_freedom(body: &RigidBody3D) -> bool {
    return world_inertia(body).iter().any(|v| *v != 0.0);
}

pub fn prepare_physics_3d_contact_constraints(world: &mut Physics3DWorld) {
    let previous = std::mem::take(&mut world.solver.constraints);
    let previous_indices = std::mem::take(&mut world.solver.constraint_by_contact);
    let mut contact_by_constraint = vec![None; previous.len()];
    for (contact, constraint) in previous_indices {
        if constraint < contact_by_constraint.len() {
            contact_by_constraint[constraint] = Some(contact);
        }
    }
    let mut previous_by_contact = HashMap::<usize, Physics3DContactConstraint>::new();
    for (index, constraint) in previous.into_iter().enumerate() {
        if let Some(contact) = contact_by_constraint[index] {
            previous_by_contact.insert(contact, constraint);
        }
    }
    let mut constraints = Vec::new();
    for island in 0..world.solve_island_roots.len() {
        let start = world.solve_island_contact_starts[island];
        let end = start + world.solve_island_contact_counts[island];
        for at in start..end {
            let contact_index = world.solve_island_contact_indices[at];
            let Some(contact_ref) = world.contacts.get(contact_index).cloned() else {
                continue;
            };
            let contact = contact_ref.read().unwrap();
            if !contact.touching || contact.point_count == 0 {
                continue;
            }
            let (Some(a_ref), Some(b_ref)) = (
                world.body_by_index.get(&contact.body_a).cloned(),
                world.body_by_index.get(&contact.body_b).cloned(),
            ) else {
                continue;
            };
            let a = a_ref.read().unwrap();
            let b = b_ref.read().unwrap();
            if a.inverse_mass == 0.0
                && b.inverse_mass == 0.0
                && !has_rotational_freedom(&a)
                && !has_rotational_freedom(&b)
            {
                continue;
            }
            let key = Arc::as_ptr(&contact_ref) as usize;
            let mut constraint = previous_by_contact
                .remove(&key)
                .unwrap_or_else(create_physics_3d_contact_constraint);
            let previous_points =
                constraint.points[..constraint.point_count.min(constraint.points.len())].to_vec();
            constraint.contact = contact_index as i32;
            constraint.point_count = contact.point_count;
            write_friction_basis(
                contact.normal_x,
                contact.normal_y,
                contact.normal_z,
                &mut constraint,
            );
            while constraint.points.len() < contact.point_count {
                constraint
                    .points
                    .push(create_physics_3d_contact_constraint_point());
            }
            for i in 0..contact.point_count {
                let source = &contact.points[i];
                let point = &mut constraint.points[i];
                let carried = previous_points
                    .iter()
                    .find(|point| point.feature_id == source.feature_id);
                point.feature_id = source.feature_id;
                point.normal_impulse = if world.config.sequential_impulse.warm_starting {
                    carried.map_or(0.0, |p| p.normal_impulse)
                } else {
                    0.0
                };
                point.tangent_impulse0 = if world.config.sequential_impulse.warm_starting {
                    carried.map_or(0.0, |p| p.tangent_impulse0)
                } else {
                    0.0
                };
                point.tangent_impulse1 = if world.config.sequential_impulse.warm_starting {
                    carried.map_or(0.0, |p| p.tangent_impulse1)
                } else {
                    0.0
                };
                point.normal_mass = get_effective_mass(
                    &a,
                    &b,
                    source.r_ax,
                    source.r_ay,
                    source.r_az,
                    source.r_bx,
                    source.r_by,
                    source.r_bz,
                    contact.normal_x,
                    contact.normal_y,
                    contact.normal_z,
                );
                point.tangent_mass0 = get_effective_mass(
                    &a,
                    &b,
                    source.r_ax,
                    source.r_ay,
                    source.r_az,
                    source.r_bx,
                    source.r_by,
                    source.r_bz,
                    constraint.tangent0_x,
                    constraint.tangent0_y,
                    constraint.tangent0_z,
                );
                point.tangent_mass1 = get_effective_mass(
                    &a,
                    &b,
                    source.r_ax,
                    source.r_ay,
                    source.r_az,
                    source.r_bx,
                    source.r_by,
                    source.r_bz,
                    constraint.tangent1_x,
                    constraint.tangent1_y,
                    constraint.tangent1_z,
                );
                let approach = get_relative_velocity(
                    &a,
                    &b,
                    source.r_ax,
                    source.r_ay,
                    source.r_az,
                    source.r_bx,
                    source.r_by,
                    source.r_bz,
                    contact.normal_x,
                    contact.normal_y,
                    contact.normal_z,
                );
                point.bias = if approach < -world.config.sequential_impulse.restitution_threshold {
                    -contact.restitution * approach
                } else {
                    0.0
                };
            }
            constraints.push(constraint);
        }
    }
    world.solver.constraints = constraints;
    for (i, c) in world.solver.constraints.iter().enumerate() {
        if c.contact >= 0 {
            let contact = &world.contacts[c.contact as usize];
            world
                .solver
                .constraint_by_contact
                .insert(Arc::as_ptr(contact) as usize, i);
        }
    }
}

pub fn solve_physics_3d_contact_positions(
    world: &mut Physics3DWorld,
    registry: &CollisionRegistry3D,
) -> f32 {
    let mut deepest = 0.0_f32;
    let mut manifold = create_collision_contact_manifold3d();
    let constraint_contacts: Vec<usize> = world
        .solver
        .constraints
        .iter()
        .filter_map(|c| (c.contact >= 0).then_some(c.contact as usize))
        .collect();
    for contact_index in constraint_contacts {
        let Some(contact_ref) = world.contacts.get(contact_index).cloned() else {
            continue;
        };
        let contact = contact_ref.read().unwrap();
        let (Some(a_ref), Some(b_ref)) = (
            world.body_by_index.get(&contact.body_a).cloned(),
            world.body_by_index.get(&contact.body_b).cloned(),
        ) else {
            continue;
        };
        if Arc::ptr_eq(&a_ref, &b_ref) {
            continue;
        }
        let (mut a, mut b) = (a_ref.write().unwrap(), b_ref.write().unwrap());
        let (Some(ca_ref), Some(cb_ref)) = (
            a.colliders.get(contact.collider_a),
            b.colliders.get(contact.collider_b),
        ) else {
            continue;
        };
        let (mut ca, mut cb) = (ca_ref.write().unwrap(), cb_ref.write().unwrap());
        update_physics_3d_collider_world_shape(&mut ca, &a);
        update_physics_3d_collider_world_shape(&mut cb, &b);
        if !collide_physics_3d_collider_shapes(&mut manifold, registry, &ca.world, &cb.world) {
            continue;
        }
        drop(ca);
        drop(cb);
        let (mut center_a, mut center_b) = ([0.0; 3], [0.0; 3]);
        write_rigid_body_3d_world_center(&a, &mut center_a);
        write_rigid_body_3d_world_center(&b, &mut center_b);
        for source in manifold.points.iter().take(manifold.point_count) {
            let excess = source.depth - world.config.sequential_impulse.penetration_slop;
            deepest = deepest.max(excess);
            if excess <= 0.0 {
                continue;
            }
            let ra = [
                source.x - center_a[0],
                source.y - center_a[1],
                source.z - center_a[2],
            ];
            let rb = [
                source.x - center_b[0],
                source.y - center_b[1],
                source.z - center_b[2],
            ];
            let mass = get_effective_mass(
                &a,
                &b,
                ra[0],
                ra[1],
                ra[2],
                rb[0],
                rb[1],
                rb[2],
                manifold.normal_x,
                manifold.normal_y,
                manifold.normal_z,
            );
            let correction = world.config.sequential_impulse.position_correction * excess * mass;
            apply_position_correction(
                &mut a,
                &mut b,
                ra,
                rb,
                [
                    manifold.normal_x * correction,
                    manifold.normal_y * correction,
                    manifold.normal_z * correction,
                ],
            );
        }
    }
    return deepest;
}

pub fn solve_physics_3d_contact_velocities(world: &mut Physics3DWorld) {
    let (contacts, bodies, constraints) = (
        &world.contacts,
        &world.body_by_index,
        &mut world.solver.constraints,
    );
    for constraint in constraints {
        if constraint.contact < 0 {
            continue;
        }
        let contact = contacts[constraint.contact as usize].read().unwrap();
        let (Some(a_ref), Some(b_ref)) = (bodies.get(&contact.body_a), bodies.get(&contact.body_b))
        else {
            continue;
        };
        if Arc::ptr_eq(a_ref, b_ref) {
            continue;
        }
        let (mut a, mut b) = (a_ref.write().unwrap(), b_ref.write().unwrap());
        for i in 0..constraint.point_count {
            let source = &contact.points[i];
            let point = &mut constraint.points[i];
            let velocity = get_relative_velocity(
                &a,
                &b,
                source.r_ax,
                source.r_ay,
                source.r_az,
                source.r_bx,
                source.r_by,
                source.r_bz,
                contact.normal_x,
                contact.normal_y,
                contact.normal_z,
            );
            let impulse =
                (point.normal_impulse + (point.bias - velocity) * point.normal_mass).max(0.0);
            let delta = impulse - point.normal_impulse;
            point.normal_impulse = impulse;
            apply_contact_impulse(
                &mut a,
                &mut b,
                source.r_ax,
                source.r_ay,
                source.r_az,
                source.r_bx,
                source.r_by,
                source.r_bz,
                contact.normal_x * delta,
                contact.normal_y * delta,
                contact.normal_z * delta,
            );
            let max_friction = contact.friction * point.normal_impulse;
            let v0 = get_relative_velocity(
                &a,
                &b,
                source.r_ax,
                source.r_ay,
                source.r_az,
                source.r_bx,
                source.r_by,
                source.r_bz,
                constraint.tangent0_x,
                constraint.tangent0_y,
                constraint.tangent0_z,
            );
            let v1 = get_relative_velocity(
                &a,
                &b,
                source.r_ax,
                source.r_ay,
                source.r_az,
                source.r_bx,
                source.r_by,
                source.r_bz,
                constraint.tangent1_x,
                constraint.tangent1_y,
                constraint.tangent1_z,
            );
            let (mut i0, mut i1) = (
                point.tangent_impulse0 - v0 * point.tangent_mass0,
                point.tangent_impulse1 - v1 * point.tangent_mass1,
            );
            let magnitude = (i0 * i0 + i1 * i1).sqrt();
            if magnitude > max_friction {
                let scale = max_friction / magnitude;
                i0 *= scale;
                i1 *= scale;
            }
            let (d0, d1) = (i0 - point.tangent_impulse0, i1 - point.tangent_impulse1);
            point.tangent_impulse0 = i0;
            point.tangent_impulse1 = i1;
            apply_contact_impulse(
                &mut a,
                &mut b,
                source.r_ax,
                source.r_ay,
                source.r_az,
                source.r_bx,
                source.r_by,
                source.r_bz,
                constraint.tangent0_x * d0 + constraint.tangent1_x * d1,
                constraint.tangent0_y * d0 + constraint.tangent1_y * d1,
                constraint.tangent0_z * d0 + constraint.tangent1_z * d1,
            );
        }
    }
}

pub fn warm_start_physics_3d_contacts(world: &mut Physics3DWorld) {
    if !world.config.sequential_impulse.warm_starting {
        return;
    }
    let (constraints, contacts, bodies) = (
        &world.solver.constraints,
        &world.contacts,
        &world.body_by_index,
    );
    for constraint in constraints {
        if constraint.contact < 0 {
            continue;
        }
        let contact = contacts[constraint.contact as usize].read().unwrap();
        let (Some(a_ref), Some(b_ref)) = (bodies.get(&contact.body_a), bodies.get(&contact.body_b))
        else {
            continue;
        };
        if Arc::ptr_eq(a_ref, b_ref) {
            continue;
        }
        let (mut a, mut b) = (a_ref.write().unwrap(), b_ref.write().unwrap());
        for i in 0..constraint.point_count {
            let source = &contact.points[i];
            let point = &constraint.points[i];
            apply_contact_impulse(
                &mut a,
                &mut b,
                source.r_ax,
                source.r_ay,
                source.r_az,
                source.r_bx,
                source.r_by,
                source.r_bz,
                contact.normal_x * point.normal_impulse
                    + constraint.tangent0_x * point.tangent_impulse0
                    + constraint.tangent1_x * point.tangent_impulse1,
                contact.normal_y * point.normal_impulse
                    + constraint.tangent0_y * point.tangent_impulse0
                    + constraint.tangent1_y * point.tangent_impulse1,
                contact.normal_z * point.normal_impulse
                    + constraint.tangent0_z * point.tangent_impulse0
                    + constraint.tangent1_z * point.tangent_impulse1,
            );
        }
    }
}

fn world_inertia(body: &RigidBody3D) -> [f32; 6] {
    [
        body.inverse_inertia_world_xx,
        body.inverse_inertia_world_yy,
        body.inverse_inertia_world_zz,
        body.inverse_inertia_world_xy,
        body.inverse_inertia_world_xz,
        body.inverse_inertia_world_yz,
    ]
}

fn write_friction_basis(nx: f32, ny: f32, nz: f32, out: &mut Physics3DContactConstraint) {
    let (mut sx, mut sy, mut sz) = (0.0, 0.0, 0.0);
    if nx.abs() < AXIS_SELECTION_THRESHOLD {
        sx = 1.0
    } else if ny.abs() < AXIS_SELECTION_THRESHOLD {
        sy = 1.0
    } else {
        sz = 1.0
    }
    let (mut x, mut y, mut z) = (ny * sz - nz * sy, nz * sx - nx * sz, nx * sy - ny * sx);
    let length = (x * x + y * y + z * z).sqrt();
    if length > 0.0 {
        x /= length;
        y /= length;
        z /= length;
    }
    out.tangent0_x = x;
    out.tangent0_y = y;
    out.tangent0_z = z;
    out.tangent1_x = ny * z - nz * y;
    out.tangent1_y = nz * x - nx * z;
    out.tangent1_z = nx * y - ny * x;
}
