//! Rust convenience methods for the public physics2d lane (D18): each delegates to its free
//! function.

use flight_collision::{CollisionRegistry2D, CollisionShape2D};
use flight_entity::{Kind, Ref};
use flight_log::LogStateRef;
use flight_scene2d::Node2DRef;
use flight_spatial::{SpatialAabb2D, SpatialIndexBackend2D};

use crate::contract::*;

impl Physics2DCollider {
    pub fn new(
        local: &CollisionShape2D,
        material: &Physics2DMaterial,
        sensor: Option<bool>,
        filter: Option<&Physics2DCollisionFilter>,
    ) -> Ref<Physics2DCollider> {
        return create_physics2d_collider(local, material, sensor, filter);
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
    pub fn new(options: &Physics2DDistanceJointOptions) -> Ref<Physics2DDistanceJoint> {
        return create_physics2d_distance_joint(options);
    }
}

impl Physics2DGearJoint {
    pub fn new(options: &Physics2DGearJointOptions) -> Ref<Physics2DGearJoint> {
        return create_physics2d_gear_joint(options);
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
    pub fn new(options: &Physics2DMouseJointOptions) -> Ref<Physics2DMouseJoint> {
        return create_physics2d_mouse_joint(options);
    }
}

impl Physics2DPrismaticJoint {
    pub fn new(options: &Physics2DPrismaticJointOptions) -> Ref<Physics2DPrismaticJoint> {
        return create_physics2d_prismatic_joint(options);
    }
}

impl Physics2DPulleyJoint {
    pub fn new(options: &Physics2DPulleyJointOptions) -> Ref<Physics2DPulleyJoint> {
        return create_physics2d_pulley_joint(options);
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
    pub fn new(options: &Physics2DRevoluteJointOptions) -> Ref<Physics2DRevoluteJoint> {
        return create_physics2d_revolute_joint(options);
    }
}

impl Physics2DRopeJoint {
    pub fn new(options: &Physics2DRopeJointOptions) -> Ref<Physics2DRopeJoint> {
        return create_physics2d_rope_joint(options);
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
    pub fn new() -> Physics2DSolverConfig {
        return create_physics2d_solver_config();
    }

    pub fn is_valid(&self) -> bool {
        return is_physics2d_solver_config_valid(self);
    }
}

impl Physics2DWeldJoint {
    pub fn new(options: &Physics2DWeldJointOptions) -> Ref<Physics2DWeldJoint> {
        return create_physics2d_weld_joint(options);
    }
}

impl Physics2DWheelJoint {
    pub fn new(options: &Physics2DWheelJointOptions) -> Ref<Physics2DWheelJoint> {
        return create_physics2d_wheel_joint(options);
    }
}

impl Physics2DWorld {
    pub fn new(
        gravity_x: Option<f32>,
        gravity_y: Option<f32>,
        index: Option<SpatialIndexBackend2D>,
    ) -> Physics2DWorld {
        return create_physics2d_world(gravity_x, gravity_y, index);
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

    pub fn explain_step(&self, dt: f32) -> Physics2DStepExplanation {
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

    pub fn step(
        &mut self,
        dt: f32,
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

    pub fn update_sleep(&mut self, dt: f32) {
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
    pub fn new(
        body_type: Physics2DBodyType,
        x: f32,
        y: f32,
        angle: Option<f32>,
    ) -> Ref<RigidBody2D> {
        return create_rigid_body2d(body_type, x, y, angle);
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
