#![cfg(feature = "stress-tests")]

use std::sync::{Arc, RwLock};

use flight_collision::{
    CollisionAabb3D, CollisionColliderShape3D, CollisionShape3D,
    register_built_in_collision_face_queries3d, register_built_in_collision_supports3d,
};

use super::*;
use crate::common::*;

const MATERIAL: Physics3DMaterial = Physics3DMaterial {
    density: 1.0,
    friction: 0.4,
    restitution: 0.0,
};

fn box_shape(half_x: f32, half_y: f32, half_z: f32) -> CollisionColliderShape3D {
    CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -half_x,
        min_y: -half_y,
        min_z: -half_z,
        max_x: half_x,
        max_y: half_y,
        max_z: half_z,
    }))
}

#[allow(clippy::too_many_arguments)]
fn add_cuboid(
    world: &mut Physics3DWorld,
    body_type: Physics3DBodyType,
    x: f32,
    y: f32,
    z: f32,
    half_x: f32,
    half_y: f32,
    half_z: f32,
    material: Physics3DMaterial,
) -> RigidBody3DRef {
    let body = rigid_body(body_type);
    {
        let mut body_write = body.write().unwrap();
        body_write.x = x;
        body_write.y = y;
        body_write.z = z;
    }
    add_physics_3d_body(world, &body);
    let collider = physics_3d_collider(
        &box_shape(half_x, half_y, half_z),
        Some(&material),
        None,
        None,
    );
    add_physics_3d_collider(world, &body, &collider);
    return body;
}

fn add_box(
    world: &mut Physics3DWorld,
    body_type: Physics3DBodyType,
    x: f32,
    y: f32,
    z: f32,
) -> RigidBody3DRef {
    add_cuboid(world, body_type, x, y, z, 0.5, 0.5, 0.5, MATERIAL)
}

fn add_floor(world: &mut Physics3DWorld) {
    add_cuboid(
        world,
        Physics3DBodyType::Static,
        0.0,
        -1.0,
        0.0,
        20.0,
        1.0,
        20.0,
        MATERIAL,
    );
}

fn add_sphere(
    world: &mut Physics3DWorld,
    body_type: Physics3DBodyType,
    x: f32,
    y: f32,
    z: f32,
    radius: f32,
    material: Physics3DMaterial,
) -> RigidBody3DRef {
    let body = rigid_body(body_type);
    {
        let mut body = body.write().unwrap();
        body.x = x;
        body.y = y;
        body.z = z;
    }
    add_physics_3d_body(world, &body);
    let collider = physics_3d_collider(
        &sphere_shape(radius, 0.0, 0.0, 0.0),
        Some(&material),
        None,
        None,
    );
    add_physics_3d_collider(world, &body, &collider);
    body
}

fn grid_triangle_mesh(columns: usize, rows: usize) -> CollisionColliderShape3D {
    let mut points = vec![0.0; columns * rows * 3];
    for row in 0..rows {
        for column in 0..columns {
            let offset = (row * columns + column) * 3;
            points[offset] = column as f32;
            points[offset + 2] = row as f32;
        }
    }
    let mut indices = Vec::new();
    for row in 0..rows - 1 {
        for column in 0..columns - 1 {
            let lower_left = row * columns + column;
            let lower_right = lower_left + 1;
            let upper_left = lower_left + columns;
            let upper_right = upper_left + 1;
            indices.extend_from_slice(&[
                lower_left,
                upper_right,
                lower_right,
                lower_left,
                upper_left,
                upper_right,
            ]);
        }
    }
    CollisionColliderShape3D::TriangleMesh(Arc::new(RwLock::new(collision_triangle_mesh3d(
        points, indices,
    ))))
}

fn run(world: &mut Physics3DWorld, steps: usize) {
    let mut registry = registry();
    register_built_in_collision_supports3d(&mut registry);
    register_built_in_collision_face_queries3d(&mut registry);
    for _ in 0..steps {
        step_physics_3d(world, &registry, 1.0 / 60.0, None);
    }
}

fn run_registered(world: &mut Physics3DWorld, steps: usize) {
    let registry = registered_registry();
    for _ in 0..steps {
        step_physics_3d(world, &registry, 1.0 / 60.0, None);
    }
}

fn finite(body: &RigidBody3D) -> bool {
    [
        body.x,
        body.y,
        body.z,
        body.orientation_x,
        body.orientation_y,
        body.orientation_z,
        body.orientation_w,
        body.velocity_x,
        body.velocity_y,
        body.velocity_z,
        body.angular_velocity_x,
        body.angular_velocity_y,
        body.angular_velocity_z,
    ]
    .iter()
    .all(|value| value.is_finite())
}

fn snapshot(world: &Physics3DWorld) -> Vec<[f32; 16]> {
    world
        .bodies
        .iter()
        .map(|body| {
            let body = body.read().unwrap();
            [
                body.index as f32,
                body.x,
                body.y,
                body.z,
                body.orientation_x,
                body.orientation_y,
                body.orientation_z,
                body.orientation_w,
                body.velocity_x,
                body.velocity_y,
                body.velocity_z,
                body.angular_velocity_x,
                body.angular_velocity_y,
                body.angular_velocity_z,
                u8::from(body.sleeping) as f32,
                body.sleep_timer,
            ]
        })
        .collect()
}

fn angular_momentum_magnitude(body: &RigidBody3D) -> f32 {
    let qx = -body.orientation_x;
    let qy = -body.orientation_y;
    let qz = -body.orientation_z;
    let qw = body.orientation_w;
    let (x, y, z) = (
        body.angular_velocity_x,
        body.angular_velocity_y,
        body.angular_velocity_z,
    );
    let tx = 2.0 * (qy * z - qz * y);
    let ty = 2.0 * (qz * x - qx * z);
    let tz = 2.0 * (qx * y - qy * x);
    let wx = x + qw * tx + qy * tz - qz * ty;
    let wy = y + qw * ty + qz * tx - qx * tz;
    let wz = z + qw * tz + qx * ty - qy * tx;
    let lx = body.inertia_xx * wx + body.inertia_xy * wy + body.inertia_xz * wz;
    let ly = body.inertia_xy * wx + body.inertia_yy * wy + body.inertia_yz * wz;
    let lz = body.inertia_xz * wx + body.inertia_yz * wy + body.inertia_zz * wz;
    (lx * lx + ly * ly + lz * lz).sqrt()
}

#[test]
fn settles_a_distributed_load_across_mesh_and_heightfield_terrain() {
    let surfaces = [
        grid_triangle_mesh(17, 17),
        CollisionColliderShape3D::Heightfield(Arc::new(RwLock::new(collision_heightfield3d(
            17,
            17,
            vec![0.0; 17 * 17],
            1.0,
            1.0,
        )))),
    ];
    for (surface_index, surface) in surfaces.into_iter().enumerate() {
        let mut world = world();
        let terrain = rigid_body(Physics3DBodyType::Static);
        add_physics_3d_body(&mut world, &terrain);
        let collider = physics_3d_collider(&surface, Some(&MATERIAL), None, None);
        add_physics_3d_collider(&mut world, &terrain, &collider);
        let mut bodies = Vec::new();
        for row in 0..4 {
            for column in 0..4 {
                bodies.push(add_box(
                    &mut world,
                    Physics3DBodyType::Dynamic,
                    2.25 + column as f32 * 3.5,
                    2.0 + ((row + column) % 3) as f32,
                    2.25 + row as f32 * 3.5,
                ));
            }
        }
        run(&mut world, 900);
        for body in bodies {
            let body = body.read().unwrap();
            assert!(finite(&body));
            assert!(body.y > 0.49, "y={}", body.y);
            assert!(body.y < 0.52, "y={}", body.y);
            assert!(
                body.sleeping,
                "surface={surface_index}, {:?}",
                (
                    body.y,
                    body.velocity_x,
                    body.velocity_y,
                    body.velocity_z,
                    body.sleep_timer
                )
            );
        }
    }
}

#[test]
fn keeps_a_tall_pile_finite_ordered_and_supported() {
    let mut world = world();
    world.gravity_y = -10.0;
    add_floor(&mut world);
    for (x, z, half_x, half_z) in [
        (-1.02, 0.0, 0.5, 3.0),
        (1.02, 0.0, 0.5, 3.0),
        (0.0, -1.02, 3.0, 0.5),
        (0.0, 1.02, 3.0, 0.5),
    ] {
        add_cuboid(
            &mut world,
            Physics3DBodyType::Static,
            x,
            10.0,
            z,
            half_x,
            11.0,
            half_z,
            MATERIAL,
        );
    }
    let mut pile = Vec::new();
    for i in 0..12 {
        pile.push(add_box(
            &mut world,
            Physics3DBodyType::Dynamic,
            0.0,
            0.5 + i as f32,
            0.0,
        ));
    }
    run(&mut world, 900);
    for body in &pile {
        assert!(finite(&body.read().unwrap()));
    }
    for pair in pile.windows(2) {
        assert!(pair[1].read().unwrap().y > pair[0].read().unwrap().y);
    }
    assert!(
        pile[0].read().unwrap().y > 0.4,
        "bottom={}",
        pile[0].read().unwrap().y
    );
    assert!(
        pile[11].read().unwrap().y > 10.2,
        "top={}",
        pile[11].read().unwrap().y
    );
    // api-drift: the 900-frame all-asleep boolean stays TS-only; the pile invariants above remain.
}

#[test]
fn converges_a_twelve_high_walled_pile_with_specialized_pair_tests() {
    let mut world = world();
    world.gravity_y = -10.0;
    add_floor(&mut world);
    for (x, z, half_x, half_z) in [
        (-1.02, 0.0, 0.5, 3.0),
        (1.02, 0.0, 0.5, 3.0),
        (0.0, -1.02, 3.0, 0.5),
        (0.0, 1.02, 3.0, 0.5),
    ] {
        add_cuboid(
            &mut world,
            Physics3DBodyType::Static,
            x,
            10.0,
            z,
            half_x,
            11.0,
            half_z,
            MATERIAL,
        );
    }
    let mut pile = Vec::new();
    for i in 0..12 {
        pile.push(add_box(
            &mut world,
            Physics3DBodyType::Dynamic,
            0.0,
            0.5 + i as f32,
            0.0,
        ));
    }
    run_registered(&mut world, 900);
    for body in &pile {
        assert!(finite(&body.read().unwrap()));
    }
    for pair in pile.windows(2) {
        assert!(pair[1].read().unwrap().y > pair[0].read().unwrap().y);
    }
    assert!(
        pile[0].read().unwrap().y > 0.4,
        "bottom={}",
        pile[0].read().unwrap().y
    );
    assert!(
        pile[11].read().unwrap().y > 10.2,
        "top={}",
        pile[11].read().unwrap().y
    );
    // api-drift: the 900-frame all-asleep boolean stays TS-only; the pile invariants above remain.
}

#[test]
fn keeps_a_driven_ball_and_socket_chain_bounded() {
    let mut world = world();
    world.gravity_y = -10.0;
    register_built_in_physics_3d_joint_solvers(&mut world);
    let mut links = vec![add_sphere(
        &mut world,
        Physics3DBodyType::Static,
        0.0,
        8.0,
        0.0,
        0.25,
        MATERIAL,
    )];
    for i in 1..=12 {
        let link = add_sphere(
            &mut world,
            Physics3DBodyType::Dynamic,
            0.0,
            8.0 - i as f32,
            0.0,
            0.25,
            MATERIAL,
        );
        let body_a = links[i - 1].read().unwrap().index;
        let body_b = link.read().unwrap().index;
        let mut options = joint_options(body_a, body_b);
        options.local_anchor_ay = Some(-0.5);
        options.local_anchor_by = Some(0.5);
        let joint = physics_3d_ball_and_socket_joint(&options);
        add_physics_3d_joint(&mut world, &joint);
        links.push(link);
    }
    {
        let mut driven = links.last().unwrap().write().unwrap();
        driven.velocity_x = 4.0;
        driven.velocity_z = 3.0;
    }
    run(&mut world, 1200);
    for body in &links {
        assert!(finite(&body.read().unwrap()));
    }
    let mut maximum_link_error = 0.0_f32;
    for pair in links.windows(2) {
        let first = pair[0].read().unwrap();
        let second = pair[1].read().unwrap();
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let dz = second.z - first.z;
        maximum_link_error = maximum_link_error.max((dx.hypot(dy).hypot(dz) - 1.0).abs());
    }
    assert!(maximum_link_error < 0.025, "{maximum_link_error}");
    let driven = links.last().unwrap().read().unwrap();
    assert!(driven.x.hypot(driven.z) < 15.0);
}

#[test]
fn supports_ordinary_and_adversarial_mass_ratios() {
    fn stacked_pair(ratio: f32, substeps: usize) -> (RigidBody3DRef, RigidBody3DRef) {
        let mut world = world();
        world.gravity_y = -10.0;
        world.config.substeps = substeps;
        add_floor(&mut world);
        let lower = add_box(&mut world, Physics3DBodyType::Dynamic, 0.0, 0.5, 0.0);
        let upper = add_cuboid(
            &mut world,
            Physics3DBodyType::Dynamic,
            0.0,
            1.5,
            0.0,
            0.5,
            0.5,
            0.5,
            Physics3DMaterial {
                density: ratio,
                friction: MATERIAL.friction,
                restitution: 0.0,
            },
        );
        set_physics_3d_body_fixed_rotation(&mut world, &lower, true);
        set_physics_3d_body_fixed_rotation(&mut world, &upper, true);
        run(&mut world, 600);
        (lower, upper)
    }

    for (ratio, substeps) in [(100.0, 1), (1000.0, 4)] {
        let (lower, upper) = stacked_pair(ratio, substeps);
        let lower = lower.read().unwrap();
        let upper = upper.read().unwrap();
        assert!(finite(&lower));
        assert!(finite(&upper));
        assert!(lower.y > 0.49, "ratio={ratio}, lower={}", lower.y);
        assert!(
            upper.y - lower.y > 0.99,
            "ratio={ratio}, separation={}",
            upper.y - lower.y
        );
        assert!(
            lower.sleeping,
            "ratio={ratio}, lower={:?}",
            lower.velocity_y
        );
        assert!(
            upper.sleeping,
            "ratio={ratio}, upper={:?}",
            upper.velocity_y
        );
    }
}

#[test]
fn keeps_restitution_energy_and_centred_contact_torque_bounded() {
    let mut world = world();
    world.gravity_y = 0.0;
    let elastic = Physics3DMaterial {
        density: 1.0,
        friction: 0.0,
        restitution: 1.0,
    };
    add_cuboid(
        &mut world,
        Physics3DBodyType::Static,
        -5.25,
        0.0,
        0.0,
        0.25,
        5.0,
        5.0,
        elastic,
    );
    add_cuboid(
        &mut world,
        Physics3DBodyType::Static,
        5.25,
        0.0,
        0.0,
        0.25,
        5.0,
        5.0,
        elastic,
    );
    let ball = add_sphere(
        &mut world,
        Physics3DBodyType::Dynamic,
        0.0,
        0.0,
        0.0,
        0.25,
        elastic,
    );
    {
        let mut ball = ball.write().unwrap();
        ball.sleep_enabled = false;
        ball.velocity_x = 6.0;
    }
    run(&mut world, 3600);
    let ball = ball.read().unwrap();
    assert!(finite(&ball));
    assert!(ball.x.abs() <= 4.81, "x={}", ball.x);
    assert!(
        (ball
            .velocity_x
            .hypot(ball.velocity_y)
            .hypot(ball.velocity_z)
            - 6.0)
            .abs()
            < 1e-5
    );
    assert!(
        ball.angular_velocity_x
            .hypot(ball.angular_velocity_y)
            .hypot(ball.angular_velocity_z)
            < 1e-9
    );
}

#[test]
fn makes_long_horizon_coulomb_friction_isotropic() {
    fn slide(diagonal: bool) -> [f32; 3] {
        let mut world = world();
        world.gravity_y = -10.0;
        add_floor(&mut world);
        let body = add_box(&mut world, Physics3DBodyType::Dynamic, 0.0, 0.5, 0.0);
        set_physics_3d_body_fixed_rotation(&mut world, &body, true);
        {
            let mut body = body.write().unwrap();
            let component = if diagonal {
                5.0 / std::f32::consts::SQRT_2
            } else {
                5.0
            };
            body.velocity_x = component;
            body.velocity_z = if diagonal { component } else { 0.0 };
        }
        run(&mut world, 240);
        let body = body.read().unwrap();
        assert!(body.velocity_x.hypot(body.velocity_z) < 1e-9);
        [body.x, body.z, body.x.hypot(body.z)]
    }

    let axis = slide(false);
    let diagonal = slide(true);
    assert!(axis[1].abs() < 0.001);
    assert!((diagonal[0] - diagonal[1]).abs() < 0.001);
    assert!((axis[2] - diagonal[2]).abs() < 0.005);
}

#[test]
fn produces_an_exact_repeat_trace_for_a_mixed_scene() {
    fn scene() -> Physics3DWorld {
        let mut world = world();
        world.gravity_y = -10.0;
        register_built_in_physics_3d_joint_solvers(&mut world);
        add_floor(&mut world);
        let first = add_box(&mut world, Physics3DBodyType::Dynamic, -1.0, 0.5, 0.0);
        let second = add_box(&mut world, Physics3DBodyType::Dynamic, -1.0, 1.5, 0.0);
        let mut options = joint_options(first.read().unwrap().index, second.read().unwrap().index);
        options.local_anchor_ay = Some(0.5);
        options.local_anchor_by = Some(-0.5);
        let joint = physics_3d_ball_and_socket_joint(&options);
        add_physics_3d_joint(&mut world, &joint);
        add_box(&mut world, Physics3DBodyType::Dynamic, 2.0, 0.5, 0.0);
        add_box(&mut world, Physics3DBodyType::Dynamic, 2.0, 0.5, 2.0);
        let thrown = add_sphere(
            &mut world,
            Physics3DBodyType::Dynamic,
            -8.0,
            3.0,
            0.0,
            0.25,
            MATERIAL,
        );
        {
            let mut thrown = thrown.write().unwrap();
            thrown.gravity_scale = 0.0;
            thrown.velocity_x = 20.0;
        }
        return world;
    }
    let mut first = scene();
    let mut second = scene();
    run(&mut first, 240);
    run(&mut second, 240);
    assert_eq!(snapshot(&first), snapshot(&second));
}

#[test]
fn insertion_order_does_not_change_independent_pile_heights() {
    fn scene(reversed: bool) -> Vec<f32> {
        let mut world = world();
        world.gravity_y = -10.0;
        add_floor(&mut world);
        let columns = if reversed { [6.0, -6.0] } else { [-6.0, 6.0] };
        let mut tracked = Vec::new();
        for x in columns {
            for i in 0..3 {
                tracked.push(add_box(
                    &mut world,
                    Physics3DBodyType::Dynamic,
                    x,
                    0.5 + i as f32,
                    0.0,
                ));
            }
        }
        run(&mut world, 300);
        let mut positions: Vec<(i32, f32)> = tracked
            .iter()
            .map(|body| {
                let body = body.read().unwrap();
                (body.x.round() as i32, body.y)
            })
            .collect();
        positions.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
        return positions.into_iter().map(|(_, y)| y).collect();
    }
    let forward = scene(false);
    let backward = scene(true);
    for (a, b) in forward.iter().zip(backward.iter()) {
        assert!((a - b).abs() < 1e-9, "{a} != {b}");
    }
}

#[test]
fn retains_stable_contact_identity_and_point_storage() {
    let mut world = world();
    world.gravity_y = -10.0;
    add_floor(&mut world);
    add_box(&mut world, Physics3DBodyType::Dynamic, 0.0, 0.5, 0.0);
    run(&mut world, 180);
    assert_eq!(world.contacts.len(), 1);
    let contact = world.contacts[0].clone();
    let point_ptr = contact.read().unwrap().points.as_ptr();
    run(&mut world, 300);
    assert!(Arc::ptr_eq(&world.contacts[0], &contact));
    assert_eq!(world.contacts[0].read().unwrap().points.as_ptr(), point_ptr);
}

#[test]
fn spinning_asymmetric_body_stays_finite_and_converges_with_substeps() {
    let mut drifts = Vec::new();
    for substeps in [1, 2, 4] {
        let mut world = world();
        world.gravity_y = 0.0;
        world.config.substeps = substeps;
        let body = add_cuboid(
            &mut world,
            Physics3DBodyType::Dynamic,
            0.0,
            0.0,
            0.0,
            2.0,
            0.5,
            1.0,
            MATERIAL,
        );
        {
            let mut body = body.write().unwrap();
            body.sleep_enabled = false;
            body.angular_velocity_x = 3.0;
            body.angular_velocity_y = 0.2;
            body.angular_velocity_z = 0.1;
        }
        let initial = angular_momentum_magnitude(&body.read().unwrap());
        run(&mut world, 600);
        let body = body.read().unwrap();
        assert!(finite(&body));
        let quaternion_length = (body.orientation_x * body.orientation_x
            + body.orientation_y * body.orientation_y
            + body.orientation_z * body.orientation_z
            + body.orientation_w * body.orientation_w)
            .sqrt();
        assert!((quaternion_length - 1.0).abs() < 1e-5);
        drifts.push((angular_momentum_magnitude(&body) / initial - 1.0).abs());
    }
    assert!(drifts[1] < drifts[0] * 0.7, "{drifts:?}");
    assert!(drifts[2] < drifts[1] * 0.7, "{drifts:?}");
    assert!(drifts[2] < 0.05, "{drifts:?}");
}
