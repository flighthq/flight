// flight-lint: allow-file(f64) D1: command scalars are the wire's IEEE doubles and the step dt is flight-physics2d's f64 timestep
//! Rust convenience methods for the public physics2d-abi lane (D18): each delegates to its free
//! function. Methods sit on the function's primary (out or first) argument.

use flight_collision::CollisionShape2D;
use flight_entity::Uint32Array;
use flight_physics2d::{
    Physics2DCollider, Physics2DJoint, Physics2DQueryFilter, Physics2DSolverConfig, RigidBody2D,
};
use flight_spatial::SpatialAabb2D;

use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use flight_collision::CollisionCircle2D;
    use flight_physics2d::{
        Physics2DBodyType, Physics2DDistanceJointOptions, Physics2DMaterial,
        create_physics2d_collider, create_physics2d_distance_joint, create_physics2d_solver_config,
        create_rigid_body2d,
    };

    use super::*;

    fn circle() -> CollisionShape2D {
        return CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 0.5,
        });
    }

    // One ABI world holding body 1 with collider 1, both read through sugar and free functions.
    fn scene() -> (Physics2DAbi, Physics2DAbiWorldHandle) {
        let abi = Physics2DAbi::new();
        let handle = abi.create_world();
        let mut commands = Physics2DAbiCommandBuffer::new(Some(1024));
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let material = Physics2DMaterial {
            density: 1.0,
            friction: 0.3,
            restitution: 0.0,
        };
        let collider = create_physics2d_collider(&circle(), &material, None, None);
        assert!(commands.write_set_body_command(1, &body.read().unwrap()));
        assert!(commands.write_set_collider_command(1, 1, &collider.read().unwrap()));
        assert!(Physics2DAbiExecutionResult::new().execute_commands(&abi, handle, &commands));
        return (abi, handle);
    }

    // Writes the same record through the method and the free function and compares the streams.
    fn same_stream(
        method: impl FnOnce(&mut Physics2DAbiCommandBuffer) -> bool,
        free: impl FnOnce(&mut Physics2DAbiCommandBuffer) -> bool,
    ) {
        let mut a = create_physics2d_abi_command_buffer(Some(512));
        let mut b = create_physics2d_abi_command_buffer(Some(512));
        assert_eq!(method(&mut a), free(&mut b));
        assert_eq!(a.byte_length, b.byte_length);
        assert_eq!(a.command_count, b.command_count);
        assert_eq!(a.data, b.data);
    }

    #[test]
    fn abi_new_and_new_reference_match_the_constructors() {
        assert_eq!(
            Physics2DAbi::new().capabilities,
            create_physics2d_abi().capabilities
        );
        assert_eq!(
            Physics2DAbi::new_reference().version,
            create_reference_physics2d_abi().version
        );
    }

    #[test]
    fn abi_world_lifecycle_matches_the_free_functions() {
        let abi = Physics2DAbi::new();
        let handle = abi.create_world();
        assert!(handle > 0);
        assert_eq!(
            abi.get_world_status(handle),
            get_physics2d_abi_world_status(&abi, handle)
        );
        assert_eq!(
            abi.step_world(handle, 1.0 / 60.0, None),
            Physics2DAbiStepStatus::Complete
        );
        assert_eq!(abi.destroy_world(handle), true);
        assert_eq!(
            abi.destroy_world(handle),
            destroy_physics2d_abi_world(&abi, handle)
        );
        assert_eq!(
            abi.step_world(handle, 1.0 / 60.0, None),
            step_physics2d_abi_world(&abi, handle, 1.0 / 60.0, None)
        );
    }

    #[test]
    fn body_buffer_read_bodies_matches_the_free_function() {
        let (abi, handle) = scene();
        let mut a = Physics2DAbiBodyBuffer::new(2);
        let mut b = create_physics2d_abi_body_buffer(2);
        assert_eq!(
            a.read_bodies(&abi, handle, None),
            read_physics2d_abi_bodies(&mut b, &abi, handle, None)
        );
        assert_eq!((a.count, &a.ids, &a.values), (b.count, &b.ids, &b.values));
    }

    #[test]
    fn command_buffer_new_clear_and_remaining_match_the_free_functions() {
        let mut buffer = Physics2DAbiCommandBuffer::new(Some(64));
        assert_eq!(buffer.data.len(), 64);
        assert!(buffer.write_set_gravity_command(0.0, -9.81));
        assert_eq!(
            buffer.remaining_byte_length(),
            get_physics2d_abi_command_buffer_remaining_byte_length(&buffer)
        );
        buffer.clear();
        let fresh = create_physics2d_abi_command_buffer(Some(64));
        // Clearing rewrites the header only; bytes past it are dead until overwritten.
        let header = PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH;
        assert_eq!(
            (
                buffer.byte_length,
                buffer.command_count,
                &buffer.data[..header]
            ),
            (
                fresh.byte_length,
                fresh.command_count,
                &fresh.data[..header]
            )
        );
    }

    #[test]
    fn command_buffer_body_writers_match_the_free_functions() {
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 1.0, 2.0, None);
        let body = body.read().unwrap();
        same_stream(
            |o| o.write_set_body_command(3, &body),
            |o| write_physics2d_abi_set_body_command(o, 3, &body),
        );
        same_stream(
            |o| o.write_destroy_body_command(3),
            |o| write_physics2d_abi_destroy_body_command(o, 3),
        );
        same_stream(
            |o| o.write_wake_body_command(3),
            |o| write_physics2d_abi_wake_body_command(o, 3),
        );
        same_stream(
            |o| o.write_apply_force_command(3, 1.0, 2.0),
            |o| write_physics2d_abi_apply_force_command(o, 3, 1.0, 2.0),
        );
        same_stream(
            |o| o.write_apply_force_at_point_command(3, 1.0, 2.0, 3.0, 4.0),
            |o| write_physics2d_abi_apply_force_at_point_command(o, 3, 1.0, 2.0, 3.0, 4.0),
        );
        same_stream(
            |o| o.write_apply_linear_impulse_command(3, 1.0, 2.0),
            |o| write_physics2d_abi_apply_linear_impulse_command(o, 3, 1.0, 2.0),
        );
        same_stream(
            |o| o.write_apply_linear_impulse_at_point_command(3, 1.0, 2.0, 3.0, 4.0),
            |o| write_physics2d_abi_apply_linear_impulse_at_point_command(o, 3, 1.0, 2.0, 3.0, 4.0),
        );
        same_stream(
            |o| o.write_apply_torque_command(3, 5.0),
            |o| write_physics2d_abi_apply_torque_command(o, 3, 5.0),
        );
    }

    #[test]
    fn command_buffer_world_writers_match_the_free_functions() {
        let material = Physics2DMaterial {
            density: 1.0,
            friction: 0.3,
            restitution: 0.0,
        };
        let collider = create_physics2d_collider(&circle(), &material, None, None);
        let collider = collider.read().unwrap();
        let mut options = Physics2DDistanceJointOptions::default();
        options.base.body_b = 1;
        options.length = 1.0;
        let joint = create_physics2d_distance_joint(&options);
        let joint = joint.read().unwrap();
        let config = create_physics2d_solver_config(None);
        same_stream(
            |o| o.write_set_gravity_command(1.0, 2.0),
            |o| write_physics2d_abi_set_gravity_command(o, 1.0, 2.0),
        );
        same_stream(
            |o| o.write_set_solver_config_command(&config),
            |o| write_physics2d_abi_set_solver_config_command(o, &config),
        );
        same_stream(
            |o| o.write_set_collider_command(2, 1, &collider),
            |o| write_physics2d_abi_set_collider_command(o, 2, 1, &collider),
        );
        same_stream(
            |o| o.write_destroy_collider_command(2),
            |o| write_physics2d_abi_destroy_collider_command(o, 2),
        );
        same_stream(
            |o| o.write_set_joint_command(4, 1, 2, &*joint),
            |o| write_physics2d_abi_set_joint_command(o, 4, 1, 2, &*joint),
        );
        same_stream(
            |o| o.write_destroy_joint_command(4),
            |o| write_physics2d_abi_destroy_joint_command(o, 4),
        );
    }

    #[test]
    fn contact_and_joint_buffers_read_like_the_free_functions() {
        let (abi, handle) = scene();
        let mut a = Physics2DAbiContactBuffer::new(2, 4);
        let mut b = create_physics2d_abi_contact_buffer(2, 4);
        assert_eq!(
            a.read_contacts(&abi, handle, Physics2DAbiContactSelection::All),
            read_physics2d_abi_contacts(&mut b, &abi, handle, Physics2DAbiContactSelection::All)
        );
        assert_eq!((a.count, a.required_count), (b.count, b.required_count));
        let mut c = Physics2DAbiJointBuffer::new(2);
        let mut d = create_physics2d_abi_joint_buffer(2);
        assert_eq!(
            c.read_joints(&abi, handle),
            read_physics2d_abi_joints(&mut d, &abi, handle)
        );
        assert_eq!((c.count, c.required_count), (d.count, d.required_count));
    }

    #[test]
    fn execution_result_new_matches_the_constructor() {
        let a = Physics2DAbiExecutionResult::new();
        let b = create_physics2d_abi_execution_result();
        assert_eq!((a.status, a.byte_offset), (b.status, b.byte_offset));
    }

    #[test]
    fn query_buffer_queries_match_the_free_functions() {
        let (abi, handle) = scene();
        let region = SpatialAabb2D {
            min_x: -1.0,
            min_y: -1.0,
            max_x: 1.0,
            max_y: 1.0,
        };
        let check = |method: &dyn Fn(&mut Physics2DAbiQueryBuffer) -> bool,
                     free: &dyn Fn(&mut Physics2DAbiQueryBuffer) -> bool| {
            let mut a = Physics2DAbiQueryBuffer::new(4);
            let mut b = create_physics2d_abi_query_buffer(4);
            assert_eq!(method(&mut a), free(&mut b));
            assert_eq!(
                (a.count, &a.body_ids, &a.values),
                (b.count, &b.body_ids, &b.values)
            );
            assert_eq!(a.count, 1);
        };
        check(&|o| o.query_point(&abi, handle, 0.0, 0.0, None), &|o| {
            query_physics2d_abi_point(o, &abi, handle, 0.0, 0.0, None)
        });
        check(
            &|o| o.query_ray(&abi, handle, -5.0, 0.0, 1.0, 0.0, None, None),
            &|o| query_physics2d_abi_ray(o, &abi, handle, -5.0, 0.0, 1.0, 0.0, None, None),
        );
        check(
            &|o| o.query_ray_closest(&abi, handle, -5.0, 0.0, 1.0, 0.0, None, None),
            &|o| query_physics2d_abi_ray_closest(o, &abi, handle, -5.0, 0.0, 1.0, 0.0, None, None),
        );
        check(&|o| o.query_region(&abi, handle, &region, None), &|o| {
            query_physics2d_abi_region(o, &abi, handle, &region, None)
        });
        let probe = CollisionShape2D::Circle(CollisionCircle2D {
            x: -5.0,
            y: 0.0,
            radius: 0.25,
        });
        check(
            &|o| o.query_shape_cast(&abi, handle, &probe, 10.0, 0.0, None, None),
            &|o| query_physics2d_abi_shape_cast(o, &abi, handle, &probe, 10.0, 0.0, None, None),
        );
    }
}

impl Physics2DAbi {
    pub fn create_world(&self) -> Physics2DAbiWorldHandle {
        return create_physics2d_abi_world(self);
    }

    pub fn new() -> Physics2DAbi {
        return create_physics2d_abi();
    }

    pub fn destroy_world(&self, world: Physics2DAbiWorldHandle) -> bool {
        return destroy_physics2d_abi_world(self, world);
    }

    pub fn get_world_status(&self, world: Physics2DAbiWorldHandle) -> Physics2DAbiWorldStatus {
        return get_physics2d_abi_world_status(self, world);
    }

    pub fn new_reference() -> Physics2DAbi {
        return create_reference_physics2d_abi();
    }

    pub fn step_world(
        &self,
        world: Physics2DAbiWorldHandle,
        dt: f64,
        hooks: Option<&Physics2DAbiContactHooks>,
    ) -> Physics2DAbiStepStatus {
        return step_physics2d_abi_world(self, world, dt, hooks);
    }
}

impl Physics2DAbiBodyBuffer {
    pub fn new(capacity: usize) -> Physics2DAbiBodyBuffer {
        return create_physics2d_abi_body_buffer(capacity);
    }

    pub fn read_bodies(
        &mut self,
        abi: &Physics2DAbi,
        world: Physics2DAbiWorldHandle,
        body_ids: Option<&Uint32Array>,
    ) -> bool {
        return read_physics2d_abi_bodies(self, abi, world, body_ids);
    }
}

impl Physics2DAbiCommandBuffer {
    pub fn new(byte_capacity: Option<usize>) -> Physics2DAbiCommandBuffer {
        return create_physics2d_abi_command_buffer(byte_capacity);
    }

    pub fn clear(&mut self) {
        clear_physics2d_abi_command_buffer(self);
    }

    pub fn remaining_byte_length(&self) -> usize {
        return get_physics2d_abi_command_buffer_remaining_byte_length(self);
    }

    pub fn write_apply_force_at_point_command(
        &mut self,
        body_id: Physics2DAbiObjectId,
        x: f64,
        y: f64,
        point_x: f64,
        point_y: f64,
    ) -> bool {
        return write_physics2d_abi_apply_force_at_point_command(
            self, body_id, x, y, point_x, point_y,
        );
    }

    pub fn write_apply_force_command(
        &mut self,
        body_id: Physics2DAbiObjectId,
        x: f64,
        y: f64,
    ) -> bool {
        return write_physics2d_abi_apply_force_command(self, body_id, x, y);
    }

    pub fn write_apply_linear_impulse_at_point_command(
        &mut self,
        body_id: Physics2DAbiObjectId,
        x: f64,
        y: f64,
        point_x: f64,
        point_y: f64,
    ) -> bool {
        return write_physics2d_abi_apply_linear_impulse_at_point_command(
            self, body_id, x, y, point_x, point_y,
        );
    }

    pub fn write_apply_linear_impulse_command(
        &mut self,
        body_id: Physics2DAbiObjectId,
        x: f64,
        y: f64,
    ) -> bool {
        return write_physics2d_abi_apply_linear_impulse_command(self, body_id, x, y);
    }

    pub fn write_apply_torque_command(
        &mut self,
        body_id: Physics2DAbiObjectId,
        torque: f64,
    ) -> bool {
        return write_physics2d_abi_apply_torque_command(self, body_id, torque);
    }

    pub fn write_destroy_body_command(&mut self, body_id: Physics2DAbiObjectId) -> bool {
        return write_physics2d_abi_destroy_body_command(self, body_id);
    }

    pub fn write_destroy_collider_command(&mut self, collider_id: Physics2DAbiObjectId) -> bool {
        return write_physics2d_abi_destroy_collider_command(self, collider_id);
    }

    pub fn write_destroy_joint_command(&mut self, joint_id: Physics2DAbiObjectId) -> bool {
        return write_physics2d_abi_destroy_joint_command(self, joint_id);
    }

    pub fn write_set_body_command(
        &mut self,
        body_id: Physics2DAbiObjectId,
        body: &RigidBody2D,
    ) -> bool {
        return write_physics2d_abi_set_body_command(self, body_id, body);
    }

    pub fn write_set_collider_command(
        &mut self,
        collider_id: Physics2DAbiObjectId,
        body_id: Physics2DAbiObjectId,
        collider: &Physics2DCollider,
    ) -> bool {
        return write_physics2d_abi_set_collider_command(self, collider_id, body_id, collider);
    }

    pub fn write_set_gravity_command(&mut self, x: f64, y: f64) -> bool {
        return write_physics2d_abi_set_gravity_command(self, x, y);
    }

    // flight-lint: allow(contract-vocabulary) D16: the open joint family is read as &dyn Physics2DJoint
    pub fn write_set_joint_command(
        &mut self,
        joint_id: Physics2DAbiObjectId,
        body_a_id: Physics2DAbiObjectId,
        body_b_id: Physics2DAbiObjectId,
        joint: &dyn Physics2DJoint,
    ) -> bool {
        return write_physics2d_abi_set_joint_command(self, joint_id, body_a_id, body_b_id, joint);
    }

    pub fn write_set_solver_config_command(&mut self, config: &Physics2DSolverConfig) -> bool {
        return write_physics2d_abi_set_solver_config_command(self, config);
    }

    pub fn write_wake_body_command(&mut self, body_id: Physics2DAbiObjectId) -> bool {
        return write_physics2d_abi_wake_body_command(self, body_id);
    }
}

impl Physics2DAbiContactBuffer {
    pub fn new(contact_capacity: usize, point_capacity: usize) -> Physics2DAbiContactBuffer {
        return create_physics2d_abi_contact_buffer(contact_capacity, point_capacity);
    }

    pub fn read_contacts(
        &mut self,
        abi: &Physics2DAbi,
        world: Physics2DAbiWorldHandle,
        selection: Physics2DAbiContactSelection,
    ) -> bool {
        return read_physics2d_abi_contacts(self, abi, world, selection);
    }
}

impl Physics2DAbiExecutionResult {
    pub fn new() -> Physics2DAbiExecutionResult {
        return create_physics2d_abi_execution_result();
    }

    pub fn execute_commands(
        &mut self,
        abi: &Physics2DAbi,
        world: Physics2DAbiWorldHandle,
        commands: &Physics2DAbiCommandBuffer,
    ) -> bool {
        return execute_physics2d_abi_commands(self, abi, world, commands);
    }
}

impl Physics2DAbiJointBuffer {
    pub fn new(capacity: usize) -> Physics2DAbiJointBuffer {
        return create_physics2d_abi_joint_buffer(capacity);
    }

    pub fn read_joints(&mut self, abi: &Physics2DAbi, world: Physics2DAbiWorldHandle) -> bool {
        return read_physics2d_abi_joints(self, abi, world);
    }
}

impl Physics2DAbiQueryBuffer {
    pub fn new(capacity: usize) -> Physics2DAbiQueryBuffer {
        return create_physics2d_abi_query_buffer(capacity);
    }

    pub fn query_point(
        &mut self,
        abi: &Physics2DAbi,
        world: Physics2DAbiWorldHandle,
        x: f32,
        y: f32,
        filter: Option<&Physics2DQueryFilter>,
    ) -> bool {
        return query_physics2d_abi_point(self, abi, world, x, y, filter);
    }

    pub fn query_ray(
        &mut self,
        abi: &Physics2DAbi,
        world: Physics2DAbiWorldHandle,
        origin_x: f32,
        origin_y: f32,
        direction_x: f32,
        direction_y: f32,
        max_fraction: Option<f32>,
        filter: Option<&Physics2DQueryFilter>,
    ) -> bool {
        return query_physics2d_abi_ray(
            self,
            abi,
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
        abi: &Physics2DAbi,
        world: Physics2DAbiWorldHandle,
        origin_x: f32,
        origin_y: f32,
        direction_x: f32,
        direction_y: f32,
        max_fraction: Option<f32>,
        filter: Option<&Physics2DQueryFilter>,
    ) -> bool {
        return query_physics2d_abi_ray_closest(
            self,
            abi,
            world,
            origin_x,
            origin_y,
            direction_x,
            direction_y,
            max_fraction,
            filter,
        );
    }

    pub fn query_region(
        &mut self,
        abi: &Physics2DAbi,
        world: Physics2DAbiWorldHandle,
        region: &SpatialAabb2D,
        filter: Option<&Physics2DQueryFilter>,
    ) -> bool {
        return query_physics2d_abi_region(self, abi, world, region, filter);
    }

    pub fn query_shape_cast(
        &mut self,
        abi: &Physics2DAbi,
        world: Physics2DAbiWorldHandle,
        shape: &CollisionShape2D,
        dx: f32,
        dy: f32,
        max_fraction: Option<f32>,
        filter: Option<&Physics2DQueryFilter>,
    ) -> bool {
        return query_physics2d_abi_shape_cast(
            self,
            abi,
            world,
            shape,
            dx,
            dy,
            max_fraction,
            filter,
        );
    }
}
