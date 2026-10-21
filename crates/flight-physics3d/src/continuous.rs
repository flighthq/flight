// flight-lint: allow-file(conform-params) D5/D9b: collision registry is explicit and native result writers keep output first
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};

use flight_collision::{
    CollisionContactManifold3D, CollisionRegistry3D, create_collision_contact_manifold3d,
    create_collision_time_of_impact3d,
};
use flight_entity::throw_error;
use flight_spatial::SpatialPair;

use crate::contacts::set_physics_3d_contact_pair;
use crate::*;

const APPROACH_EPSILON: f32 = 1e-9;
const CCD_ROTATION_BISECTION_ITERATIONS: usize = 12;
const CCD_ROTATION_INCREMENT: f32 = std::f32::consts::PI / 180.0;
const IMPACT_AXIS_SELECTION_THRESHOLD: f32 = 0.577_350_26;
const ROTATIONAL_IMPACT_ITERATIONS: usize = 4;

#[derive(Clone)]
struct ImpactPoint {
    x: f32,
    y: f32,
    z: f32,
    depth: f32,
    feature_id: i64,
}

#[derive(Clone)]
struct Impact {
    fraction: f32,
    body_a: i32,
    body_b: i32,
    collider_a: usize,
    collider_b: usize,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    friction: f32,
    restitution: f32,
    rotational: bool,
    points: Vec<ImpactPoint>,
}

#[derive(Clone)]
struct ImpactCandidate {
    fraction: f32,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
    rotational: bool,
    points: Vec<ImpactPoint>,
    center_a: [f32; 3],
    center_b: [f32; 3],
}

fn advance_awake_bodies(world: &mut Physics3DWorld, dt: f32) {
    for body in &world.bodies {
        let mut body = body.write().unwrap();
        if body.body_type == Physics3DBodyType::Static || body.sleeping {
            continue;
        }
        integrate_rigid_body_3d_pose(&mut body, dt);
        refresh_rigid_body_3d_world_inertia(&mut body);
    }
}

fn angular_mass_term(body: &RigidBody3D, r: [f32; 3], normal: [f32; 3]) -> f32 {
    let cross = [
        r[1] * normal[2] - r[2] * normal[1],
        r[2] * normal[0] - r[0] * normal[2],
        r[0] * normal[1] - r[1] * normal[0],
    ];
    let tensor = world_inverse_inertia(body);
    let mut transformed = [0.0; 3];
    apply_symmetric_tensor(&mut transformed, &tensor, cross[0], cross[1], cross[2]);
    cross[0] * transformed[0] + cross[1] * transformed[1] + cross[2] * transformed[2]
}

fn apply_impact_impulse(
    body: &mut RigidBody3D,
    r_x: f32,
    r_y: f32,
    r_z: f32,
    impulse_x: f32,
    impulse_y: f32,
    impulse_z: f32,
) {
    body.velocity_x += impulse_x * body.inverse_mass;
    body.velocity_y += impulse_y * body.inverse_mass;
    body.velocity_z += impulse_z * body.inverse_mass;
    let torque_x = r_y * impulse_z - r_z * impulse_y;
    let torque_y = r_z * impulse_x - r_x * impulse_z;
    let torque_z = r_x * impulse_y - r_y * impulse_x;
    let tensor = world_inverse_inertia(body);
    let mut angular = [0.0; 3];
    apply_symmetric_tensor(&mut angular, &tensor, torque_x, torque_y, torque_z);
    body.angular_velocity_x += angular[0];
    body.angular_velocity_y += angular[1];
    body.angular_velocity_z += angular[2];
}

fn body_moving(body: &RigidBody3D) -> bool {
    body.body_type != Physics3DBodyType::Static && !body.sleeping
}

fn ccd_pair_active(a: &RigidBody3D, b: &RigidBody3D) -> bool {
    let bullet_a = a.body_type == Physics3DBodyType::Dynamic && a.bullet && !a.sleeping;
    let bullet_b = b.body_type == Physics3DBodyType::Dynamic && b.bullet && !b.sleeping;
    (bullet_a || bullet_b) && (a.inverse_mass > 0.0 || b.inverse_mass > 0.0)
}

fn centers_at_fraction(
    body_a: &mut RigidBody3D,
    body_b: &mut RigidBody3D,
    dt: f32,
    fraction: f32,
) -> ([f32; 3], [f32; 3]) {
    let pose_a = save_pose(body_a);
    let pose_b = save_pose(body_b);
    integrate_rigid_body_3d_pose(body_a, dt * fraction);
    integrate_rigid_body_3d_pose(body_b, dt * fraction);
    let (mut center_a, mut center_b) = ([0.0; 3], [0.0; 3]);
    write_rigid_body_3d_world_center(body_a, &mut center_a);
    write_rigid_body_3d_world_center(body_b, &mut center_b);
    restore_pose(body_a, &pose_a);
    restore_pose(body_b, &pose_b);
    (center_a, center_b)
}

fn collider_pair_enabled(a: &Physics3DCollider, b: &Physics3DCollider) -> bool {
    if a.filter.group_index != 0 && a.filter.group_index == b.filter.group_index {
        return a.filter.group_index > 0;
    }
    (a.filter.mask_bits & b.filter.category_bits) != 0
        && (b.filter.mask_bits & a.filter.category_bits) != 0
}

fn effective_mass(
    a: &RigidBody3D,
    b: &RigidBody3D,
    r_a: [f32; 3],
    r_b: [f32; 3],
    normal: [f32; 3],
) -> f32 {
    let denominator = a.inverse_mass
        + b.inverse_mass
        + angular_mass_term(a, r_a, normal)
        + angular_mass_term(b, r_b, normal);
    if denominator > 0.0 {
        1.0 / denominator
    } else {
        0.0
    }
}

fn find_collider_impact(
    registry: &CollisionRegistry3D,
    body_a: &mut RigidBody3D,
    body_b: &mut RigidBody3D,
    collider_a: &mut Physics3DCollider,
    collider_b: &mut Physics3DCollider,
    dt: f32,
    max_rotation_substeps: usize,
    accept_non_approaching: bool,
) -> Option<ImpactCandidate> {
    let moving_a = body_moving(body_a);
    let moving_b = body_moving(body_b);
    let mut linear = create_collision_time_of_impact3d();
    let linear_hit = sweep_physics_3d_collider_shapes(
        &mut linear,
        registry,
        &collider_a.world,
        if moving_a {
            body_a.velocity_x * dt
        } else {
            0.0
        },
        if moving_a {
            body_a.velocity_y * dt
        } else {
            0.0
        },
        if moving_a {
            body_a.velocity_z * dt
        } else {
            0.0
        },
        &collider_b.world,
        if moving_b {
            body_b.velocity_x * dt
        } else {
            0.0
        },
        if moving_b {
            body_b.velocity_y * dt
        } else {
            0.0
        },
        if moving_b {
            body_b.velocity_z * dt
        } else {
            0.0
        },
        Some(1.0),
    ) && linear.fraction > 0.0;
    let angular_a = if moving_a {
        (body_a.angular_velocity_x * body_a.angular_velocity_x
            + body_a.angular_velocity_y * body_a.angular_velocity_y
            + body_a.angular_velocity_z * body_a.angular_velocity_z)
            .sqrt()
            * dt
    } else {
        0.0
    };
    let angular_b = if moving_b {
        (body_b.angular_velocity_x * body_b.angular_velocity_x
            + body_b.angular_velocity_y * body_b.angular_velocity_y
            + body_b.angular_velocity_z * body_b.angular_velocity_z)
            .sqrt()
            * dt
    } else {
        0.0
    };
    let rotational = if (angular_a > 0.0 || angular_b > 0.0) && max_rotation_substeps > 0 {
        find_rotational_impact(
            registry,
            body_a,
            body_b,
            collider_a,
            collider_b,
            dt,
            angular_a.max(angular_b),
            max_rotation_substeps,
        )
    } else {
        None
    };
    let linear_approaching = accept_non_approaching
        || relative_normal_velocity(
            body_a,
            body_b,
            linear.normal_x,
            linear.normal_y,
            linear.normal_z,
        ) < -APPROACH_EPSILON;
    let mut selected = if linear_hit && linear_approaching {
        let (center_a, center_b) = centers_at_fraction(body_a, body_b, dt, linear.fraction);
        Some(ImpactCandidate {
            fraction: linear.fraction,
            normal_x: linear.normal_x,
            normal_y: linear.normal_y,
            normal_z: linear.normal_z,
            rotational: false,
            points: vec![ImpactPoint {
                x: linear.x,
                y: linear.y,
                z: linear.z,
                depth: 0.0,
                feature_id: 0,
            }],
            center_a,
            center_b,
        })
    } else {
        None
    };
    if let Some(candidate) = rotational
        && selected
            .as_ref()
            .is_none_or(|linear| candidate.fraction < linear.fraction)
        && (accept_non_approaching || rotational_impact_approaching(body_a, body_b, &candidate))
    {
        selected = Some(candidate);
    }
    selected
}

fn find_earliest_impact(
    world: &mut Physics3DWorld,
    registry: &CollisionRegistry3D,
    dt: f32,
) -> Option<Impact> {
    synchronize_physics_3d_swept_broadphase(world, dt);
    let mut pairs = Vec::<SpatialPair>::new();
    (world.index.query_spatial_pairs)(&mut pairs);
    synchronize_physics_3d_broadphase(world);
    let mut earliest: Option<Impact> = None;
    let mut sensors = Vec::<Impact>::new();
    let max_rotation_substeps = world.config.max_ccd_rotation_substeps;
    for pair in pairs {
        let (Some(first), Some(second)) = (
            world.body_by_index.get(&pair.a).cloned(),
            world.body_by_index.get(&pair.b).cloned(),
        ) else {
            continue;
        };
        let ordered = first.read().unwrap().index <= second.read().unwrap().index;
        let (a_ref, b_ref) = if ordered {
            (first, second)
        } else {
            (second, first)
        };
        let (body_a_index, body_b_index, colliders_a, colliders_b) = {
            let a = a_ref.read().unwrap();
            let b = b_ref.read().unwrap();
            if !ccd_pair_active(&a, &b)
                || is_physics_3d_pair_joint_suppressed(world, a.index, b.index)
            {
                continue;
            }
            (a.index, b.index, a.colliders.clone(), b.colliders.clone())
        };
        for (collider_a_index, collider_a_ref) in colliders_a.iter().enumerate() {
            for (collider_b_index, collider_b_ref) in colliders_b.iter().enumerate() {
                let mut a = a_ref.write().unwrap();
                let mut b = b_ref.write().unwrap();
                let mut collider_a = collider_a_ref.write().unwrap();
                let mut collider_b = collider_b_ref.write().unwrap();
                if !collider_pair_enabled(&collider_a, &collider_b) {
                    continue;
                }
                let sensor = collider_a.sensor || collider_b.sensor;
                let Some(candidate) = find_collider_impact(
                    registry,
                    &mut a,
                    &mut b,
                    &mut collider_a,
                    &mut collider_b,
                    dt,
                    max_rotation_substeps,
                    sensor,
                ) else {
                    continue;
                };
                let impact = Impact {
                    fraction: candidate.fraction,
                    body_a: body_a_index,
                    body_b: body_b_index,
                    collider_a: collider_a_index,
                    collider_b: collider_b_index,
                    normal_x: candidate.normal_x,
                    normal_y: candidate.normal_y,
                    normal_z: candidate.normal_z,
                    friction: mix_physics_3d_friction(
                        collider_a.material.friction,
                        collider_b.material.friction,
                    ),
                    restitution: mix_physics_3d_restitution(
                        collider_a.material.restitution,
                        collider_b.material.restitution,
                    ),
                    rotational: candidate.rotational,
                    points: candidate.points,
                };
                if sensor {
                    sensors.push(impact);
                } else if earliest
                    .as_ref()
                    .is_none_or(|current| impact.fraction < current.fraction)
                {
                    earliest = Some(impact);
                }
            }
        }
    }
    let boundary = earliest
        .as_ref()
        .map_or(f32::INFINITY, |impact| impact.fraction);
    sensors.sort_by(|a, b| {
        a.fraction
            .total_cmp(&b.fraction)
            .then(a.body_a.cmp(&b.body_a))
            .then(a.body_b.cmp(&b.body_b))
            .then(a.collider_a.cmp(&b.collider_a))
            .then(a.collider_b.cmp(&b.collider_b))
    });
    for sensor in sensors {
        if sensor.fraction <= boundary && !has_contact_transition(world, &sensor) {
            report_sensor_impact(world, sensor, dt);
        }
    }
    earliest
}

fn find_rotational_impact(
    registry: &CollisionRegistry3D,
    body_a: &mut RigidBody3D,
    body_b: &mut RigidBody3D,
    collider_a: &mut Physics3DCollider,
    collider_b: &mut Physics3DCollider,
    dt: f32,
    angular_travel: f32,
    max_substeps: usize,
) -> Option<ImpactCandidate> {
    if overlap_at_fraction(registry, body_a, body_b, collider_a, collider_b, dt, 0.0).is_some() {
        return None;
    }
    let substeps = rotation_sample_count(angular_travel, max_substeps);
    let mut lower_fraction = 0.0;
    for sample in 1..=substeps {
        let upper_fraction = sample as f32 / substeps as f32;
        if overlap_at_fraction(
            registry,
            body_a,
            body_b,
            collider_a,
            collider_b,
            dt,
            upper_fraction,
        )
        .is_none()
        {
            lower_fraction = upper_fraction;
            continue;
        }
        let (mut lower, mut upper) = (lower_fraction, upper_fraction);
        for _ in 0..CCD_ROTATION_BISECTION_ITERATIONS {
            let middle = (lower + upper) * 0.5;
            if overlap_at_fraction(registry, body_a, body_b, collider_a, collider_b, dt, middle)
                .is_some()
            {
                upper = middle;
            } else {
                lower = middle;
            }
        }
        let (manifold, center_a, center_b) =
            overlap_at_fraction(registry, body_a, body_b, collider_a, collider_b, dt, upper)?;
        if manifold.point_count == 0 {
            return None;
        }
        let points = manifold.points[..manifold.point_count]
            .iter()
            .map(|point| ImpactPoint {
                x: point.x,
                y: point.y,
                z: point.z,
                depth: point.depth,
                feature_id: point.feature_id,
            })
            .collect();
        return Some(ImpactCandidate {
            fraction: upper,
            normal_x: manifold.normal_x,
            normal_y: manifold.normal_y,
            normal_z: manifold.normal_z,
            rotational: true,
            points,
            center_a,
            center_b,
        });
    }
    None
}

fn friction_basis(normal: [f32; 3]) -> ([f32; 3], [f32; 3]) {
    let seed = if normal[0].abs() < IMPACT_AXIS_SELECTION_THRESHOLD {
        [1.0, 0.0, 0.0]
    } else if normal[1].abs() < IMPACT_AXIS_SELECTION_THRESHOLD {
        [0.0, 1.0, 0.0]
    } else {
        [0.0, 0.0, 1.0]
    };
    let mut tangent0 = [
        normal[1] * seed[2] - normal[2] * seed[1],
        normal[2] * seed[0] - normal[0] * seed[2],
        normal[0] * seed[1] - normal[1] * seed[0],
    ];
    let length =
        (tangent0[0] * tangent0[0] + tangent0[1] * tangent0[1] + tangent0[2] * tangent0[2]).sqrt();
    if length > 0.0 {
        tangent0[0] /= length;
        tangent0[1] /= length;
        tangent0[2] /= length;
    }
    let tangent1 = [
        normal[1] * tangent0[2] - normal[2] * tangent0[1],
        normal[2] * tangent0[0] - normal[0] * tangent0[2],
        normal[0] * tangent0[1] - normal[1] * tangent0[0],
    ];
    (tangent0, tangent1)
}

pub fn has_active_physics_3d_bullet(world: &Physics3DWorld) -> bool {
    world.bodies.iter().any(|body| {
        let body = body.read().unwrap();
        body.body_type == Physics3DBodyType::Dynamic && body.bullet && !body.sleeping
    })
}

fn has_contact_transition(world: &Physics3DWorld, impact: &Impact) -> bool {
    world.events.began.iter().any(|contact| {
        let contact = contact.read().unwrap();
        contact.body_a == impact.body_a
            && contact.body_b == impact.body_b
            && contact.collider_a == impact.collider_a
            && contact.collider_b == impact.collider_b
    })
}

pub fn integrate_physics_3d_continuous(
    world: &mut Physics3DWorld,
    registry: &CollisionRegistry3D,
    dt: f32,
) {
    if world.continuous_integrating {
        throw_error("Cannot integrate a physics world recursively while it is stepping");
    }
    let owns_mutation_boundary = !world.stepping;
    world.continuous_integrating = true;
    if owns_mutation_boundary {
        mark_physics_3d_world_stepping(world, true);
    }
    let result = catch_unwind(AssertUnwindSafe(|| {
        let mut remaining = dt;
        for _ in 0..world.config.max_ccd_substeps {
            if remaining <= 0.0 {
                return;
            }
            let Some(impact) = find_earliest_impact(world, registry, remaining) else {
                break;
            };
            let advance = remaining * impact.fraction;
            advance_awake_bodies(world, advance);
            remaining -= advance;
            synchronize_physics_3d_broadphase(world);
            resolve_impact(world, impact);
            if advance == 0.0 || remaining <= 0.0 {
                return;
            }
        }
        if remaining > 0.0 {
            advance_awake_bodies(world, remaining);
        }
    }));
    world.continuous_integrating = false;
    if owns_mutation_boundary {
        mark_physics_3d_world_stepping(world, false);
    }
    if let Err(payload) = result {
        resume_unwind(payload);
    }
}

fn overlap_at_fraction(
    registry: &CollisionRegistry3D,
    body_a: &mut RigidBody3D,
    body_b: &mut RigidBody3D,
    collider_a: &mut Physics3DCollider,
    collider_b: &mut Physics3DCollider,
    dt: f32,
    fraction: f32,
) -> Option<(CollisionContactManifold3D, [f32; 3], [f32; 3])> {
    let pose_a = save_pose(body_a);
    let pose_b = save_pose(body_b);
    integrate_rigid_body_3d_pose(body_a, dt * fraction);
    integrate_rigid_body_3d_pose(body_b, dt * fraction);
    update_physics_3d_collider_world_shape(collider_a, body_a);
    update_physics_3d_collider_world_shape(collider_b, body_b);
    let mut manifold = create_collision_contact_manifold3d();
    let overlapping = collide_physics_3d_collider_shapes(
        &mut manifold,
        registry,
        &collider_a.world,
        &collider_b.world,
    );
    let (mut center_a, mut center_b) = ([0.0; 3], [0.0; 3]);
    if overlapping {
        write_rigid_body_3d_world_center(body_a, &mut center_a);
        write_rigid_body_3d_world_center(body_b, &mut center_b);
    }
    restore_pose(body_a, &pose_a);
    restore_pose(body_b, &pose_b);
    update_physics_3d_collider_world_shape(collider_a, body_a);
    update_physics_3d_collider_world_shape(collider_b, body_b);
    if overlapping {
        Some((manifold, center_a, center_b))
    } else {
        None
    }
}

fn point_normal_velocity(
    a: &RigidBody3D,
    b: &RigidBody3D,
    r_a: [f32; 3],
    r_b: [f32; 3],
    normal: [f32; 3],
) -> f32 {
    let point_a = [
        a.velocity_x + a.angular_velocity_y * r_a[2] - a.angular_velocity_z * r_a[1],
        a.velocity_y + a.angular_velocity_z * r_a[0] - a.angular_velocity_x * r_a[2],
        a.velocity_z + a.angular_velocity_x * r_a[1] - a.angular_velocity_y * r_a[0],
    ];
    let point_b = [
        b.velocity_x + b.angular_velocity_y * r_b[2] - b.angular_velocity_z * r_b[1],
        b.velocity_y + b.angular_velocity_z * r_b[0] - b.angular_velocity_x * r_b[2],
        b.velocity_z + b.angular_velocity_x * r_b[1] - b.angular_velocity_y * r_b[0],
    ];
    (point_a[0] - point_b[0]) * normal[0]
        + (point_a[1] - point_b[1]) * normal[1]
        + (point_a[2] - point_b[2]) * normal[2]
}

fn relative_normal_velocity(
    a: &RigidBody3D,
    b: &RigidBody3D,
    normal_x: f32,
    normal_y: f32,
    normal_z: f32,
) -> f32 {
    (a.velocity_x - b.velocity_x) * normal_x
        + (a.velocity_y - b.velocity_y) * normal_y
        + (a.velocity_z - b.velocity_z) * normal_z
}

fn report_sensor_impact(world: &mut Physics3DWorld, impact: Impact, dt: f32) {
    let (Some(a_ref), Some(b_ref)) = (
        world.body_by_index.get(&impact.body_a).cloned(),
        world.body_by_index.get(&impact.body_b).cloned(),
    ) else {
        return;
    };
    let (center_a, center_b) = {
        let mut a = a_ref.write().unwrap();
        let mut b = b_ref.write().unwrap();
        centers_at_fraction(&mut a, &mut b, dt, impact.fraction)
    };
    let contact = create_physics_3d_contact();
    {
        let mut contact = contact.write().unwrap();
        set_physics_3d_contact_pair(
            &mut contact,
            impact.body_a,
            impact.body_b,
            impact.collider_a,
            impact.collider_b,
        );
        contact.normal_x = impact.normal_x;
        contact.normal_y = impact.normal_y;
        contact.normal_z = impact.normal_z;
        contact.point_count = impact.points.len();
        contact.friction = impact.friction;
        contact.restitution = impact.restitution;
        contact.sensor = true;
        contact.touching = true;
        for source in &impact.points {
            let mut point = create_physics_3d_contact_point();
            point.x = source.x;
            point.y = source.y;
            point.z = source.z;
            point.depth = source.depth;
            point.feature_id = source.feature_id;
            point.r_ax = point.x - center_a[0];
            point.r_ay = point.y - center_a[1];
            point.r_az = point.z - center_a[2];
            point.r_bx = point.x - center_b[0];
            point.r_by = point.y - center_b[1];
            point.r_bz = point.z - center_b[2];
            contact.points.push(point);
        }
    }
    world.contacts.push(contact.clone());
    world.events.began.push(contact);
}

fn resolve_impact(world: &mut Physics3DWorld, impact: Impact) {
    let (Some(a_ref), Some(b_ref)) = (
        world.body_by_index.get(&impact.body_a).cloned(),
        world.body_by_index.get(&impact.body_b).cloned(),
    ) else {
        return;
    };
    wake_impact_body(&a_ref);
    wake_impact_body(&b_ref);
    let (contact, created) = write_impact_contact(world, &a_ref, &b_ref, &impact);
    if created {
        run_impact_pre_solve_hook(world, &contact);
    }
    let (enabled, sensor, friction, restitution) = {
        let contact = contact.read().unwrap();
        (
            contact.enabled,
            contact.sensor,
            contact.friction,
            contact.restitution,
        )
    };
    if !enabled || sensor {
        return;
    }
    let (mut a, mut b) = (a_ref.write().unwrap(), b_ref.write().unwrap());
    if impact.rotational && !impact.points.is_empty() {
        resolve_rotational_impact(world, &mut a, &mut b, &impact, friction, restitution);
        return;
    }
    let approach =
        relative_normal_velocity(&a, &b, impact.normal_x, impact.normal_y, impact.normal_z);
    let inverse_mass = a.inverse_mass + b.inverse_mass;
    if approach >= 0.0 || inverse_mass <= 0.0 {
        return;
    }
    let restitution = if approach < -world.config.sequential_impulse.restitution_threshold {
        restitution
    } else {
        0.0
    };
    let magnitude = -(1.0 + restitution) * approach / inverse_mass;
    let (inverse_mass_a, inverse_mass_b) = (a.inverse_mass, b.inverse_mass);
    a.velocity_x += impact.normal_x * magnitude * inverse_mass_a;
    a.velocity_y += impact.normal_y * magnitude * inverse_mass_a;
    a.velocity_z += impact.normal_z * magnitude * inverse_mass_a;
    b.velocity_x -= impact.normal_x * magnitude * inverse_mass_b;
    b.velocity_y -= impact.normal_y * magnitude * inverse_mass_b;
    b.velocity_z -= impact.normal_z * magnitude * inverse_mass_b;
    let relative = [
        a.velocity_x - b.velocity_x,
        a.velocity_y - b.velocity_y,
        a.velocity_z - b.velocity_z,
    ];
    let normal_velocity = relative[0] * impact.normal_x
        + relative[1] * impact.normal_y
        + relative[2] * impact.normal_z;
    let tangent = [
        relative[0] - impact.normal_x * normal_velocity,
        relative[1] - impact.normal_y * normal_velocity,
        relative[2] - impact.normal_z * normal_velocity,
    ];
    let tangent_speed =
        (tangent[0] * tangent[0] + tangent[1] * tangent[1] + tangent[2] * tangent[2]).sqrt();
    if tangent_speed <= 0.0 || friction <= 0.0 {
        return;
    }
    let friction_magnitude = (tangent_speed / inverse_mass).min(friction * magnitude);
    let scale = -friction_magnitude / tangent_speed;
    let impulse = [tangent[0] * scale, tangent[1] * scale, tangent[2] * scale];
    a.velocity_x += impulse[0] * inverse_mass_a;
    a.velocity_y += impulse[1] * inverse_mass_a;
    a.velocity_z += impulse[2] * inverse_mass_a;
    b.velocity_x -= impulse[0] * inverse_mass_b;
    b.velocity_y -= impulse[1] * inverse_mass_b;
    b.velocity_z -= impulse[2] * inverse_mass_b;
}

fn resolve_rotational_impact(
    world: &Physics3DWorld,
    a: &mut RigidBody3D,
    b: &mut RigidBody3D,
    impact: &Impact,
    friction: f32,
    restitution: f32,
) {
    let (mut center_a, mut center_b) = ([0.0; 3], [0.0; 3]);
    write_rigid_body_3d_world_center(a, &mut center_a);
    write_rigid_body_3d_world_center(b, &mut center_b);
    let normal = [impact.normal_x, impact.normal_y, impact.normal_z];
    let (tangent0, tangent1) = friction_basis(normal);
    let count = impact.points.len();
    let mut normal_impulses = vec![0.0; count];
    let mut tangent_impulses0 = vec![0.0; count];
    let mut tangent_impulses1 = vec![0.0; count];
    let mut velocity_biases = vec![0.0; count];
    for (index, point) in impact.points.iter().enumerate() {
        let r_a = [
            point.x - center_a[0],
            point.y - center_a[1],
            point.z - center_a[2],
        ];
        let r_b = [
            point.x - center_b[0],
            point.y - center_b[1],
            point.z - center_b[2],
        ];
        let approach = point_normal_velocity(a, b, r_a, r_b, normal);
        velocity_biases[index] =
            if approach < -world.config.sequential_impulse.restitution_threshold {
                -restitution * approach
            } else {
                0.0
            };
    }
    for _ in 0..ROTATIONAL_IMPACT_ITERATIONS {
        for (index, point) in impact.points.iter().enumerate() {
            let r_a = [
                point.x - center_a[0],
                point.y - center_a[1],
                point.z - center_a[2],
            ];
            let r_b = [
                point.x - center_b[0],
                point.y - center_b[1],
                point.z - center_b[2],
            ];
            let velocity = point_normal_velocity(a, b, r_a, r_b, normal);
            let mass = effective_mass(a, b, r_a, r_b, normal);
            let impulse =
                (normal_impulses[index] + (velocity_biases[index] - velocity) * mass).max(0.0);
            let delta = impulse - normal_impulses[index];
            normal_impulses[index] = impulse;
            apply_impact_impulse(
                a,
                r_a[0],
                r_a[1],
                r_a[2],
                normal[0] * delta,
                normal[1] * delta,
                normal[2] * delta,
            );
            apply_impact_impulse(
                b,
                r_b[0],
                r_b[1],
                r_b[2],
                -normal[0] * delta,
                -normal[1] * delta,
                -normal[2] * delta,
            );
            let max_friction = friction * impulse;
            let velocity0 = point_normal_velocity(a, b, r_a, r_b, tangent0);
            let velocity1 = point_normal_velocity(a, b, r_a, r_b, tangent1);
            let mut impulse0 =
                tangent_impulses0[index] - velocity0 * effective_mass(a, b, r_a, r_b, tangent0);
            let mut impulse1 =
                tangent_impulses1[index] - velocity1 * effective_mass(a, b, r_a, r_b, tangent1);
            let magnitude = (impulse0 * impulse0 + impulse1 * impulse1).sqrt();
            if magnitude > max_friction {
                let scale = max_friction / magnitude;
                impulse0 *= scale;
                impulse1 *= scale;
            }
            let delta0 = impulse0 - tangent_impulses0[index];
            let delta1 = impulse1 - tangent_impulses1[index];
            tangent_impulses0[index] = impulse0;
            tangent_impulses1[index] = impulse1;
            let impulse = [
                tangent0[0] * delta0 + tangent1[0] * delta1,
                tangent0[1] * delta0 + tangent1[1] * delta1,
                tangent0[2] * delta0 + tangent1[2] * delta1,
            ];
            apply_impact_impulse(
                a, r_a[0], r_a[1], r_a[2], impulse[0], impulse[1], impulse[2],
            );
            apply_impact_impulse(
                b,
                r_b[0],
                r_b[1],
                r_b[2],
                -impulse[0],
                -impulse[1],
                -impulse[2],
            );
        }
    }
}

fn restore_pose(body: &mut RigidBody3D, pose: &[f32; 7]) {
    body.x = pose[0];
    body.y = pose[1];
    body.z = pose[2];
    body.orientation_x = pose[3];
    body.orientation_y = pose[4];
    body.orientation_z = pose[5];
    body.orientation_w = pose[6];
}

fn rotation_sample_count(angular_travel: f32, max_substeps: usize) -> usize {
    if angular_travel <= 0.0 || max_substeps == 0 {
        0
    } else {
        max_substeps.min((angular_travel / CCD_ROTATION_INCREMENT).ceil().max(1.0) as usize)
    }
}

fn rotational_impact_approaching(
    a: &RigidBody3D,
    b: &RigidBody3D,
    candidate: &ImpactCandidate,
) -> bool {
    let normal = [candidate.normal_x, candidate.normal_y, candidate.normal_z];
    candidate.points.iter().any(|point| {
        point_normal_velocity(
            a,
            b,
            [
                point.x - candidate.center_a[0],
                point.y - candidate.center_a[1],
                point.z - candidate.center_a[2],
            ],
            [
                point.x - candidate.center_b[0],
                point.y - candidate.center_b[1],
                point.z - candidate.center_b[2],
            ],
            normal,
        ) < -APPROACH_EPSILON
    })
}

fn run_impact_pre_solve_hook(world: &mut Physics3DWorld, contact: &Physics3DContactRef) {
    let Some(hook) = world.contact_hooks.pre_solve.clone() else {
        return;
    };
    let original = {
        let contact = contact.read().unwrap();
        (
            contact.friction,
            contact.restitution,
            contact.enabled,
            contact.sensor,
        )
    };
    let result = catch_unwind(AssertUnwindSafe(|| hook(world, contact)));
    let valid = is_physics_3d_contact_valid(&contact.read().unwrap());
    if result.is_err() || !valid {
        let mut contact = contact.write().unwrap();
        contact.friction = original.0;
        contact.restitution = original.1;
        contact.enabled = original.2;
        contact.sensor = original.3;
        drop(contact);
        if let Err(payload) = result {
            resume_unwind(payload);
        }
        throw_error("Physics3D pre-solve hook produced invalid contact state");
    }
}

fn save_pose(body: &RigidBody3D) -> [f32; 7] {
    [
        body.x,
        body.y,
        body.z,
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
    ]
}

fn wake_impact_body(body: &RigidBody3DRef) {
    let mut body = body.write().unwrap();
    if body.body_type != Physics3DBodyType::Static {
        body.sleeping = false;
        body.sleep_timer = 0.0;
    }
}

fn world_inverse_inertia(body: &RigidBody3D) -> [f32; 6] {
    [
        body.inverse_inertia_world_xx,
        body.inverse_inertia_world_yy,
        body.inverse_inertia_world_zz,
        body.inverse_inertia_world_xy,
        body.inverse_inertia_world_xz,
        body.inverse_inertia_world_yz,
    ]
}

fn write_impact_contact(
    world: &mut Physics3DWorld,
    a: &RigidBody3DRef,
    b: &RigidBody3DRef,
    impact: &Impact,
) -> (Physics3DContactRef, bool) {
    let existing = world.contacts.iter().find(|contact| {
        let contact = contact.read().unwrap();
        contact.body_a == impact.body_a
            && contact.body_b == impact.body_b
            && contact.collider_a == impact.collider_a
            && contact.collider_b == impact.collider_b
    });
    let created = existing.is_none();
    let contact = existing.cloned().unwrap_or_else(|| {
        let contact = create_physics_3d_contact();
        set_physics_3d_contact_pair(
            &mut contact.write().unwrap(),
            impact.body_a,
            impact.body_b,
            impact.collider_a,
            impact.collider_b,
        );
        contact
    });
    let (mut center_a, mut center_b) = ([0.0; 3], [0.0; 3]);
    write_rigid_body_3d_world_center(&a.read().unwrap(), &mut center_a);
    write_rigid_body_3d_world_center(&b.read().unwrap(), &mut center_b);
    {
        let mut value = contact.write().unwrap();
        if created {
            value.friction = impact.friction;
            value.restitution = impact.restitution;
        }
        value.normal_x = impact.normal_x;
        value.normal_y = impact.normal_y;
        value.normal_z = impact.normal_z;
        value.touching = true;
        while value.points.len() < impact.points.len() {
            value.points.push(create_physics_3d_contact_point());
        }
        value.point_count = impact.points.len();
        for (point, source) in value.points.iter_mut().zip(&impact.points) {
            point.x = source.x;
            point.y = source.y;
            point.z = source.z;
            point.depth = source.depth;
            point.feature_id = source.feature_id;
            point.r_ax = point.x - center_a[0];
            point.r_ay = point.y - center_a[1];
            point.r_az = point.z - center_a[2];
            point.r_bx = point.x - center_b[0];
            point.r_by = point.y - center_b[1];
            point.r_bz = point.z - center_b[2];
        }
    }
    if created {
        world.contacts.push(contact.clone());
        world.events.began.push(contact.clone());
    }
    (contact, created)
}

pub fn write_physics_3d_rotational_ccd_envelope(
    out: &mut Physics3DRotationalCcdEnvelope,
    angular_speed: f32,
    maximum_radius: f32,
    dt: f32,
    max_substeps: usize,
) -> bool {
    if !angular_speed.is_finite()
        || angular_speed < 0.0
        || !maximum_radius.is_finite()
        || maximum_radius < 0.0
        || !dt.is_finite()
        || dt < 0.0
    {
        *out = Physics3DRotationalCcdEnvelope::default();
        return false;
    }
    let angular_travel = angular_speed * dt;
    if !angular_travel.is_finite() {
        *out = Physics3DRotationalCcdEnvelope::default();
        return false;
    }
    let sample_count = rotation_sample_count(angular_travel, max_substeps);
    let max_angular_increment = if angular_travel == 0.0 {
        0.0
    } else if sample_count == 0 {
        f32::INFINITY
    } else {
        angular_travel / sample_count as f32
    };
    out.angular_travel = angular_travel;
    out.sample_count = sample_count;
    out.max_angular_increment = max_angular_increment;
    out.max_point_arc_travel = if maximum_radius == 0.0 {
        0.0
    } else {
        maximum_radius * max_angular_increment
    };
    out.target_increment_met =
        angular_travel == 0.0 || max_angular_increment <= CCD_ROTATION_INCREMENT;
    true
}
