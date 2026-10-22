//! Rust convenience methods for the curated Physics3D public lane. Every method delegates to the
//! free-function contract so both call styles have one implementation.

use flight_collision::{CollisionColliderShape3D, CollisionRegistry3D, CollisionShape3D};
use flight_entity::Ref;
use flight_log::LogStateRef;
use flight_scene3d::Node3DRef;
use flight_spatial::SpatialAabb3D;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use std::collections::HashMap;
    use std::sync::{Arc, RwLock};

    use flight_collision::{
        CollisionSphere3D, register_built_in_collision_face_queries3d,
        register_built_in_collision_pair_tests3d, register_built_in_collision_supports3d,
    };
    use flight_scene3d::{Node3DFields, create_node3d};

    use super::*;

    fn sphere() -> CollisionColliderShape3D {
        CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            radius: 0.5,
        }))
    }

    fn authored_collider() -> Physics3DColliderRef {
        let local = sphere();
        Physics3DCollider::new(&local)
    }

    fn authored_distance_joint() -> Ref<Physics3DDistanceJoint> {
        let joint = Physics3DDistanceJoint::new();
        joint.write().unwrap().joint.body_b = 1;
        joint
    }

    fn registry() -> CollisionRegistry3D {
        let mut registry = CollisionRegistry3D {
            pair_tests: HashMap::new(),
            supports: HashMap::new(),
            face_queries: HashMap::new(),
            test_guard: None,
        };
        register_built_in_collision_supports3d(&mut registry);
        register_built_in_collision_pair_tests3d(&mut registry);
        register_built_in_collision_face_queries3d(&mut registry);
        return registry;
    }

    #[test]
    fn constructors_and_validity_methods_match_their_free_functions() {
        assert_eq!(
            Physics3DWorld::new().gravity_y,
            create_physics_3d_world().gravity_y
        );
        assert_eq!(
            RigidBody3D::new().read().unwrap().body_type,
            create_rigid_body_3d().read().unwrap().body_type
        );
        assert_eq!(
            Physics3DCollider::new(&sphere()).read().unwrap().sensor,
            create_physics_3d_collider(&sphere()).read().unwrap().sensor
        );
        assert_eq!(Physics3DMassData::new(), create_physics_3d_mass_data());
        assert_eq!(
            Physics3DSolverConfig::new(None),
            create_physics_3d_solver_config(None)
        );
        assert!(Physics3DSolverConfig::new(None).is_valid());
        assert_eq!(
            Physics3DQueryFilter::new(),
            create_physics_3d_query_filter()
        );
        assert_eq!(Physics3DQueryResult::new().hit_count, 0);
        assert_eq!(Physics3DRayResult::new().hit_count, 0);
        assert!(!Physics3DShapeCastResult::new().hit);
        let contact = create_physics_3d_contact();
        assert_eq!(
            contact.read().unwrap().is_valid(),
            is_physics_3d_contact_valid(&contact.read().unwrap())
        );
    }

    #[test]
    fn all_joint_constructors_match_their_free_functions() {
        macro_rules! same_kind {
            ($method:expr, $free:expr) => {
                assert_eq!(
                    $method.read().unwrap().joint.kind,
                    $free.read().unwrap().joint.kind
                )
            };
        }
        same_kind!(
            Physics3DBallAndSocketJoint::new(),
            create_physics_3d_ball_and_socket_joint()
        );
        same_kind!(
            Physics3DDistanceJoint::new(),
            create_physics_3d_distance_joint()
        );
        same_kind!(Physics3DFixedJoint::new(), create_physics_3d_fixed_joint());
        same_kind!(Physics3DHingeJoint::new(), create_physics_3d_hinge_joint());
        same_kind!(
            Physics3DSliderJoint::new(),
            create_physics_3d_slider_joint()
        );
        same_kind!(
            Physics3DConeTwistJoint::new(),
            create_physics_3d_cone_twist_joint()
        );
        same_kind!(
            Physics3DGeneric6DofJoint::new(),
            create_physics_3d_generic_6_dof_joint()
        );
    }

    #[test]
    fn collider_mass_reaction_and_debug_methods_delegate_exactly() {
        let body = RigidBody3D::new();
        body.write().unwrap().x = 3.0;
        let method = Physics3DCollider::new(&sphere());
        let free = create_physics_3d_collider(&sphere());
        method
            .write()
            .unwrap()
            .update_world_shape(&body.read().unwrap());
        update_physics_3d_collider_world_shape(&mut free.write().unwrap(), &body.read().unwrap());
        let method_x = match &method.read().unwrap().world {
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(sphere)) => sphere.x,
            _ => unreachable!(),
        };
        let free_x = match &free.read().unwrap().world {
            CollisionColliderShape3D::BuiltIn(CollisionShape3D::Sphere(sphere)) => sphere.x,
            _ => unreachable!(),
        };
        assert_eq!(method_x, free_x);

        let mut method_mass = Physics3DMassData::new();
        let mut free_mass = create_physics_3d_mass_data();
        method_mass.compute_collider(&method.read().unwrap());
        compute_physics_3d_collider_mass_data(&free.read().unwrap(), &mut free_mass);
        assert_eq!(method_mass, free_mass);
        let mut addend = create_physics_3d_mass_data();
        addend.mass = 2.0;
        method_mass.combine(&addend);
        combine_physics_3d_mass_data(&mut free_mass, &addend);
        assert_eq!(method_mass, free_mass);

        let mut reaction = Physics3DJointReaction::new();
        reaction.force_x = 3.0;
        reaction.torque_z = 4.0;
        assert_eq!(
            reaction.force(),
            get_physics_3d_joint_reaction_force(&reaction)
        );
        assert_eq!(
            reaction.torque(),
            get_physics_3d_joint_reaction_torque(&reaction)
        );
        reaction.clear();
        assert_eq!(reaction, create_physics_3d_joint_reaction());

        let world = Physics3DWorld::new();
        let mut method_debug = Physics3DDebugGeometry::new();
        let mut free_debug = create_physics_3d_debug_geometry();
        method_debug.write(&world, None);
        write_physics_3d_debug_geometry(&mut free_debug, &world, None);
        assert_eq!(method_debug.lines, free_debug.lines);
        assert_eq!(method_debug.spheres, free_debug.spheres);
    }

    #[test]
    fn query_methods_match_their_free_functions() {
        let mut world = Physics3DWorld::new();
        let body = RigidBody3D::new();
        world.add_body(&body);
        world.add_collider(&body, &authored_collider());

        let (mut method, mut free) = (
            Physics3DQueryResult::new(),
            create_physics_3d_query_result(),
        );
        method.query_point(&mut world, 0.0, 0.0, 0.0, None);
        query_physics_3d_point(&mut free, &mut world, 0.0, 0.0, 0.0, None);
        assert_eq!(method.hit_count, free.hit_count);
        let region = SpatialAabb3D {
            min_x: -1.0,
            min_y: -1.0,
            min_z: -1.0,
            max_x: 1.0,
            max_y: 1.0,
            max_z: 1.0,
        };
        method.query_region(&mut world, &region, None);
        query_physics_3d_region(&mut free, &mut world, &region, None);
        assert_eq!(method.hit_count, free.hit_count);

        let (mut method, mut free) = (Physics3DRayResult::new(), create_physics_3d_ray_result());
        method.query_ray(&mut world, -2.0, 0.0, 0.0, 1.0, 0.0, 0.0, None, None);
        query_physics_3d_ray(
            &mut free, &mut world, -2.0, 0.0, 0.0, 1.0, 0.0, 0.0, None, None,
        );
        assert_eq!(method.hit_count, free.hit_count);
        method.query_ray_closest(&mut world, -2.0, 0.0, 0.0, 1.0, 0.0, 0.0, None, None);
        query_physics_3d_ray_closest(
            &mut free, &mut world, -2.0, 0.0, 0.0, 1.0, 0.0, 0.0, None, None,
        );
        assert_eq!(method.hits[0].fraction, free.hits[0].fraction);

        let registry = registry();
        let probe = CollisionShape3D::Sphere(CollisionSphere3D {
            x: -2.0,
            y: 0.0,
            z: 0.0,
            radius: 0.25,
        });
        let (mut method, mut free) = (
            Physics3DShapeCastResult::new(),
            create_physics_3d_shape_cast_result(),
        );
        method.query_shape_cast(&mut world, &registry, &probe, 4.0, 0.0, 0.0, None, None);
        query_physics_3d_shape_cast(
            &mut free, &mut world, &registry, &probe, 4.0, 0.0, 0.0, None, None,
        );
        assert_eq!((method.hit, method.fraction), (free.hit, free.fraction));
    }

    #[test]
    fn rigid_body_methods_match_their_free_functions() {
        let method = RigidBody3D::new();
        let free = create_rigid_body_3d();
        {
            let mut a = method.write().unwrap();
            let mut b = free.write().unwrap();
            a.force_x = 3.0;
            b.force_x = 3.0;
            a.clear_forces();
            clear_rigid_body_3d_forces(&mut b);
            a.velocity_x = 2.0;
            b.velocity_x = 2.0;
            a.integrate_pose(0.5);
            integrate_rigid_body_3d_pose(&mut b, 0.5);
            a.integrate_velocity(0.0, -10.0, 0.0, 0.25);
            integrate_rigid_body_3d_velocity(&mut b, 0.0, -10.0, 0.0, 0.25);
            a.refresh_world_inertia();
            refresh_rigid_body_3d_world_inertia(&mut b);
            a.update_mass_data();
            update_rigid_body_3d_mass_data(&mut b);
            assert_eq!((a.x, a.velocity_y), (b.x, b.velocity_y));
            let mut center_a = [0.0; 3];
            let mut center_b = [0.0; 3];
            a.write_world_center(&mut center_a);
            write_rigid_body_3d_world_center(&b, &mut center_b);
            assert_eq!(center_a, center_b);
            assert_eq!(a.is_pair_awake(&b), is_rigid_body_3d_pair_awake(&a, &b));
            a.assert_not_stepping();
        }
        let node: Node3DFields = create_node3d(None);
        let node: Node3DRef = Arc::new(RwLock::new(node));
        method.read().unwrap().sync_to_node_3d(&node);
        assert_eq!(node.read().unwrap().node3d_fields().position.x, 1.0);
    }

    #[test]
    fn world_mutation_and_introspection_methods_delegate_exactly() {
        let mut world = Physics3DWorld::new();
        world.register_built_in_joint_solvers();
        let a = RigidBody3D::new();
        let b = RigidBody3D::new();
        assert_eq!(world.add_body(&a), 0);
        assert_eq!(world.add_body(&b), 1);
        let collider = authored_collider();
        world.add_collider(&a, &collider);
        let joint = authored_distance_joint();
        world.add_joint(&joint);
        let erased: Physics3DJointRef = joint.clone();
        world.assert_not_stepping();
        assert!(world.find_body(0).is_some());
        assert!(
            world
                .get_joint_solver(PHYSICS_3D_DISTANCE_JOINT_KIND)
                .is_some()
        );
        let mut joint_explanations = Vec::new();
        explain_physics_3d_joints(&mut joint_explanations, &world);
        assert_eq!(world.explain_joints(), joint_explanations);
        let mut step_explanation = Physics3DStepExplanation::default();
        explain_physics_3d_step(&mut step_explanation, &world, 1.0 / 60.0);
        assert_eq!(world.explain_step(1.0 / 60.0), step_explanation);
        let collision_registry = registry();
        let mut collision_explanation = Physics3DCollisionExplanation::default();
        explain_physics_3d_collision(&mut collision_explanation, &world, &collision_registry);
        assert_eq!(
            world.explain_collision(&collision_registry),
            collision_explanation
        );
        assert!(world.is_body_state_valid());
        assert!(world.is_collider_state_valid());
        assert!(world.is_contact_state_valid());
        assert!(world.is_gravity_valid());
        assert!(world.is_joint_state_valid());
        assert!(world.invalidate_collider(&a, &collider));
        assert!(world.invalidate_joint(&erased));
        assert!(world.set_body_bullet(&a, true));
        assert!(world.set_body_sleep_enabled(&a, false));
        assert!(world.set_body_fixed_rotation(&a, true));
        assert!(world.set_body_transform(&a, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0));
        assert!(world.set_body_type(&b, Physics3DBodyType::Kinematic));
        world.rebuild_joint_collision_suppressions();
        world.synchronize_broadphase();
        world.synchronize_swept_broadphase(1.0 / 60.0);
        world.build_solve_islands();
        world.update_sleep(1.0 / 60.0);
        world.step(&registry(), 1.0 / 60.0, None);
        assert!(world.hydrate());
        assert!(world.remove_joint(&erased));
        assert!(world.remove_collider(&a, &collider));
        assert!(world.remove_body(&b));
    }

    #[test]
    fn guard_state_methods_delegate_exactly() {
        let log_state: LogStateRef = Arc::new(RwLock::new(flight_log::create_log_state()));
        let clock: Physics3DGuardClock = Arc::new(|| 0.0);
        let mut state = Physics3DGuardState::default();
        state.enable(log_state, clock);
        assert!(state.are_enabled());
        state.disable();
        assert!(!state.are_enabled());
    }
}

impl Physics3DBallAndSocketJoint {
    pub fn new() -> Ref<Physics3DBallAndSocketJoint> {
        create_physics_3d_ball_and_socket_joint()
    }
}

impl Physics3DCollider {
    pub fn new(local: &CollisionColliderShape3D) -> Physics3DColliderRef {
        create_physics_3d_collider(local)
    }

    pub fn update_world_shape(&mut self, body: &RigidBody3D) {
        update_physics_3d_collider_world_shape(self, body)
    }
}

impl Physics3DConeTwistJoint {
    pub fn new() -> Ref<Physics3DConeTwistJoint> {
        create_physics_3d_cone_twist_joint()
    }
}

impl Physics3DContact {
    pub fn is_valid(&self) -> bool {
        is_physics_3d_contact_valid(self)
    }
}

impl Physics3DDebugGeometry {
    pub fn new() -> Physics3DDebugGeometry {
        create_physics_3d_debug_geometry()
    }

    pub fn write(
        &mut self,
        world: &Physics3DWorld,
        options: Option<&Physics3DDebugGeometryOptions>,
    ) {
        write_physics_3d_debug_geometry(self, world, options)
    }
}

impl Physics3DDistanceJoint {
    pub fn new() -> Ref<Physics3DDistanceJoint> {
        create_physics_3d_distance_joint()
    }
}

impl Physics3DFixedJoint {
    pub fn new() -> Ref<Physics3DFixedJoint> {
        create_physics_3d_fixed_joint()
    }
}

impl Physics3DGeneric6DofJoint {
    pub fn new() -> Ref<Physics3DGeneric6DofJoint> {
        create_physics_3d_generic_6_dof_joint()
    }
}

impl Physics3DGuardState {
    pub fn are_enabled(&self) -> bool {
        are_physics_3d_guards_enabled(self)
    }

    pub fn disable(&mut self) {
        disable_physics_3d_guards(self)
    }

    pub fn enable(&mut self, log_state: LogStateRef, clock: Physics3DGuardClock) {
        enable_physics_3d_guards(self, log_state, clock)
    }
}

impl Physics3DHingeJoint {
    pub fn new() -> Ref<Physics3DHingeJoint> {
        create_physics_3d_hinge_joint()
    }
}

impl Physics3DJointReaction {
    pub fn new() -> Physics3DJointReaction {
        create_physics_3d_joint_reaction()
    }

    pub fn clear(&mut self) {
        clear_physics_3d_joint_reaction(self)
    }

    pub fn force(&self) -> f32 {
        get_physics_3d_joint_reaction_force(self)
    }

    pub fn torque(&self) -> f32 {
        get_physics_3d_joint_reaction_torque(self)
    }

    pub fn write(&mut self, world: &Physics3DWorld, joint: &Physics3DJointRef, dt: f32) -> bool {
        write_physics_3d_joint_reaction(self, world, joint, dt)
    }
}

impl Physics3DMassData {
    pub fn new() -> Physics3DMassData {
        create_physics_3d_mass_data()
    }

    pub fn combine(&mut self, addend: &Physics3DMassData) {
        combine_physics_3d_mass_data(self, addend)
    }

    pub fn compute_collider(&mut self, collider: &Physics3DCollider) {
        compute_physics_3d_collider_mass_data(collider, self)
    }
}

impl Physics3DQueryFilter {
    pub fn new() -> Physics3DQueryFilter {
        create_physics_3d_query_filter()
    }
}

impl Physics3DQueryResult {
    pub fn new() -> Physics3DQueryResult {
        create_physics_3d_query_result()
    }

    pub fn query_point(
        &mut self,
        world: &mut Physics3DWorld,
        x: f32,
        y: f32,
        z: f32,
        filter: Option<&Physics3DQueryFilter>,
    ) {
        query_physics_3d_point(self, world, x, y, z, filter)
    }

    pub fn query_region(
        &mut self,
        world: &mut Physics3DWorld,
        region: &SpatialAabb3D,
        filter: Option<&Physics3DQueryFilter>,
    ) {
        query_physics_3d_region(self, world, region, filter)
    }
}

impl Physics3DRayResult {
    pub fn new() -> Physics3DRayResult {
        create_physics_3d_ray_result()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn query_ray(
        &mut self,
        world: &mut Physics3DWorld,
        origin_x: f32,
        origin_y: f32,
        origin_z: f32,
        direction_x: f32,
        direction_y: f32,
        direction_z: f32,
        max_fraction: Option<f32>,
        filter: Option<&Physics3DQueryFilter>,
    ) {
        query_physics_3d_ray(
            self,
            world,
            origin_x,
            origin_y,
            origin_z,
            direction_x,
            direction_y,
            direction_z,
            max_fraction,
            filter,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn query_ray_closest(
        &mut self,
        world: &mut Physics3DWorld,
        origin_x: f32,
        origin_y: f32,
        origin_z: f32,
        direction_x: f32,
        direction_y: f32,
        direction_z: f32,
        max_fraction: Option<f32>,
        filter: Option<&Physics3DQueryFilter>,
    ) {
        query_physics_3d_ray_closest(
            self,
            world,
            origin_x,
            origin_y,
            origin_z,
            direction_x,
            direction_y,
            direction_z,
            max_fraction,
            filter,
        )
    }
}

impl Physics3DShapeCastResult {
    pub fn new() -> Physics3DShapeCastResult {
        create_physics_3d_shape_cast_result()
    }

    #[allow(clippy::too_many_arguments)]
    pub fn query_shape_cast(
        &mut self,
        world: &mut Physics3DWorld,
        registry: &CollisionRegistry3D,
        shape: &CollisionShape3D,
        dx: f32,
        dy: f32,
        dz: f32,
        max_fraction: Option<f32>,
        filter: Option<&Physics3DQueryFilter>,
    ) {
        query_physics_3d_shape_cast(
            self,
            world,
            registry,
            shape,
            dx,
            dy,
            dz,
            max_fraction,
            filter,
        )
    }
}

impl Physics3DSliderJoint {
    pub fn new() -> Ref<Physics3DSliderJoint> {
        create_physics_3d_slider_joint()
    }
}

impl Physics3DSolverConfig {
    pub fn new(options: Option<&Physics3DSolverConfigOptions>) -> Physics3DSolverConfig {
        create_physics_3d_solver_config(options)
    }

    pub fn is_valid(&self) -> bool {
        is_physics_3d_solver_config_valid(self)
    }
}

impl Physics3DWorld {
    pub fn new() -> Physics3DWorld {
        create_physics_3d_world()
    }

    pub fn add_body(&mut self, body: &RigidBody3DRef) -> i32 {
        add_physics_3d_body(self, body)
    }

    pub fn add_collider(&mut self, body: &RigidBody3DRef, collider: &Physics3DColliderRef) {
        add_physics_3d_collider(self, body, collider)
    }

    pub fn add_joint<T: Physics3DJoint + 'static>(&mut self, joint: &Ref<T>) {
        add_physics_3d_joint(self, joint)
    }

    pub fn assert_not_stepping(&self) {
        assert_physics_3d_world_not_stepping(self)
    }

    pub fn build_solve_islands(&mut self) {
        build_physics_3d_solve_islands(self)
    }

    pub fn explain_collision(
        &self,
        registry: &CollisionRegistry3D,
    ) -> Physics3DCollisionExplanation {
        let mut out = Physics3DCollisionExplanation::default();
        explain_physics_3d_collision(&mut out, self, registry);
        out
    }

    pub fn explain_joints(&self) -> Vec<Physics3DJointExplanation> {
        let mut out = Vec::new();
        explain_physics_3d_joints(&mut out, self);
        out
    }

    pub fn explain_step(&self, dt: f32) -> Physics3DStepExplanation {
        let mut out = Physics3DStepExplanation::default();
        explain_physics_3d_step(&mut out, self, dt);
        out
    }

    pub fn find_body(&self, index: i32) -> Option<RigidBody3DRef> {
        find_physics_3d_body(self, index)
    }

    pub fn get_joint_solver(&self, kind: &str) -> Option<&Physics3DJointSolver> {
        get_physics_3d_joint_solver(self, kind)
    }

    pub fn hydrate(&mut self) -> bool {
        hydrate_physics_3d_world(self)
    }

    pub fn invalidate_collider(
        &mut self,
        body: &RigidBody3DRef,
        collider: &Physics3DColliderRef,
    ) -> bool {
        invalidate_physics_3d_collider(self, body, collider)
    }

    pub fn invalidate_joint(&mut self, joint: &Physics3DJointRef) -> bool {
        invalidate_physics_3d_joint(self, joint)
    }

    pub fn is_body_state_valid(&self) -> bool {
        is_physics_3d_body_state_valid(self)
    }

    pub fn is_collider_state_valid(&self) -> bool {
        is_physics_3d_collider_state_valid(self)
    }

    pub fn is_contact_state_valid(&self) -> bool {
        is_physics_3d_contact_state_valid(self)
    }

    pub fn is_gravity_valid(&self) -> bool {
        is_physics_3d_gravity_valid(self)
    }

    pub fn is_joint_state_valid(&self) -> bool {
        is_physics_3d_joint_state_valid(self)
    }

    pub fn is_pair_joint_suppressed(&self, body_a: i32, body_b: i32) -> bool {
        is_physics_3d_pair_joint_suppressed(self, body_a, body_b)
    }

    pub fn rebuild_joint_collision_suppressions(&mut self) {
        rebuild_physics_3d_joint_collision_suppressions(self)
    }

    pub fn register_built_in_joint_solvers(&mut self) {
        register_built_in_physics_3d_joint_solvers(self)
    }

    pub fn register_joint_solver(&mut self, kind: String, solver: Physics3DJointSolver) {
        register_physics_3d_joint_solver(self, kind, solver)
    }

    pub fn remove_body(&mut self, body: &RigidBody3DRef) -> bool {
        remove_physics_3d_body(self, body)
    }

    pub fn remove_collider(
        &mut self,
        body: &RigidBody3DRef,
        collider: &Physics3DColliderRef,
    ) -> bool {
        remove_physics_3d_collider(self, body, collider)
    }

    pub fn remove_joint(&mut self, joint: &Physics3DJointRef) -> bool {
        remove_physics_3d_joint(self, joint)
    }

    pub fn set_body_bullet(&mut self, body: &RigidBody3DRef, bullet: bool) -> bool {
        set_physics_3d_body_bullet(body, bullet)
    }

    pub fn set_body_fixed_rotation(&mut self, body: &RigidBody3DRef, fixed_rotation: bool) -> bool {
        set_physics_3d_body_fixed_rotation(self, body, fixed_rotation)
    }

    pub fn set_body_sleep_enabled(&mut self, body: &RigidBody3DRef, sleep_enabled: bool) -> bool {
        set_physics_3d_body_sleep_enabled(body, sleep_enabled)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_body_transform(
        &mut self,
        body: &RigidBody3DRef,
        x: f32,
        y: f32,
        z: f32,
        orientation_x: f32,
        orientation_y: f32,
        orientation_z: f32,
        orientation_w: f32,
    ) -> bool {
        set_physics_3d_body_transform(
            self,
            body,
            x,
            y,
            z,
            orientation_x,
            orientation_y,
            orientation_z,
            orientation_w,
        )
    }

    pub fn set_body_type(&mut self, body: &RigidBody3DRef, body_type: Physics3DBodyType) -> bool {
        set_physics_3d_body_type(self, body, body_type)
    }

    pub fn step(
        &mut self,
        registry: &CollisionRegistry3D,
        dt: f32,
        guards: Option<&Physics3DGuardState>,
    ) {
        step_physics_3d(self, registry, dt, guards)
    }

    pub fn synchronize_broadphase(&mut self) {
        synchronize_physics_3d_broadphase(self)
    }

    pub fn synchronize_swept_broadphase(&mut self, dt: f32) {
        synchronize_physics_3d_swept_broadphase(self, dt)
    }

    pub fn update_sleep(&mut self, dt: f32) {
        update_physics_3d_sleep(self, dt)
    }
}

impl RigidBody3D {
    pub fn new() -> RigidBody3DRef {
        create_rigid_body_3d()
    }

    pub fn assert_not_stepping(&self) {
        assert_physics_3d_body_not_stepping(self)
    }

    pub fn clear_forces(&mut self) {
        clear_rigid_body_3d_forces(self)
    }

    pub fn integrate_pose(&mut self, dt: f32) {
        integrate_rigid_body_3d_pose(self, dt)
    }

    pub fn integrate_velocity(&mut self, gravity_x: f32, gravity_y: f32, gravity_z: f32, dt: f32) {
        integrate_rigid_body_3d_velocity(self, gravity_x, gravity_y, gravity_z, dt)
    }

    pub fn is_pair_awake(&self, other: &RigidBody3D) -> bool {
        is_rigid_body_3d_pair_awake(self, other)
    }

    pub fn refresh_world_inertia(&mut self) {
        refresh_rigid_body_3d_world_inertia(self)
    }

    pub fn sync_to_node_3d(&self, node: &Node3DRef) {
        sync_physics_3d_body_to_node_3d(self, node)
    }

    pub fn update_mass_data(&mut self) {
        update_rigid_body_3d_mass_data(self)
    }

    pub fn write_world_center(&self, out: &mut [f32; 3]) {
        write_rigid_body_3d_world_center(self, out)
    }
}
