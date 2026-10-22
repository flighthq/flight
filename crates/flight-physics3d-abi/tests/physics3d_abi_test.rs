// flight-lint: allow-file(f64) D1: readback values are the wire's IEEE doubles
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use flight_collision::CollisionColliderShape3D;
use flight_physics3d::contract::PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND;
use flight_physics3d::{
    Physics3DBodyType, Physics3DMaterial, add_physics_3d_body, add_physics_3d_collider,
    create_physics_3d_solver_config, create_physics_3d_world, step_physics_3d,
};
use flight_physics3d_abi::contract::*;

use crate::support::*;

fn create_body_read_world() -> (Physics3DAbi, Physics3DAbiWorldHandle) {
    let abi = create_physics3d_abi();
    let world = create_physics3d_abi_world(&abi);
    let mut commands = create_physics3d_abi_command_buffer(None);
    let body20 = rigid_body3d(Physics3DBodyType::Dynamic);
    body20.write().unwrap().x = 20.0;
    let body10 = rigid_body3d(Physics3DBodyType::Dynamic);
    body10.write().unwrap().x = 10.0;
    write_physics3d_abi_set_body_command(&mut commands, 20, &body20.read().unwrap());
    write_physics3d_abi_set_body_command(&mut commands, 10, &body10.read().unwrap());
    execute_or_throw(&abi, world, &commands);
    return (abi, world);
}

fn create_contact_world() -> (Physics3DAbi, Physics3DAbiWorldHandle) {
    let abi = create_physics3d_abi();
    let world = create_physics3d_abi_world(&abi);
    let mut commands = create_physics3d_abi_command_buffer(None);
    let ground = rigid_body3d(Physics3DBodyType::Static);
    let crate_body = rigid_body3d(Physics3DBodyType::Dynamic);
    crate_body.write().unwrap().y = 0.75;
    let collider = |shape: &CollisionColliderShape3D| physics3d_collider(shape, None);
    write_physics3d_abi_set_body_command(&mut commands, 2, &ground.read().unwrap());
    write_physics3d_abi_set_collider_command(
        &mut commands,
        22,
        2,
        &collider(&unit_aabb()).read().unwrap(),
    );
    write_physics3d_abi_set_body_command(&mut commands, 1, &crate_body.read().unwrap());
    write_physics3d_abi_set_collider_command(
        &mut commands,
        11,
        1,
        &collider(&unit_aabb()).read().unwrap(),
    );
    execute_or_throw(&abi, world, &commands);
    return (abi, world);
}

fn execute_or_throw(
    abi: &Physics3DAbi,
    world: Physics3DAbiWorldHandle,
    commands: &Physics3DAbiCommandBuffer,
) {
    let mut result = create_physics3d_abi_execution_result();
    assert!(
        execute_physics3d_abi_commands(&mut result, abi, world, commands),
        "Unexpected ABI command failure: {:?} at {}",
        result.status,
        result.command_index
    );
}

fn hooks(
    buffer: Physics3DAbiContactBuffer,
    pre_solve: Option<Physics3DAbiContactHook>,
    post_solve: Option<Physics3DAbiContactHook>,
) -> Physics3DAbiContactHooks {
    return Physics3DAbiContactHooks {
        buffer: Arc::new(RwLock::new(buffer)),
        post_solve,
        pre_solve,
    };
}

fn write_commands(write: impl FnOnce(&mut Physics3DAbiCommandBuffer)) -> Physics3DAbiCommandBuffer {
    let mut commands = create_physics3d_abi_command_buffer(None);
    write(&mut commands);
    return commands;
}

mod create_physics3d_abi {
    use super::*;

    #[test]
    fn publishes_the_reference_version_and_required_baseline_capabilities() {
        let abi = create_physics3d_abi();
        assert_eq!(abi.version, PHYSICS3D_ABI_VERSION);
        assert_eq!(
            abi.capabilities,
            PHYSICS3D_ABI_CAPABILITY_CONTACT_HOOKS
                | PHYSICS3D_ABI_CAPABILITY_PERSISTENT_WORLDS
                | PHYSICS3D_ABI_CAPABILITY_QUERIES
                | PHYSICS3D_ABI_CAPABILITY_SELECTIVE_READBACK
        );
    }

    #[test]
    fn decodes_all_nine_built_in_collider_shapes_through_the_public_command_stream() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let mut commands = create_physics3d_abi_command_buffer(Some(32768));
        let body = rigid_body3d(Physics3DBodyType::Static);
        assert!(write_physics3d_abi_set_body_command(
            &mut commands,
            1,
            &body.read().unwrap()
        ));
        let shapes = collider_shapes((1.0, 1.0, 1.0), 0, 0);
        for (i, (_, shape)) in shapes.iter().enumerate() {
            assert!(write_physics3d_abi_set_collider_command(
                &mut commands,
                i as u32 + 1,
                1,
                &physics3d_collider(shape, None).read().unwrap()
            ));
        }

        let mut result = create_physics3d_abi_execution_result();
        assert!(
            execute_physics3d_abi_commands(&mut result, &abi, world, &commands),
            "{:?} at {}",
            result.status,
            result.command_index
        );
        assert_eq!(result.command_index as usize, 1 + shapes.len());
    }

    #[test]
    fn executes_and_reads_through_caller_owned_shared_memory_views() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let mut commands = create_physics3d_abi_command_buffer(None);
        commands.data = vec![0; 512].into_boxed_slice();
        commands.byte_length = 0;
        commands.command_count = 0;
        clear_physics3d_abi_command_buffer(&mut commands);
        let body = rigid_body3d(Physics3DBodyType::Dynamic);
        body.write().unwrap().x = 17.0;
        assert!(write_physics3d_abi_set_body_command(
            &mut commands,
            3,
            &body.read().unwrap()
        ));
        execute_or_throw(&abi, world, &commands);

        let mut out = create_physics3d_abi_body_buffer(0);
        out.ids = vec![0; 1].into_boxed_slice();
        out.flags = vec![0; 1].into_boxed_slice();
        out.values = vec![0.0; PHYSICS3D_ABI_BODY_VALUE_STRIDE].into_boxed_slice();
        out.count = 0;
        out.required_count = 0;
        assert!(read_physics3d_abi_bodies(&mut out, &abi, world, None));
        assert_eq!(out.ids[0], 3);
        assert_eq!(out.values[PHYSICS3D_ABI_BODY_VALUE_X], 17.0);
    }
}

mod create_physics3d_abi_world {
    use super::*;

    #[test]
    fn allocates_non_zero_handles_that_are_never_reused_by_one_abi_instance() {
        let abi = create_physics3d_abi();
        let first = create_physics3d_abi_world(&abi);
        assert!(first > 0);
        assert!(destroy_physics3d_abi_world(&abi, first));
        let second = create_physics3d_abi_world(&abi);
        assert!(second > first);
    }
}

mod destroy_physics3d_abi_world {
    use super::*;

    #[test]
    fn makes_every_later_operation_on_that_handle_observably_stale() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        assert!(destroy_physics3d_abi_world(&abi, world));
        assert!(!destroy_physics3d_abi_world(&abi, world));
        assert_eq!(
            step_physics3d_abi_world(&abi, world, 1.0 / 60.0, None),
            Physics3DAbiStepStatus::StaleWorld
        );
        let mut bodies = create_physics3d_abi_body_buffer(1);
        assert!(!read_physics3d_abi_bodies(&mut bodies, &abi, world, None));
    }
}

mod execute_physics3d_abi_commands {
    use super::*;

    #[test]
    fn commits_the_valid_prefix_and_identifies_the_first_rejected_command() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let mut commands = create_physics3d_abi_command_buffer(None);
        let body = rigid_body3d(Physics3DBodyType::Dynamic);
        body.write().unwrap().x = 6.0;
        assert!(write_physics3d_abi_set_body_command(
            &mut commands,
            5,
            &body.read().unwrap()
        ));
        assert!(write_physics3d_abi_destroy_body_command(&mut commands, 999));

        let mut result = create_physics3d_abi_execution_result();
        assert!(!execute_physics3d_abi_commands(
            &mut result,
            &abi,
            world,
            &commands
        ));
        assert_eq!(result.status, Physics3DAbiExecutionStatus::MissingBody);
        assert_eq!(result.command_index, 1);

        let mut bodies = create_physics3d_abi_body_buffer(1);
        assert!(read_physics3d_abi_bodies(&mut bodies, &abi, world, None));
        assert_eq!(bodies.ids[0], 5);
        assert_eq!(bodies.values[PHYSICS3D_ABI_BODY_VALUE_X], 6.0);
    }

    #[test]
    fn rejects_a_corrupted_header_before_applying_anything() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let mut commands = create_physics3d_abi_command_buffer(None);
        write_physics3d_abi_set_gravity_command(&mut commands, 1.0, 2.0, 3.0);
        commands.data[0] ^= 0xff;
        let mut result = create_physics3d_abi_execution_result();

        assert!(!execute_physics3d_abi_commands(
            &mut result,
            &abi,
            world,
            &commands
        ));
        assert_eq!(result.status, Physics3DAbiExecutionStatus::InvalidBuffer);
        assert_eq!(result.command_index, 0);
        assert_eq!(result.byte_offset, PHYSICS3D_ABI_COMMAND_HEADER_BYTE_LENGTH);
        assert_eq!(result.command_kind, 0);
    }

    #[test]
    fn rejects_unknown_flag_bits_rather_than_silently_adopting_future_semantics() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let mut commands = create_physics3d_abi_command_buffer(None);
        write_physics3d_abi_set_body_command(
            &mut commands,
            1,
            &rigid_body3d(Physics3DBodyType::Dynamic).read().unwrap(),
        );
        commands.data[32..36].copy_from_slice(&(1u32 << 31).to_le_bytes());
        let mut result = create_physics3d_abi_execution_result();

        assert!(!execute_physics3d_abi_commands(
            &mut result,
            &abi,
            world,
            &commands
        ));
        assert_eq!(result.status, Physics3DAbiExecutionStatus::InvalidCommand);
    }

    #[test]
    fn classifies_a_structurally_minimal_degenerate_collider_as_a_rejected_mutation() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let mut commands = create_physics3d_abi_command_buffer(None);
        assert!(write_physics3d_abi_set_body_command(
            &mut commands,
            1,
            &rigid_body3d(Physics3DBodyType::Static).read().unwrap()
        ));
        let empty_convex =
            CollisionColliderShape3D::BuiltIn(flight_collision::CollisionShape3D::Convex(
                flight_collision::CollisionConvex3D { points: Vec::new() },
            ));
        assert!(write_physics3d_abi_set_collider_command(
            &mut commands,
            1,
            1,
            &physics3d_collider(&empty_convex, None).read().unwrap()
        ));
        let mut result = create_physics3d_abi_execution_result();

        assert!(!execute_physics3d_abi_commands(
            &mut result,
            &abi,
            world,
            &commands
        ));
        assert_eq!(result.status, Physics3DAbiExecutionStatus::RejectedMutation);
        assert_eq!(result.command_index, 1);
    }

    #[test]
    fn applies_configuration_force_impulse_torque_and_wake_commands_to_persistent_state() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let body = rigid_body3d(Physics3DBodyType::Dynamic);
        {
            let mut body = body.write().unwrap();
            body.mass = 2.0;
            body.inertia_xx = 4.0;
            body.inertia_yy = 4.0;
            body.inertia_zz = 4.0;
            body.sleeping = true;
        }
        let mut config = create_physics_3d_solver_config(None);
        config.substeps = 2;

        execute_or_throw(
            &abi,
            world,
            &write_commands(|commands| {
                write_physics3d_abi_set_gravity_command(commands, 0.0, 0.0, 0.0);
                write_physics3d_abi_set_solver_config_command(commands, &config);
                write_physics3d_abi_set_body_command(commands, 7, &body.read().unwrap());
                write_physics3d_abi_apply_force_command(commands, 7, 2.0, 0.0, 0.0);
                write_physics3d_abi_apply_force_at_point_command(
                    commands, 7, 2.0, 0.0, 0.0, 0.0, 1.0, 0.0,
                );
                write_physics3d_abi_apply_linear_impulse_command(commands, 7, 2.0, 0.0, 0.0);
                write_physics3d_abi_apply_linear_impulse_at_point_command(
                    commands, 7, 2.0, 0.0, 0.0, 0.0, 1.0, 0.0,
                );
                write_physics3d_abi_apply_torque_command(commands, 7, 0.0, 0.0, 6.0);
                write_physics3d_abi_wake_body_command(commands, 7);
            }),
        );

        let mut before_step = create_physics3d_abi_body_buffer(1);
        assert!(read_physics3d_abi_bodies(
            &mut before_step,
            &abi,
            world,
            None
        ));
        assert_eq!(before_step.flags[0] & (1 << 4), 0);
        // D1 f32 bound (TS: toBeCloseTo(2, 12))
        let velocity_x = before_step.values[PHYSICS3D_ABI_BODY_VALUE_VELOCITY_X];
        assert!((velocity_x - 2.0).abs() <= 4.0 * f64::from(f32::EPSILON) * 2.0);
        // D1 f32 bound (TS: toBeCloseTo(-0.5, 12))
        let angular_velocity_z = before_step.values[PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_Z];
        assert!((angular_velocity_z + 0.5).abs() <= 4.0 * f64::from(f32::EPSILON));
        assert_eq!(before_step.values[PHYSICS3D_ABI_BODY_VALUE_FORCE_X], 4.0);
        assert_eq!(before_step.values[PHYSICS3D_ABI_BODY_VALUE_TORQUE_Z], 4.0);

        assert_eq!(
            step_physics3d_abi_world(&abi, world, 0.5, None),
            Physics3DAbiStepStatus::Complete
        );
        let mut after_step = create_physics3d_abi_body_buffer(1);
        assert!(read_physics3d_abi_bodies(
            &mut after_step,
            &abi,
            world,
            None
        ));
        // D1 f32 bound (TS: toBeCloseTo(3, 12)); two substeps of accumulation.
        let velocity_x = after_step.values[PHYSICS3D_ABI_BODY_VALUE_VELOCITY_X];
        assert!((velocity_x - 3.0).abs() <= 4.0 * f64::from(f32::EPSILON) * 3.0);
        assert_eq!(after_step.values[PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Y], 0.0);
        assert_eq!(after_step.values[PHYSICS3D_ABI_BODY_VALUE_FORCE_X], 0.0);
        assert_eq!(after_step.values[PHYSICS3D_ABI_BODY_VALUE_TORQUE_Z], 0.0);
    }

    #[test]
    fn removes_collider_identity_and_broadphase_query_visibility_atomically() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let body = rigid_body3d(Physics3DBodyType::Static);
        execute_or_throw(
            &abi,
            world,
            &write_commands(|commands| {
                write_physics3d_abi_set_body_command(commands, 1, &body.read().unwrap());
                write_physics3d_abi_set_collider_command(
                    commands,
                    2,
                    1,
                    &physics3d_collider(&unit_aabb(), None).read().unwrap(),
                );
            }),
        );
        let mut hits = create_physics3d_abi_query_buffer(1);
        assert!(query_physics3d_abi_point(
            &mut hits, &abi, world, 0.0, 0.0, 0.0, None
        ));
        assert_eq!((hits.count, hits.required_count), (1, 1));

        execute_or_throw(
            &abi,
            world,
            &write_commands(|commands| {
                write_physics3d_abi_destroy_collider_command(commands, 2);
            }),
        );
        assert!(query_physics3d_abi_point(
            &mut hits, &abi, world, 0.0, 0.0, 0.0, None
        ));
        assert_eq!((hits.count, hits.required_count), (0, 0));
    }
}

mod get_physics3d_abi_world_status {
    use super::*;

    #[test]
    fn distinguishes_a_usable_handle_from_a_destroyed_one() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        assert_eq!(
            get_physics3d_abi_world_status(&abi, world),
            Physics3DAbiWorldStatus::Ready
        );
        destroy_physics3d_abi_world(&abi, world);
        assert_eq!(
            get_physics3d_abi_world_status(&abi, world),
            Physics3DAbiWorldStatus::Stale
        );
    }
}

mod initialize_physics3d_abi {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics3d_abi() {
        let mut abi = create_physics3d_abi();
        let id = flight_entity::get_entity_id(&abi);
        let old = create_physics3d_abi_world(&abi);

        initialize_physics3d_abi(&mut abi);

        // The default backend is reinstalled: a fresh world table under the same allocation.
        assert_eq!(
            get_physics3d_abi_world_status(&abi, old),
            Physics3DAbiWorldStatus::Stale
        );
        assert_eq!(abi.version, PHYSICS3D_ABI_VERSION);
        assert_eq!(flight_entity::get_entity_id(&abi), id);
    }
}

mod read_physics3d_abi_bodies {
    use super::*;

    #[test]
    fn reports_a_sorted_full_count_and_writes_only_the_prefix_that_fits() {
        let (abi, world) = create_body_read_world();
        let mut out = create_physics3d_abi_body_buffer(1);

        assert!(read_physics3d_abi_bodies(&mut out, &abi, world, None));
        assert_eq!(out.required_count, 2);
        assert_eq!(out.count, 1);
        assert_eq!(out.ids[0], 10);
    }

    #[test]
    fn preserves_selective_caller_order_and_silently_omits_missing_ids() {
        let (abi, world) = create_body_read_world();
        let mut out = create_physics3d_abi_body_buffer(2);

        assert!(read_physics3d_abi_bodies(
            &mut out,
            &abi,
            world,
            Some(&[20, 404, 10])
        ));
        assert_eq!(out.required_count, 2);
        assert_eq!(out.count, 2);
        assert_eq!(&out.ids[..], &[20, 10]);
    }
}

mod read_physics3d_abi_contacts {
    use super::*;

    #[test]
    fn publishes_contact_identities_events_and_required_capacity_after_a_step() {
        let (abi, world) = create_contact_world();
        assert_eq!(
            step_physics3d_abi_world(&abi, world, 1.0 / 60.0, None),
            Physics3DAbiStepStatus::Complete
        );

        let mut out = create_physics3d_abi_contact_buffer(4, 16);
        assert!(read_physics3d_abi_contacts(
            &mut out,
            &abi,
            world,
            Physics3DAbiContactSelection::All
        ));
        assert!(out.count > 0);
        let mut bodies = [out.ids[0], out.ids[1]];
        bodies.sort_unstable();
        assert_eq!(bodies, [1, 2]);
        let mut colliders = [out.ids[2], out.ids[3]];
        colliders.sort_unstable();
        assert_eq!(colliders, [11, 22]);

        let mut began = create_physics3d_abi_contact_buffer(4, 16);
        assert!(read_physics3d_abi_contacts(
            &mut began,
            &abi,
            world,
            Physics3DAbiContactSelection::Began
        ));
        assert!(began.count > 0);

        let mut undersized = create_physics3d_abi_contact_buffer(0, 0);
        assert!(read_physics3d_abi_contacts(
            &mut undersized,
            &abi,
            world,
            Physics3DAbiContactSelection::All
        ));
        assert_eq!(undersized.count, 0);
        assert!(undersized.required_count > 0);
        assert!(undersized.required_point_count > 0);
    }
}

mod read_physics3d_abi_joints {
    use super::*;

    #[test]
    fn decodes_every_built_in_joint_and_returns_reactions_in_caller_id_order() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let mut commands = create_physics3d_abi_command_buffer(Some(16384));
        let dynamic = rigid_body3d(Physics3DBodyType::Dynamic);
        write_physics3d_abi_set_body_command(&mut commands, 10, &dynamic.read().unwrap());
        write_physics3d_abi_set_body_command(&mut commands, 20, &dynamic.read().unwrap());
        let ids = [70, 10, 60, 20, 50, 30, 40];
        for ((name, joint), id) in joints().into_iter().zip(ids) {
            assert!(
                write_physics3d_abi_set_joint_command(&mut commands, id, &*joint.read().unwrap()),
                "{name}"
            );
        }
        let mut result = create_physics3d_abi_execution_result();
        assert!(
            execute_physics3d_abi_commands(&mut result, &abi, world, &commands),
            "{:?} at {}",
            result.status,
            result.command_index
        );

        let mut out = create_physics3d_abi_joint_buffer(3);
        assert!(read_physics3d_abi_joints(&mut out, &abi, world));
        assert_eq!(out.required_count, 7);
        assert_eq!(out.count, 3);
        assert_eq!(&out.ids[..], &[10, 20, 30]);
        assert_eq!(&out.values[..], &[0.0; 18]);
    }

    #[test]
    fn reports_broken_and_collide_connected_in_the_same_bits_the_set_joint_record_uses() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        let broken = distance_joint(1, 2, 1.0);
        broken.write().unwrap().fields_mut().broken = true;
        let connected = distance_joint(1, 2, 1.0);
        connected.write().unwrap().fields_mut().collide_connected = true;
        execute_or_throw(
            &abi,
            world,
            &write_commands(|commands| {
                let dynamic = rigid_body3d(Physics3DBodyType::Dynamic);
                write_physics3d_abi_set_body_command(commands, 1, &dynamic.read().unwrap());
                write_physics3d_abi_set_body_command(commands, 2, &dynamic.read().unwrap());
                write_physics3d_abi_set_joint_command(commands, 5, &*broken.read().unwrap());
                write_physics3d_abi_set_joint_command(commands, 6, &*connected.read().unwrap());
            }),
        );

        let mut out = create_physics3d_abi_joint_buffer(2);
        assert!(read_physics3d_abi_joints(&mut out, &abi, world));
        assert_eq!(&out.ids[..2], &[5, 6]);
        assert_eq!(
            (
                PHYSICS3D_ABI_JOINT_FLAG_COLLIDE_CONNECTED,
                PHYSICS3D_ABI_JOINT_FLAG_BROKEN
            ),
            (1, 2)
        );
        assert_eq!(out.flags[0], PHYSICS3D_ABI_JOINT_FLAG_BROKEN);
        assert_eq!(out.flags[0] & PHYSICS3D_ABI_JOINT_FLAG_COLLIDE_CONNECTED, 0);
        assert_eq!(out.flags[1], 0);
    }

    #[test]
    fn removes_a_joint_explicitly_and_cascades_the_others_when_a_body_is_destroyed() {
        let abi = create_physics3d_abi();
        let world = create_physics3d_abi_world(&abi);
        execute_or_throw(
            &abi,
            world,
            &write_commands(|commands| {
                let dynamic = rigid_body3d(Physics3DBodyType::Dynamic);
                write_physics3d_abi_set_body_command(commands, 1, &dynamic.read().unwrap());
                write_physics3d_abi_set_body_command(commands, 2, &dynamic.read().unwrap());
                write_physics3d_abi_set_joint_command(
                    commands,
                    5,
                    &*distance_joint(1, 2, 0.0).read().unwrap(),
                );
                write_physics3d_abi_set_joint_command(
                    commands,
                    6,
                    &*joint(PHYSICS_3D_BALL_AND_SOCKET_JOINT_KIND, 1, 2)
                        .read()
                        .unwrap(),
                );
            }),
        );
        execute_or_throw(
            &abi,
            world,
            &write_commands(|commands| {
                write_physics3d_abi_destroy_joint_command(commands, 5);
                write_physics3d_abi_destroy_body_command(commands, 1);
            }),
        );

        let mut out = create_physics3d_abi_joint_buffer(2);
        assert!(read_physics3d_abi_joints(&mut out, &abi, world));
        assert_eq!((out.count, out.required_count), (0, 0));
    }
}

mod step_physics3d_abi_world {
    use super::*;

    #[test]
    fn matches_standard_free_flight_integration_exactly_over_a_persistent_multi_step_world() {
        let abi = create_physics3d_abi();
        let abi_world = create_physics3d_abi_world(&abi);
        let source = rigid_body3d(Physics3DBodyType::Dynamic);
        {
            let mut source = source.write().unwrap();
            source.x = -2.0;
            source.y = 4.0;
            source.velocity_x = 1.25;
        }
        let collider = physics3d_collider(&unit_aabb(), None);
        let mut commands = create_physics3d_abi_command_buffer(None);
        write_physics3d_abi_set_body_command(&mut commands, 7, &source.read().unwrap());
        write_physics3d_abi_set_collider_command(&mut commands, 9, 7, &collider.read().unwrap());
        execute_or_throw(&abi, abi_world, &commands);

        let registry = registered_registry();
        let mut direct_world = create_physics_3d_world();
        let direct_body = rigid_body3d(Physics3DBodyType::Dynamic);
        {
            let mut direct_body = direct_body.write().unwrap();
            direct_body.x = -2.0;
            direct_body.y = 4.0;
            direct_body.velocity_x = 1.25;
        }
        add_physics_3d_body(&mut direct_world, &direct_body);
        add_physics_3d_collider(
            &mut direct_world,
            &direct_body,
            &physics3d_collider(&unit_aabb(), None),
        );

        for _ in 0..120 {
            assert_eq!(
                step_physics3d_abi_world(&abi, abi_world, 1.0 / 120.0, None),
                Physics3DAbiStepStatus::Complete
            );
            step_physics_3d(&mut direct_world, &registry, 1.0 / 120.0, None);
        }

        let mut out = create_physics3d_abi_body_buffer(1);
        read_physics3d_abi_bodies(&mut out, &abi, abi_world, None);
        let direct_body = direct_body.read().unwrap();
        assert_eq!(
            out.values[PHYSICS3D_ABI_BODY_VALUE_X],
            f64::from(direct_body.x)
        );
        assert_eq!(
            out.values[PHYSICS3D_ABI_BODY_VALUE_Y],
            f64::from(direct_body.y)
        );
        assert_eq!(
            out.values[PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Y],
            f64::from(direct_body.velocity_y)
        );
    }

    #[test]
    fn matches_the_standard_contact_solver_exactly_over_a_frictional_settling_stack() {
        let abi = create_physics3d_abi();
        let abi_world = create_physics3d_abi_world(&abi);
        let registry = registered_registry();
        let mut direct_world = create_physics_3d_world();
        let material = Physics3DMaterial {
            density: 1.0,
            friction: 0.4,
            restitution: 0.2,
        };
        let shapes = [
            aabb(-6.0, -0.5, -6.0, 6.0, 0.5, 6.0),
            unit_aabb(),
            unit_aabb(),
            unit_aabb(),
        ];
        let poses = [
            (Physics3DBodyType::Static, 0.0, -0.5, 0.0),
            (Physics3DBodyType::Dynamic, 0.0, 0.5, 0.0),
            (Physics3DBodyType::Dynamic, 0.2, 1.6, 0.1),
            (Physics3DBodyType::Dynamic, -0.1, 2.7, 0.0),
        ];
        let bodies: Vec<_> = poses
            .iter()
            .zip(&shapes)
            .map(|(&(body_type, x, y, z), shape)| {
                let body = rigid_body3d(body_type);
                {
                    let mut body = body.write().unwrap();
                    body.x = x;
                    body.y = y;
                    body.z = z;
                    body.velocity_x = if body_type == Physics3DBodyType::Dynamic {
                        0.3
                    } else {
                        0.0
                    };
                }
                add_physics_3d_body(&mut direct_world, &body);
                add_physics_3d_collider(
                    &mut direct_world,
                    &body,
                    &physics3d_collider(shape, Some(&material)),
                );
                return body;
            })
            .collect();
        let mut commands = create_physics3d_abi_command_buffer(Some(16384));
        for (i, body) in bodies.iter().enumerate() {
            let id = i as u32 + 1;
            let body = body.read().unwrap();
            assert!(write_physics3d_abi_set_body_command(
                &mut commands,
                id,
                &body
            ));
            assert!(write_physics3d_abi_set_collider_command(
                &mut commands,
                id,
                id,
                &body.colliders[0].read().unwrap()
            ));
        }
        execute_or_throw(&abi, abi_world, &commands);

        for _ in 0..180 {
            step_physics_3d(&mut direct_world, &registry, 1.0 / 60.0, None);
            assert_eq!(
                step_physics3d_abi_world(&abi, abi_world, 1.0 / 60.0, None),
                Physics3DAbiStepStatus::Complete
            );
        }

        let mut out = create_physics3d_abi_body_buffer(bodies.len());
        assert!(read_physics3d_abi_bodies(&mut out, &abi, abi_world, None));
        assert_eq!(out.count, bodies.len());
        for (i, body) in bodies.iter().enumerate() {
            let at = i * PHYSICS3D_ABI_BODY_VALUE_STRIDE;
            let body = body.read().unwrap();
            let expected = [
                (PHYSICS3D_ABI_BODY_VALUE_X, body.x),
                (PHYSICS3D_ABI_BODY_VALUE_Y, body.y),
                (PHYSICS3D_ABI_BODY_VALUE_Z, body.z),
                (PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_X, body.orientation_x),
                (PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_Y, body.orientation_y),
                (PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_Z, body.orientation_z),
                (PHYSICS3D_ABI_BODY_VALUE_ORIENTATION_W, body.orientation_w),
                (PHYSICS3D_ABI_BODY_VALUE_VELOCITY_X, body.velocity_x),
                (PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Y, body.velocity_y),
                (PHYSICS3D_ABI_BODY_VALUE_VELOCITY_Z, body.velocity_z),
                (
                    PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_X,
                    body.angular_velocity_x,
                ),
                (
                    PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_Y,
                    body.angular_velocity_y,
                ),
                (
                    PHYSICS3D_ABI_BODY_VALUE_ANGULAR_VELOCITY_Z,
                    body.angular_velocity_z,
                ),
            ];
            for (slot, value) in expected {
                assert_eq!(
                    out.values[at + slot],
                    f64::from(value),
                    "body {i} slot {slot}"
                );
            }
        }
        assert!(bodies[3].read().unwrap().y < 2.7);
        assert!(!direct_world.contacts.is_empty());
        let mut contacts =
            create_physics3d_abi_contact_buffer(8, 8 * PHYSICS3D_ABI_MAX_CONTACT_POINTS);
        assert!(read_physics3d_abi_contacts(
            &mut contacts,
            &abi,
            abi_world,
            Physics3DAbiContactSelection::All
        ));
        assert_eq!(contacts.count, direct_world.contacts.len());
        assert_eq!(
            contacts.point_counts[..contacts.count]
                .iter()
                .max()
                .copied(),
            Some(PHYSICS3D_ABI_MAX_CONTACT_POINTS as u32)
        );
    }

    #[test]
    fn adapts_synchronous_contact_hooks_without_exposing_the_owned_world() {
        let (abi, world) = create_contact_world();
        let abi = Arc::new(abi);
        let pre_solve_count = Arc::new(AtomicUsize::new(0));
        let post_solve_count = Arc::new(AtomicUsize::new(0));
        let reentrant_result = Arc::new(Mutex::new(create_physics3d_abi_execution_result()));
        // (nested step status, status during hook, read during hook, query during hook, destroy
        // during hook), recorded by the last pre-solve invocation.
        let observed = Arc::new(Mutex::new(None));

        let pre_solve: Physics3DAbiContactHook = {
            let (abi, count, result, observed) = (
                abi.clone(),
                pre_solve_count.clone(),
                reentrant_result.clone(),
                observed.clone(),
            );
            Arc::new(move |contact: &mut Physics3DAbiContactBuffer| {
                count.fetch_add(1, Ordering::SeqCst);
                contact.values[3] = 0.75;
                execute_physics3d_abi_commands(
                    &mut result.lock().unwrap(),
                    &abi,
                    world,
                    &create_physics3d_abi_command_buffer(None),
                );
                let nested_step_status = step_physics3d_abi_world(&abi, world, 1.0 / 60.0, None);
                let status_during_hook = get_physics3d_abi_world_status(&abi, world);
                let read_during_hook = read_physics3d_abi_bodies(
                    &mut create_physics3d_abi_body_buffer(1),
                    &abi,
                    world,
                    None,
                );
                let query_during_hook = query_physics3d_abi_point(
                    &mut create_physics3d_abi_query_buffer(1),
                    &abi,
                    world,
                    0.0,
                    0.0,
                    0.0,
                    None,
                );
                let destroy_during_hook = destroy_physics3d_abi_world(&abi, world);
                *observed.lock().unwrap() = Some((
                    nested_step_status,
                    status_during_hook,
                    read_during_hook,
                    query_during_hook,
                    destroy_during_hook,
                ));
            })
        };
        let post_solve: Physics3DAbiContactHook = {
            let count = post_solve_count.clone();
            Arc::new(move |_contact: &mut Physics3DAbiContactBuffer| {
                count.fetch_add(1, Ordering::SeqCst);
            })
        };
        let hooks = hooks(
            create_physics3d_abi_contact_buffer(1, PHYSICS3D_ABI_MAX_CONTACT_POINTS),
            Some(pre_solve),
            Some(post_solve),
        );

        assert_eq!(
            step_physics3d_abi_world(&abi, world, 1.0 / 60.0, Some(&hooks)),
            Physics3DAbiStepStatus::Complete
        );
        assert!(pre_solve_count.load(Ordering::SeqCst) > 0);
        assert!(post_solve_count.load(Ordering::SeqCst) > 0);
        assert_eq!(
            reentrant_result.lock().unwrap().status,
            Physics3DAbiExecutionStatus::BusyWorld
        );
        assert_eq!(
            *observed.lock().unwrap(),
            Some((
                Physics3DAbiStepStatus::BusyWorld,
                Physics3DAbiWorldStatus::Busy,
                false,
                false,
                false
            ))
        );

        let mut contacts = create_physics3d_abi_contact_buffer(2, 8);
        read_physics3d_abi_contacts(
            &mut contacts,
            &abi,
            world,
            Physics3DAbiContactSelection::All,
        );
        assert_eq!(contacts.values[3], 0.75);
    }

    #[test]
    fn declines_invalid_timesteps_and_insufficient_live_hook_buffers_explicitly() {
        let (abi, world) = create_contact_world();
        assert_eq!(
            step_physics3d_abi_world(&abi, world, 0.0, None),
            Physics3DAbiStepStatus::Declined
        );
        let no_op: Physics3DAbiContactHook =
            Arc::new(|_contact: &mut Physics3DAbiContactBuffer| {});
        assert_eq!(
            step_physics3d_abi_world(
                &abi,
                world,
                1.0 / 60.0,
                Some(&hooks(
                    create_physics3d_abi_contact_buffer(1, PHYSICS3D_ABI_MAX_CONTACT_POINTS - 1),
                    Some(no_op),
                    None
                ))
            ),
            Physics3DAbiStepStatus::InsufficientHookBuffer
        );
        assert_eq!(
            step_physics3d_abi_world(
                &abi,
                world,
                1.0 / 60.0,
                Some(&hooks(
                    create_physics3d_abi_contact_buffer(0, 0),
                    None,
                    None
                ))
            ),
            Physics3DAbiStepStatus::Complete
        );
    }
}
