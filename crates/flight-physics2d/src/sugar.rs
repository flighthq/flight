//! Rust convenience methods for the public physics2d lane (D18): each delegates to its free
//! function.

use flight_collision::{CollisionRegistry2D, CollisionShape2D};
use flight_entity::{Kind, Ref};
use flight_log::LogStateRef;
use flight_scene2d::Node2DRef;
use flight_spatial::SpatialAabb2D;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::sync::{Arc, RwLock};

    use flight_collision::CollisionCircle2D;

    use super::*;

    const STONE: Physics2DMaterial = Physics2DMaterial {
        density: 1.0,
        friction: 0.5,
        restitution: 0.0,
    };

    struct Scene {
        a: Ref<RigidBody2D>,
        b: Ref<RigidBody2D>,
        collider: Ref<Physics2DCollider>,
        joint: Physics2DJointRef,
        world: Physics2DWorld,
    }

    fn circle() -> CollisionShape2D {
        return CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 0.5,
        });
    }

    fn distance_options(body_a: i32, body_b: i32) -> Physics2DDistanceJointOptions {
        let mut options = Physics2DDistanceJointOptions::default();
        options.base.body_a = body_a;
        options.base.body_b = body_b;
        options.length = 1.0;
        return options;
    }

    fn authored_collider(
        local: &CollisionShape2D,
        material: &Physics2DMaterial,
        sensor: Option<bool>,
    ) -> Ref<Physics2DCollider> {
        let out = create_physics2d_collider(local);
        {
            let mut out = out.write().unwrap();
            out.material = *material;
            out.sensor = sensor.unwrap_or(false);
        }
        return out;
    }

    fn authored_distance_joint(
        options: &Physics2DDistanceJointOptions,
    ) -> Ref<Physics2DDistanceJoint> {
        let out = create_physics2d_distance_joint();
        {
            let mut out = out.write().unwrap();
            out.body_a = options.base.body_a;
            out.body_b = options.base.body_b;
            out.length = options.length;
        }
        return out;
    }

    fn authored_rigid_body(
        body_type: Physics2DBodyType,
        x: f32,
        y: f32,
        angle: Option<f32>,
    ) -> Ref<RigidBody2D> {
        let out = create_rigid_body2d();
        {
            let mut out = out.write().unwrap();
            out.angle = angle.unwrap_or(0.0);
            out.body_type = body_type;
            out.x = x;
            out.y = y;
        }
        return out;
    }

    fn authored_world(gravity_x: Option<f32>, gravity_y: Option<f32>) -> Physics2DWorld {
        let mut out = create_physics2d_world();
        out.gravity_x = gravity_x.unwrap_or(0.0);
        out.gravity_y = gravity_y.unwrap_or(-9.81);
        return out;
    }

    fn noop_solver() -> Physics2DJointSolverRef {
        return Arc::new(Physics2DJointSolver {
            clear_accumulated_impulses: None,
            keeps_bodies_awake: None,
            prepare: Arc::new(|_, _, _| {}),
            scale_accumulated_impulses: None,
            solve: Arc::new(|_, _| {}),
            swap_ends: None,
            uses_body_a: None,
            warm_start: None,
            write_reaction: None,
        });
    }

    fn registry() -> CollisionRegistry2D {
        let mut registry = CollisionRegistry2D {
            pair_tests: std::collections::HashMap::new(),
            supports: std::collections::HashMap::new(),
            test_guard: None,
        };
        flight_collision::register_built_in_collision_supports2d(&mut registry);
        flight_collision::register_built_in_collision_pair_tests2d(&mut registry);
        return registry;
    }

    // Two overlapping circles joined by a distance joint, with the built-in solvers.
    fn scene() -> Scene {
        let mut world = authored_world(Some(0.0), Some(-10.0));
        register_built_in_physics2d_joint_solvers(&mut world);
        let a = authored_rigid_body(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let b = authored_rigid_body(Physics2DBodyType::Dynamic, 0.75, 0.0, None);
        add_physics2d_body(&mut world, &a);
        add_physics2d_body(&mut world, &b);
        let collider = authored_collider(&circle(), &STONE, None);
        add_physics2d_collider(&mut world, &a, &collider);
        add_physics2d_collider(&mut world, &b, &authored_collider(&circle(), &STONE, None));
        let (index_a, index_b) = (a.read().unwrap().index, b.read().unwrap().index);
        let joint: Physics2DJointRef = authored_distance_joint(&distance_options(index_a, index_b));
        add_physics2d_joint(&mut world, &joint);
        return Scene {
            a,
            b,
            collider,
            joint,
            world,
        };
    }

    fn signature(world: &Physics2DWorld) -> Vec<f32> {
        let mut out = vec![
            world.bodies.len() as f32,
            world.contacts.len() as f32,
            world.joints.len() as f32,
            world.joint_solvers.len() as f32,
            world.solve_island_roots.len() as f32,
        ];
        for body in &world.bodies {
            let body = body.read().unwrap();
            out.extend([
                body.x,
                body.y,
                body.angle,
                body.velocity_x,
                body.velocity_y,
                body.angular_velocity,
                body.mass,
                body.sleep_timer as f32,
                body.sleeping as u8 as f32,
                body.bullet as u8 as f32,
                body.fixed_rotation as u8 as f32,
                body.sleep_enabled as u8 as f32,
                body.colliders.len() as f32,
            ]);
        }
        return out;
    }

    fn body_signature(body: &RigidBody2D) -> Vec<f32> {
        return vec![
            body.velocity_x,
            body.velocity_y,
            body.angular_velocity,
            body.force_x,
            body.force_y,
            body.torque,
            body.mass,
            body.inertia,
            body.sleeping as u8 as f32,
            body.sleep_timer as f32,
        ];
    }

    fn stepped() -> Scene {
        let mut scene = scene();
        step_physics2d(&mut scene.world, 1.0 / 60.0, &registry(), None);
        return scene;
    }

    #[test]
    fn collider_methods_match_their_free_functions() {
        let made = Physics2DCollider::new(&circle());
        let free = create_physics2d_collider(&circle());
        made.write().unwrap().sensor = true;
        free.write().unwrap().sensor = true;
        assert_eq!(made.read().unwrap().sensor, free.read().unwrap().sensor);
        assert_eq!(made.read().unwrap().local, free.read().unwrap().local);

        let body = authored_rigid_body(Physics2DBodyType::Dynamic, 2.0, 3.0, Some(0.5));
        made.write()
            .unwrap()
            .update_world_shape(&body.read().unwrap());
        update_physics2d_collider_world_shape(&mut free.write().unwrap(), &body.read().unwrap());
        assert_eq!(made.read().unwrap().world, free.read().unwrap().world);
    }

    #[test]
    fn contact_and_solver_config_validity_match_their_free_functions() {
        let mut contact = Physics2DContact {
            body_a: 0,
            body_b: 1,
            collider_a: 0,
            collider_b: 0,
            enabled: true,
            friction: 0.5,
            normal_x: 0.0,
            normal_y: 1.0,
            point_count: 0,
            points: Vec::new(),
            restitution: 0.0,
            sensor: false,
            touching: true,
        };
        assert_eq!(contact.is_valid(), is_physics2d_contact_valid(&contact));
        contact.friction = f32::NAN;
        assert_eq!(contact.is_valid(), is_physics2d_contact_valid(&contact));
        let mut config = Physics2DSolverConfig::new(None);
        assert_eq!(config, create_physics2d_solver_config(None));
        assert_eq!(config.is_valid(), is_physics2d_solver_config_valid(&config));
        config.position_correction = 2.0;
        assert_eq!(config.is_valid(), is_physics2d_solver_config_valid(&config));
    }

    #[test]
    fn debug_geometry_methods_match_their_free_functions() {
        let scene = stepped();
        let mut method = Physics2DDebugGeometry::new();
        let mut free = create_physics2d_debug_geometry();
        method.write(&scene.world, None);
        write_physics2d_debug_geometry(&mut free, &scene.world, None);
        assert_eq!(
            (method.line_count, method.circle_count),
            (free.line_count, free.circle_count)
        );
        assert_eq!(method.lines, free.lines);
        assert_eq!(method.circles, free.circles);
    }

    #[test]
    fn guard_state_methods_match_their_free_functions() {
        let log_state: LogStateRef = Arc::new(RwLock::new(flight_log::create_log_state()));
        let clock: Physics2DGuardClock = Arc::new(|| 0.0);
        let mut method = Physics2DGuardState::default();
        let mut free = Physics2DGuardState::default();
        method.enable(log_state.clone(), clock.clone());
        enable_physics2d_guards(&mut free, log_state, clock);
        assert_eq!(method.are_enabled(), are_physics2d_guards_enabled(&free));
        assert!(method.step_guard.is_some() && free.step_guard.is_some());
        method.disable();
        disable_physics2d_guards(&mut free);
        assert_eq!(method.are_enabled(), are_physics2d_guards_enabled(&free));
        assert!(method.step_guard.is_none() && free.step_guard.is_none());
    }

    #[test]
    fn joint_constructors_match_their_free_functions() {
        let distance = Physics2DDistanceJoint::new();
        let free = create_physics2d_distance_joint();
        assert_eq!(distance.read().unwrap().length, free.read().unwrap().length);
        assert_eq!(distance.read().unwrap().kind, free.read().unwrap().kind);

        macro_rules! same_kind {
            ($t:ident, $create:ident) => {
                assert_eq!(
                    $t::new().read().unwrap().kind,
                    $create().read().unwrap().kind
                );
            };
        }
        same_kind!(Physics2DGearJoint, create_physics2d_gear_joint);
        same_kind!(Physics2DMouseJoint, create_physics2d_mouse_joint);
        same_kind!(Physics2DPrismaticJoint, create_physics2d_prismatic_joint);
        same_kind!(Physics2DPulleyJoint, create_physics2d_pulley_joint);
        same_kind!(Physics2DRevoluteJoint, create_physics2d_revolute_joint);
        same_kind!(Physics2DRopeJoint, create_physics2d_rope_joint);
        same_kind!(Physics2DWeldJoint, create_physics2d_weld_joint);
        same_kind!(Physics2DWheelJoint, create_physics2d_wheel_joint);
    }

    #[test]
    fn joint_fields_and_reaction_methods_match_their_free_functions() {
        let scene = stepped();
        let guard = scene.joint.read().unwrap();
        let (mut method, mut free) = (Vec::new(), Vec::new());
        guard
            .joint_fields()
            .visit_base_number_fields(&mut |value| method.push(value));
        visit_physics2d_joint_base_number_fields(guard.joint_fields(), &mut |value| {
            free.push(value)
        });
        assert_eq!(method, free);

        let mut method = Physics2DJointReaction::new();
        let mut free = create_physics2d_joint_reaction();
        let wrote = method.write(&scene.world, &*guard, 1.0 / 60.0);
        assert_eq!(
            wrote,
            write_physics2d_joint_reaction(&mut free, &scene.world, &*guard, 1.0 / 60.0)
        );
        assert_eq!(
            (method.force_x, method.force_y, method.torque),
            (free.force_x, free.force_y, free.torque)
        );
    }

    #[test]
    fn mass_data_method_matches_its_free_function() {
        let scene = scene();
        let collider = scene.collider.read().unwrap();
        let mut method = Physics2DMassData::default();
        let mut free = Physics2DMassData::default();
        method.compute_collider(&collider);
        compute_physics2d_collider_mass_data(&mut free, &collider);
        assert_eq!(method, free);
    }

    #[test]
    fn query_methods_match_their_free_functions() {
        let scene = stepped();
        let world = &scene.world;
        assert_eq!(Physics2DQueryFilter::new(), create_physics2d_query_filter());

        let (mut method, mut free) = (Physics2DQueryResult::new(), create_physics2d_query_result());
        method.query_point(world, 0.0, 0.0, None);
        query_physics2d_point(&mut free, world, 0.0, 0.0, None);
        assert_eq!(method.hit_count, free.hit_count);
        let region = SpatialAabb2D {
            min_x: -1.0,
            min_y: -1.0,
            max_x: 2.0,
            max_y: 1.0,
        };
        method.query_region(world, &region, None);
        query_physics2d_region(&mut free, world, &region, None);
        assert_eq!(method.hit_count, free.hit_count);

        let (mut method, mut free) = (Physics2DRayResult::new(), create_physics2d_ray_result());
        method.query_ray(world, -5.0, 0.0, 1.0, 0.0, None, None);
        query_physics2d_ray(&mut free, world, -5.0, 0.0, 1.0, 0.0, None, None);
        assert_eq!(method.hit_count, free.hit_count);
        method.query_ray_closest(world, -5.0, 0.0, 1.0, 0.0, None, None);
        query_physics2d_ray_closest(&mut free, world, -5.0, 0.0, 1.0, 0.0, None, None);
        assert_eq!(
            (method.hit_count, method.hits[0].fraction),
            (free.hit_count, free.hits[0].fraction)
        );

        let registry = registry();
        let (mut method, mut free) = (
            Physics2DShapeCastResult::new(),
            create_physics2d_shape_cast_result(),
        );
        let probe = CollisionShape2D::Circle(CollisionCircle2D {
            x: -5.0,
            y: 0.0,
            radius: 0.25,
        });
        method.query_shape_cast(world, &registry, &probe, 10.0, 0.0, None, None);
        query_physics2d_shape_cast(&mut free, world, &registry, &probe, 10.0, 0.0, None, None);
        assert_eq!((method.hit, method.fraction), (free.hit, free.fraction));
    }

    #[test]
    fn rigid_body_methods_match_their_free_functions() {
        let made = RigidBody2D::new();
        let free = create_rigid_body2d();
        let (scene_a, scene_b) = (scene(), scene());
        let (mut a, mut b) = (scene_a.a.write().unwrap(), scene_b.a.write().unwrap());
        assert_eq!(made.read().unwrap().angle, free.read().unwrap().angle);
        assert_eq!(
            a.apply_force(1.0, 2.0),
            apply_physics2d_force(&mut b, 1.0, 2.0)
        );
        assert_eq!(
            a.apply_force_at_point(1.0, 0.0, 0.0, 1.0),
            apply_physics2d_force_at_point(&mut b, 1.0, 0.0, 0.0, 1.0)
        );
        assert_eq!(
            a.apply_linear_impulse(0.5, 0.0),
            apply_physics2d_linear_impulse(&mut b, 0.5, 0.0)
        );
        assert_eq!(
            a.apply_linear_impulse_at_point(0.0, 0.5, 0.5, 0.0),
            apply_physics2d_linear_impulse_at_point(&mut b, 0.0, 0.5, 0.5, 0.0)
        );
        assert_eq!(a.apply_torque(3.0), apply_physics2d_torque(&mut b, 3.0));
        {
            let (mut other_a, mut other_b) =
                (scene_a.b.write().unwrap(), scene_b.b.write().unwrap());
            a.apply_impulse(&mut other_a, 0.1, 0.0, -0.1, 0.0, 0.0, 1.0);
            apply_physics2d_impulse(&mut b, &mut other_b, 0.1, 0.0, -0.1, 0.0, 0.0, 1.0);
            assert_eq!(body_signature(&other_a), body_signature(&other_b));
            let point = Physics2DContactPoint::default();
            assert_eq!(
                a.relative_normal_velocity(&other_a, &point, 1.0, 0.0),
                relative_normal_velocity(&b, &other_b, &point, 1.0, 0.0)
            );
            assert_eq!(
                a.is_pair_awake(&other_a),
                is_rigid_body2d_pair_awake(&b, &other_b)
            );
            assert_eq!(
                a.is_pair_ordered(&other_a),
                is_physics2d_pair_ordered(&b, &other_b)
            );
        }
        a.sleeping = true;
        b.sleeping = true;
        a.wake();
        wake_physics2d_body(&mut b);
        a.update_mass_data();
        update_rigid_body2d_mass_data(&mut b);
        assert_eq!(body_signature(&a), body_signature(&b));
        a.assert_not_stepping();
        assert_physics2d_body_not_stepping(&b);

        let node: Node2DRef = flight_scene2d::create_display_object();
        let free_node: Node2DRef = flight_scene2d::create_display_object();
        a.sync_to_node2d(&node);
        sync_physics2d_body_to_node2d(&b, &free_node);
        let (node, free_node) = (node.read().unwrap(), free_node.read().unwrap());
        let (n, f) = (node.node2d_fields(), free_node.node2d_fields());
        assert_eq!((n.x, n.y, n.rotation), (f.x, f.y, f.rotation));
    }

    #[test]
    fn world_mutation_methods_match_their_free_functions() {
        let (mut method, mut free) = (scene(), scene());
        assert_eq!(
            signature(&Physics2DWorld::new()),
            signature(&create_physics2d_world())
        );
        let (extra_a, extra_b) = (
            authored_rigid_body(Physics2DBodyType::Static, 5.0, 0.0, None),
            authored_rigid_body(Physics2DBodyType::Static, 5.0, 0.0, None),
        );
        method.world.add_body(&extra_a);
        add_physics2d_body(&mut free.world, &extra_b);
        let (shape_a, shape_b) = (
            authored_collider(&circle(), &STONE, None),
            authored_collider(&circle(), &STONE, None),
        );
        method.world.add_collider(&extra_a, &shape_a);
        add_physics2d_collider(&mut free.world, &extra_b, &shape_b);
        let (index_a, index_b) = (extra_a.read().unwrap().index, extra_b.read().unwrap().index);
        let joint_a: Physics2DJointRef = authored_distance_joint(&distance_options(0, index_a));
        let joint_b: Physics2DJointRef = authored_distance_joint(&distance_options(0, index_b));
        method.world.add_joint(&joint_a);
        add_physics2d_joint(&mut free.world, &joint_b);
        assert_eq!(signature(&method.world), signature(&free.world));

        assert_eq!(
            method.world.invalidate_collider(&extra_a, &shape_a),
            invalidate_physics2d_collider(&mut free.world, &extra_b, &shape_b)
        );
        assert_eq!(
            method.world.invalidate_joint(&joint_a),
            invalidate_physics2d_joint(&mut free.world, &joint_b)
        );
        assert_eq!(
            method.world.set_body_bullet(&method.a, true),
            set_physics2d_body_bullet(&mut free.world, &free.a, true)
        );
        assert_eq!(
            method.world.set_body_fixed_rotation(&method.a, true),
            set_physics2d_body_fixed_rotation(&mut free.world, &free.a, true)
        );
        assert_eq!(
            method.world.set_body_sleep_enabled(&method.a, false),
            set_physics2d_body_sleep_enabled(&mut free.world, &free.a, false)
        );
        assert_eq!(
            method.world.set_body_transform(&method.b, 1.0, 1.0, 0.5),
            set_physics2d_body_transform(&mut free.world, &free.b, 1.0, 1.0, 0.5)
        );
        assert_eq!(
            method
                .world
                .set_body_type(&method.b, Physics2DBodyType::Kinematic),
            set_physics2d_body_type(&mut free.world, &free.b, Physics2DBodyType::Kinematic)
        );
        assert_eq!(signature(&method.world), signature(&free.world));

        method
            .world
            .register_joint_solver("acme.Noop".to_string(), noop_solver());
        register_physics2d_joint_solver(&mut free.world, "acme.Noop".to_string(), noop_solver());
        method.world.register_built_in_joint_solvers();
        register_built_in_physics2d_joint_solvers(&mut free.world);
        method.world.rebuild_joint_collision_suppressions();
        rebuild_physics2d_joint_collision_suppressions(&mut free.world);
        assert_eq!(
            method.world.hydrate(),
            hydrate_physics2d_world(&mut free.world)
        );
        assert_eq!(signature(&method.world), signature(&free.world));

        assert_eq!(
            method.world.remove_joint(&joint_a),
            remove_physics2d_joint(&mut free.world, &joint_b)
        );
        assert_eq!(
            method.world.remove_collider(&extra_a, &shape_a),
            remove_physics2d_collider(&mut free.world, &extra_b, &shape_b)
        );
        assert_eq!(
            method.world.remove_body(&extra_a),
            remove_physics2d_body(&mut free.world, &extra_b)
        );
        assert_eq!(signature(&method.world), signature(&free.world));
    }

    #[test]
    fn world_query_methods_match_their_free_functions() {
        let scene = stepped();
        let world = &scene.world;
        let index = scene.a.read().unwrap().index;
        world.assert_not_stepping();
        assert_physics2d_world_not_stepping(world);
        assert_eq!(
            world.explain_collision(),
            explain_physics2d_collision(world)
        );
        assert_eq!(world.explain_joints(), explain_physics2d_joints(world));
        assert_eq!(
            world.explain_step(1.0 / 60.0),
            explain_physics2d_step(world, 1.0 / 60.0)
        );
        assert!(Arc::ptr_eq(
            &world.find_body(index).unwrap(),
            &find_physics2d_body(world, index).unwrap()
        ));
        assert!(Arc::ptr_eq(
            &world
                .get_joint_solver(PHYSICS2D_DISTANCE_JOINT_KIND)
                .unwrap(),
            &get_physics2d_joint_solver(world, PHYSICS2D_DISTANCE_JOINT_KIND).unwrap()
        ));
        assert_eq!(
            world.is_body_state_valid(),
            is_physics2d_body_state_valid(world)
        );
        assert_eq!(
            world.is_contact_state_valid(),
            is_physics2d_contact_state_valid(world)
        );
        assert_eq!(world.is_gravity_valid(), is_physics2d_gravity_valid(world));
        assert_eq!(
            world.is_joint_state_valid(),
            is_physics2d_joint_state_valid(world)
        );
        assert_eq!(
            world.is_pair_joint_suppressed(0, 1),
            is_physics2d_pair_joint_suppressed(world, 0, 1)
        );
        assert_eq!(
            world.is_previous_timestep_valid(),
            is_physics2d_previous_timestep_valid(world)
        );
    }

    #[test]
    fn world_solver_methods_match_their_free_functions() {
        let (mut method, mut free) = (stepped(), stepped());
        let registry = registry();
        method.world.step(1.0 / 60.0, &registry, None);
        step_physics2d(&mut free.world, 1.0 / 60.0, &registry, None);
        assert_eq!(signature(&method.world), signature(&free.world));

        method.world.synchronize_broadphase();
        synchronize_physics2d_broadphase(&free.world);
        method.world.synchronize_swept_broadphase(1.0 / 60.0);
        synchronize_physics2d_swept_broadphase(&free.world, 1.0 / 60.0);
        method.world.update_sleep(1.0 / 60.0);
        update_physics2d_sleep(&mut free.world, 1.0 / 60.0);
        method.world.build_solve_islands();
        build_physics2d_solve_islands(&mut free.world);
        assert_eq!(signature(&method.world), signature(&free.world));

        method.world.warm_start_contacts();
        warm_start_physics2d_contacts(&free.world);
        method.world.solve_contacts_once();
        solve_physics2d_contacts_once(&free.world);
        method.world.solve_contacts();
        solve_physics2d_contacts(&free.world);
        let count = method.world.contacts.len();
        let indices: Vec<usize> = (0..count).collect();
        method.world.warm_start_contact_indices(&indices, 0, count);
        warm_start_physics2d_contact_indices(&free.world, &indices, 0, count);
        method.world.solve_contact_indices_once(&indices, 0, count);
        solve_physics2d_contact_indices_once(&free.world, &indices, 0, count);
        assert_eq!(signature(&method.world), signature(&free.world));
    }
}

impl Physics2DCollider {
    pub fn new(local: &CollisionShape2D) -> Ref<Physics2DCollider> {
        return create_physics2d_collider(local);
    }

    pub fn update_world_shape(&mut self, body: &RigidBody2D) {
        return update_physics2d_collider_world_shape(self, body);
    }
}

impl Physics2DContact {
    pub fn is_valid(&self) -> bool {
        return is_physics2d_contact_valid(self);
    }
}

impl Physics2DDebugGeometry {
    pub fn new() -> Physics2DDebugGeometry {
        return create_physics2d_debug_geometry();
    }

    pub fn write(
        &mut self,
        world: &Physics2DWorld,
        options: Option<&Physics2DDebugGeometryOptions>,
    ) {
        return write_physics2d_debug_geometry(self, world, options);
    }
}

impl Physics2DDistanceJoint {
    pub fn new() -> Ref<Physics2DDistanceJoint> {
        return create_physics2d_distance_joint();
    }
}

impl Physics2DGearJoint {
    pub fn new() -> Ref<Physics2DGearJoint> {
        return create_physics2d_gear_joint();
    }
}

impl Physics2DGuardState {
    pub fn are_enabled(&self) -> bool {
        return are_physics2d_guards_enabled(self);
    }

    pub fn disable(&mut self) {
        return disable_physics2d_guards(self);
    }

    pub fn enable(&mut self, log_state: LogStateRef, clock: Physics2DGuardClock) {
        return enable_physics2d_guards(self, log_state, clock);
    }
}

impl Physics2DJointFields {
    pub fn visit_base_number_fields(&self, visit: &mut dyn FnMut(f32)) {
        return visit_physics2d_joint_base_number_fields(self, visit);
    }
}

impl Physics2DJointReaction {
    pub fn new() -> Physics2DJointReaction {
        return create_physics2d_joint_reaction();
    }

    pub fn write(&mut self, world: &Physics2DWorld, joint: &dyn Physics2DJoint, dt: f32) -> bool {
        return write_physics2d_joint_reaction(self, world, joint, dt);
    }
}

impl Physics2DMassData {
    pub fn compute_collider(&mut self, collider: &Physics2DCollider) {
        return compute_physics2d_collider_mass_data(self, collider);
    }
}

impl Physics2DMouseJoint {
    pub fn new() -> Ref<Physics2DMouseJoint> {
        return create_physics2d_mouse_joint();
    }
}

impl Physics2DPrismaticJoint {
    pub fn new() -> Ref<Physics2DPrismaticJoint> {
        return create_physics2d_prismatic_joint();
    }
}

impl Physics2DPulleyJoint {
    pub fn new() -> Ref<Physics2DPulleyJoint> {
        return create_physics2d_pulley_joint();
    }
}

impl Physics2DQueryFilter {
    pub fn new() -> Physics2DQueryFilter {
        return create_physics2d_query_filter();
    }
}

impl Physics2DQueryResult {
    pub fn new() -> Physics2DQueryResult {
        return create_physics2d_query_result();
    }

    pub fn query_point(
        &mut self,
        world: &Physics2DWorld,
        x: f32,
        y: f32,
        filter: Option<&Physics2DQueryFilter>,
    ) {
        return query_physics2d_point(self, world, x, y, filter);
    }

    pub fn query_region(
        &mut self,
        world: &Physics2DWorld,
        region: &SpatialAabb2D,
        filter: Option<&Physics2DQueryFilter>,
    ) {
        return query_physics2d_region(self, world, region, filter);
    }
}

impl Physics2DRayResult {
    pub fn new() -> Physics2DRayResult {
        return create_physics2d_ray_result();
    }

    pub fn query_ray(
        &mut self,
        world: &Physics2DWorld,
        origin_x: f32,
        origin_y: f32,
        direction_x: f32,
        direction_y: f32,
        max_fraction: Option<f32>,
        filter: Option<&Physics2DQueryFilter>,
    ) {
        return query_physics2d_ray(
            self,
            world,
            origin_x,
            origin_y,
            direction_x,
            direction_y,
            max_fraction,
            filter,
        );
    }

    pub fn query_ray_closest(
        &mut self,
        world: &Physics2DWorld,
        origin_x: f32,
        origin_y: f32,
        direction_x: f32,
        direction_y: f32,
        max_fraction: Option<f32>,
        filter: Option<&Physics2DQueryFilter>,
    ) {
        return query_physics2d_ray_closest(
            self,
            world,
            origin_x,
            origin_y,
            direction_x,
            direction_y,
            max_fraction,
            filter,
        );
    }
}

impl Physics2DRevoluteJoint {
    pub fn new() -> Ref<Physics2DRevoluteJoint> {
        return create_physics2d_revolute_joint();
    }
}

impl Physics2DRopeJoint {
    pub fn new() -> Ref<Physics2DRopeJoint> {
        return create_physics2d_rope_joint();
    }
}

impl Physics2DShapeCastResult {
    pub fn new() -> Physics2DShapeCastResult {
        return create_physics2d_shape_cast_result();
    }

    pub fn query_shape_cast(
        &mut self,
        world: &Physics2DWorld,
        registry: &CollisionRegistry2D,
        shape: &CollisionShape2D,
        dx: f32,
        dy: f32,
        max_fraction: Option<f32>,
        filter: Option<&Physics2DQueryFilter>,
    ) {
        return query_physics2d_shape_cast(
            self,
            world,
            registry,
            shape,
            dx,
            dy,
            max_fraction,
            filter,
        );
    }
}

impl Physics2DSolverConfig {
    pub fn new(options: Option<&Physics2DSolverConfigOptions>) -> Physics2DSolverConfig {
        return create_physics2d_solver_config(options);
    }

    pub fn is_valid(&self) -> bool {
        return is_physics2d_solver_config_valid(self);
    }
}

impl Physics2DWeldJoint {
    pub fn new() -> Ref<Physics2DWeldJoint> {
        return create_physics2d_weld_joint();
    }
}

impl Physics2DWheelJoint {
    pub fn new() -> Ref<Physics2DWheelJoint> {
        return create_physics2d_wheel_joint();
    }
}

impl Physics2DWorld {
    pub fn new() -> Physics2DWorld {
        return create_physics2d_world();
    }

    pub fn add_body(&mut self, body: &Ref<RigidBody2D>) {
        return add_physics2d_body(self, body);
    }

    pub fn add_collider(&mut self, body: &Ref<RigidBody2D>, collider: &Ref<Physics2DCollider>) {
        return add_physics2d_collider(self, body, collider);
    }

    pub fn add_joint(&mut self, joint: &Physics2DJointRef) {
        return add_physics2d_joint(self, joint);
    }

    pub fn assert_not_stepping(&self) {
        return assert_physics2d_world_not_stepping(self);
    }

    pub fn build_solve_islands(&mut self) {
        return build_physics2d_solve_islands(self);
    }

    pub fn explain_collision(&self) -> Physics2DCollisionExplanation {
        return explain_physics2d_collision(self);
    }

    pub fn explain_joints(&self) -> Physics2DJointResolutionExplanation {
        return explain_physics2d_joints(self);
    }

    // flight-lint: allow(f64) time accumulation: TS f64 sleep-threshold timing (30 × 1/60 crosses 0.5 differently in f32)
    pub fn explain_step(&self, dt: f64) -> Physics2DStepExplanation {
        return explain_physics2d_step(self, dt);
    }

    pub fn find_body(&self, index: i32) -> Option<Ref<RigidBody2D>> {
        return find_physics2d_body(self, index);
    }

    pub fn get_joint_solver(&self, kind: &str) -> Option<Physics2DJointSolverRef> {
        return get_physics2d_joint_solver(self, kind);
    }

    pub fn hydrate(&mut self) -> bool {
        return hydrate_physics2d_world(self);
    }

    pub fn invalidate_collider(
        &mut self,
        body: &Ref<RigidBody2D>,
        collider: &Ref<Physics2DCollider>,
    ) -> bool {
        return invalidate_physics2d_collider(self, body, collider);
    }

    pub fn invalidate_joint(&mut self, joint: &Physics2DJointRef) -> bool {
        return invalidate_physics2d_joint(self, joint);
    }

    pub fn is_body_state_valid(&self) -> bool {
        return is_physics2d_body_state_valid(self);
    }

    pub fn is_contact_state_valid(&self) -> bool {
        return is_physics2d_contact_state_valid(self);
    }

    pub fn is_gravity_valid(&self) -> bool {
        return is_physics2d_gravity_valid(self);
    }

    pub fn is_joint_state_valid(&self) -> bool {
        return is_physics2d_joint_state_valid(self);
    }

    pub fn is_pair_joint_suppressed(&self, body_a: i32, body_b: i32) -> bool {
        return is_physics2d_pair_joint_suppressed(self, body_a, body_b);
    }

    pub fn is_previous_timestep_valid(&self) -> bool {
        return is_physics2d_previous_timestep_valid(self);
    }

    pub fn rebuild_joint_collision_suppressions(&mut self) {
        return rebuild_physics2d_joint_collision_suppressions(self);
    }

    pub fn register_built_in_joint_solvers(&mut self) {
        return register_built_in_physics2d_joint_solvers(self);
    }

    pub fn register_joint_solver(&mut self, kind: Kind, solver: Physics2DJointSolverRef) {
        return register_physics2d_joint_solver(self, kind, solver);
    }

    pub fn remove_body(&mut self, body: &Ref<RigidBody2D>) -> bool {
        return remove_physics2d_body(self, body);
    }

    pub fn remove_collider(
        &mut self,
        body: &Ref<RigidBody2D>,
        collider: &Ref<Physics2DCollider>,
    ) -> bool {
        return remove_physics2d_collider(self, body, collider);
    }

    pub fn remove_joint(&mut self, joint: &Physics2DJointRef) -> bool {
        return remove_physics2d_joint(self, joint);
    }

    pub fn set_body_bullet(&mut self, body: &Ref<RigidBody2D>, bullet: bool) -> bool {
        return set_physics2d_body_bullet(self, body, bullet);
    }

    pub fn set_body_fixed_rotation(
        &mut self,
        body: &Ref<RigidBody2D>,
        fixed_rotation: bool,
    ) -> bool {
        return set_physics2d_body_fixed_rotation(self, body, fixed_rotation);
    }

    pub fn set_body_sleep_enabled(&mut self, body: &Ref<RigidBody2D>, sleep_enabled: bool) -> bool {
        return set_physics2d_body_sleep_enabled(self, body, sleep_enabled);
    }

    pub fn set_body_transform(
        &mut self,
        body: &Ref<RigidBody2D>,
        x: f32,
        y: f32,
        angle: f32,
    ) -> bool {
        return set_physics2d_body_transform(self, body, x, y, angle);
    }

    pub fn set_body_type(&mut self, body: &Ref<RigidBody2D>, body_type: Physics2DBodyType) -> bool {
        return set_physics2d_body_type(self, body, body_type);
    }

    pub fn solve_contact_indices_once(&self, indices: &[usize], start: usize, count: usize) {
        return solve_physics2d_contact_indices_once(self, indices, start, count);
    }

    pub fn solve_contacts(&self) {
        return solve_physics2d_contacts(self);
    }

    pub fn solve_contacts_once(&self) {
        return solve_physics2d_contacts_once(self);
    }

    // flight-lint: allow(f64) time accumulation: TS f64 sleep-threshold timing (30 × 1/60 crosses 0.5 differently in f32)
    pub fn step(
        &mut self,
        dt: f64,
        registry: &CollisionRegistry2D,
        guards: Option<&Physics2DGuardState>,
    ) {
        return step_physics2d(self, dt, registry, guards);
    }

    pub fn synchronize_broadphase(&self) {
        return synchronize_physics2d_broadphase(self);
    }

    pub fn synchronize_swept_broadphase(&self, dt: f32) {
        return synchronize_physics2d_swept_broadphase(self, dt);
    }

    // flight-lint: allow(f64) time accumulation: TS f64 sleep-threshold timing (30 × 1/60 crosses 0.5 differently in f32)
    pub fn update_sleep(&mut self, dt: f64) {
        return update_physics2d_sleep(self, dt);
    }

    pub fn warm_start_contact_indices(&self, indices: &[usize], start: usize, count: usize) {
        return warm_start_physics2d_contact_indices(self, indices, start, count);
    }

    pub fn warm_start_contacts(&self) {
        return warm_start_physics2d_contacts(self);
    }
}

impl RigidBody2D {
    pub fn new() -> Ref<RigidBody2D> {
        return create_rigid_body2d();
    }

    pub fn apply_force(&mut self, force_x: f32, force_y: f32) -> bool {
        return apply_physics2d_force(self, force_x, force_y);
    }

    pub fn apply_force_at_point(
        &mut self,
        force_x: f32,
        force_y: f32,
        point_x: f32,
        point_y: f32,
    ) -> bool {
        return apply_physics2d_force_at_point(self, force_x, force_y, point_x, point_y);
    }

    pub fn apply_impulse(
        &mut self,
        body_b: &mut RigidBody2D,
        r_ax: f32,
        r_ay: f32,
        r_bx: f32,
        r_by: f32,
        impulse_x: f32,
        impulse_y: f32,
    ) {
        return apply_physics2d_impulse(self, body_b, r_ax, r_ay, r_bx, r_by, impulse_x, impulse_y);
    }

    pub fn apply_linear_impulse(&mut self, impulse_x: f32, impulse_y: f32) -> bool {
        return apply_physics2d_linear_impulse(self, impulse_x, impulse_y);
    }

    pub fn apply_linear_impulse_at_point(
        &mut self,
        impulse_x: f32,
        impulse_y: f32,
        point_x: f32,
        point_y: f32,
    ) -> bool {
        return apply_physics2d_linear_impulse_at_point(
            self, impulse_x, impulse_y, point_x, point_y,
        );
    }

    pub fn apply_torque(&mut self, torque: f32) -> bool {
        return apply_physics2d_torque(self, torque);
    }

    pub fn assert_not_stepping(&self) {
        return assert_physics2d_body_not_stepping(self);
    }

    pub fn is_pair_awake(&self, b: &RigidBody2D) -> bool {
        return is_rigid_body2d_pair_awake(self, b);
    }

    pub fn is_pair_ordered(&self, b: &RigidBody2D) -> bool {
        return is_physics2d_pair_ordered(self, b);
    }

    pub fn relative_normal_velocity(
        &self,
        body_b: &RigidBody2D,
        point: &Physics2DContactPoint,
        normal_x: f32,
        normal_y: f32,
    ) -> f32 {
        return relative_normal_velocity(self, body_b, point, normal_x, normal_y);
    }

    pub fn sync_to_node2d(&self, node: &Node2DRef) {
        return sync_physics2d_body_to_node2d(self, node);
    }

    pub fn update_mass_data(&mut self) {
        return update_rigid_body2d_mass_data(self);
    }

    pub fn wake(&mut self) {
        return wake_physics2d_body(self);
    }
}
