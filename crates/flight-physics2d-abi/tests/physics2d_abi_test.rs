// flight-lint: allow-file(f64) D1: readback values are the wire's IEEE doubles, the step dt is flight-physics2d's f64 timestep and circle scalars are f64 shape fields
use flight_collision::{CollisionAabb2D, CollisionCircle2D, CollisionShape2D};
use flight_entity::Ref;
use flight_physics2d::{
    Physics2DBodyType, Physics2DJointOptions, Physics2DMaterial, Physics2DRevoluteJointOptions,
    RigidBody2D,
};
use flight_physics2d_abi::contract::*;

use crate::support::*;

const MATERIAL: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};
const DT: f64 = 1.0 / 60.0;

fn aabb(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> CollisionShape2D {
    return CollisionShape2D::Aabb(CollisionAabb2D {
        min_x,
        min_y,
        max_x,
        max_y,
    });
}

fn circle(x: f64, y: f64, radius: f64) -> CollisionShape2D {
    return CollisionShape2D::Circle(CollisionCircle2D { x, y, radius });
}

// Writes a body and its one collider under the same id.
fn add(
    commands: &mut Physics2DAbiCommandBuffer,
    id: u32,
    body: &Ref<RigidBody2D>,
    shape: CollisionShape2D,
) {
    let collider = physics2d_collider(&shape, &MATERIAL, None, None);
    assert!(write_physics2d_abi_set_body_command(
        commands,
        id,
        &body.read().unwrap()
    ));
    assert!(write_physics2d_abi_set_collider_command(
        commands,
        id,
        id,
        &collider.read().unwrap()
    ));
}

fn execute(
    abi: &Physics2DAbi,
    handle: Physics2DAbiWorldHandle,
    commands: &Physics2DAbiCommandBuffer,
) -> bool {
    let mut result = create_physics2d_abi_execution_result();
    return execute_physics2d_abi_commands(&mut result, abi, handle, commands);
}

fn floor_and_box(commands: &mut Physics2DAbiCommandBuffer) {
    let floor = rigid_body2d(Physics2DBodyType::Static, 0.0, -0.5, None);
    add(commands, 1, &floor, aabb(-4.0, -0.5, 4.0, 0.0));
    let crate_body = rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.5, None);
    add(commands, 2, &crate_body, aabb(-0.5, -0.5, 0.5, 0.5));
}

fn settled() -> (Physics2DAbi, Physics2DAbiWorldHandle) {
    let abi = create_physics2d_abi();
    let handle = create_physics2d_abi_world(&abi);
    let mut commands = create_physics2d_abi_command_buffer(Some(4096));
    floor_and_box(&mut commands);
    assert!(execute(&abi, handle, &commands));
    for _ in 0..30 {
        step_physics2d_abi_world(&abi, handle, DT, None);
    }
    return (abi, handle);
}

mod create_physics2d_abi {
    use super::*;

    #[test]
    fn declares_its_version_and_every_capability_the_reference_implements() {
        let abi = create_physics2d_abi();
        assert_eq!(abi.version, PHYSICS2D_ABI_VERSION);
        assert_ne!(abi.capabilities & PHYSICS2D_ABI_CAPABILITY_CONTACT_HOOKS, 0);
        assert_ne!(
            abi.capabilities & PHYSICS2D_ABI_CAPABILITY_PERSISTENT_WORLDS,
            0
        );
        assert_ne!(abi.capabilities & PHYSICS2D_ABI_CAPABILITY_QUERIES, 0);
        assert_ne!(
            abi.capabilities & PHYSICS2D_ABI_CAPABILITY_SELECTIVE_READBACK,
            0
        );
    }

    #[test]
    fn gives_each_abi_its_own_world_table() {
        let first = create_physics2d_abi();
        let second = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&first);
        assert_eq!(
            get_physics2d_abi_world_status(&first, handle),
            Physics2DAbiWorldStatus::Ready
        );
        // The same number names nothing in another instance: no module-level world registry.
        let other = create_physics2d_abi_world(&second);
        assert!(destroy_physics2d_abi_world(&second, other));
        assert_eq!(
            get_physics2d_abi_world_status(&first, handle),
            Physics2DAbiWorldStatus::Ready
        );
    }
}

mod create_physics2d_abi_world {
    use super::*;

    #[test]
    fn issues_distinct_non_zero_handles_that_are_never_reused() {
        let abi = create_physics2d_abi();
        let first = create_physics2d_abi_world(&abi);
        let second = create_physics2d_abi_world(&abi);
        assert!(first > 0);
        assert_ne!(second, first);
        destroy_physics2d_abi_world(&abi, first);
        let third = create_physics2d_abi_world(&abi);
        assert_ne!(third, first);
        assert_ne!(third, second);
    }
}

mod destroy_physics2d_abi_world {
    use super::*;

    #[test]
    fn reports_false_for_a_handle_it_has_already_released() {
        let abi = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&abi);
        assert!(destroy_physics2d_abi_world(&abi, handle));
        assert!(!destroy_physics2d_abi_world(&abi, handle));
    }
}

mod execute_physics2d_abi_commands {
    use super::*;

    #[test]
    fn names_the_first_command_it_could_not_apply_and_keeps_the_ones_before_it() {
        let abi = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&abi);
        let mut commands = create_physics2d_abi_command_buffer(Some(4096));
        let crate_body = rigid_body2d(Physics2DBodyType::Dynamic, 1.0, 2.0, None);
        assert!(write_physics2d_abi_set_body_command(
            &mut commands,
            1,
            &crate_body.read().unwrap()
        ));
        // Names a body that does not exist, so this record fails while the one before it stands.
        let collider = physics2d_collider(&circle(0.0, 0.0, 1.0), &MATERIAL, None, None);
        assert!(write_physics2d_abi_set_collider_command(
            &mut commands,
            1,
            99,
            &collider.read().unwrap()
        ));
        let mut result = create_physics2d_abi_execution_result();

        assert!(!execute_physics2d_abi_commands(
            &mut result,
            &abi,
            handle,
            &commands
        ));

        assert_eq!(result.status, Physics2DAbiExecutionStatus::MissingBody);
        assert_eq!(result.command_index, 1);
        assert_eq!(result.command_kind, PHYSICS2D_ABI_COMMAND_KIND_SET_COLLIDER);
        assert_eq!(
            result.byte_offset,
            PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH + PHYSICS2D_ABI_COMMAND_BYTE_LENGTH_SET_BODY
        );
        let mut bodies = create_physics2d_abi_body_buffer(4);
        assert!(read_physics2d_abi_bodies(&mut bodies, &abi, handle, None));
        assert_eq!(bodies.count, 1);
    }

    #[test]
    fn rejects_a_stream_whose_header_disagrees_with_its_contents() {
        let abi = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&abi);
        let mut commands = create_physics2d_abi_command_buffer(Some(4096));
        let body = rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        assert!(write_physics2d_abi_set_body_command(
            &mut commands,
            1,
            &body.read().unwrap()
        ));
        commands.command_count = 5;
        let mut result = create_physics2d_abi_execution_result();
        assert!(!execute_physics2d_abi_commands(
            &mut result,
            &abi,
            handle,
            &commands
        ));
        assert_eq!(result.status, Physics2DAbiExecutionStatus::InvalidBuffer);
    }

    #[test]
    fn rejects_invalid_authored_state_before_it_can_make_the_world_unsteppable() {
        let abi = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&abi);
        let mut setup = create_physics2d_abi_command_buffer(Some(1024));
        let dynamic = rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let fixed = rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        assert!(write_physics2d_abi_set_body_command(
            &mut setup,
            1,
            &dynamic.read().unwrap()
        ));
        assert!(write_physics2d_abi_set_body_command(
            &mut setup,
            2,
            &fixed.read().unwrap()
        ));
        assert!(execute(&abi, handle, &setup));

        let invalid_body = rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        invalid_body.write().unwrap().linear_damping = -1.0;
        let mut body_commands = create_physics2d_abi_command_buffer(Some(256));
        assert!(write_physics2d_abi_set_body_command(
            &mut body_commands,
            1,
            &invalid_body.read().unwrap()
        ));
        let mut result = create_physics2d_abi_execution_result();
        assert!(!execute_physics2d_abi_commands(
            &mut result,
            &abi,
            handle,
            &body_commands
        ));
        assert_eq!(result.status, Physics2DAbiExecutionStatus::RejectedMutation);

        let mut bodies = create_physics2d_abi_body_buffer(2);
        assert!(read_physics2d_abi_bodies(
            &mut bodies,
            &abi,
            handle,
            Some(&[1])
        ));
        assert_eq!(bodies.values[PHYSICS2D_ABI_BODY_VALUE_LINEAR_DAMPING], 0.0);
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, None),
            Physics2DAbiStepStatus::Complete
        );

        let negative_density = Physics2DMaterial {
            density: -1.0,
            ..MATERIAL
        };
        for collider in [
            physics2d_collider(&circle(0.0, 0.0, 1.0), &negative_density, None, None),
            physics2d_collider(&circle(0.0, 0.0, 0.0), &MATERIAL, None, None),
        ] {
            let mut collider_commands = create_physics2d_abi_command_buffer(Some(256));
            assert!(write_physics2d_abi_set_collider_command(
                &mut collider_commands,
                1,
                1,
                &collider.read().unwrap()
            ));
            assert!(!execute_physics2d_abi_commands(
                &mut result,
                &abi,
                handle,
                &collider_commands
            ));
            assert_eq!(result.status, Physics2DAbiExecutionStatus::RejectedMutation);
            assert_eq!(
                step_physics2d_abi_world(&abi, handle, DT, None),
                Physics2DAbiStepStatus::Complete
            );
        }

        let mut joint_commands = create_physics2d_abi_command_buffer(Some(256));
        let joint = physics2d_revolute_joint(&Physics2DRevoluteJointOptions {
            base: Physics2DJointOptions {
                body_a: 0,
                body_b: 1,
                break_force: Some(-1.0),
                ..defaults()
            },
            ..defaults()
        });
        assert!(write_physics2d_abi_set_joint_command(
            &mut joint_commands,
            1,
            1,
            2,
            &*joint.read().unwrap()
        ));
        assert!(!execute_physics2d_abi_commands(
            &mut result,
            &abi,
            handle,
            &joint_commands
        ));
        assert_eq!(result.status, Physics2DAbiExecutionStatus::RejectedMutation);
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, None),
            Physics2DAbiStepStatus::Complete
        );
    }

    #[test]
    fn rejects_trailing_bytes_on_a_variable_length_collider_record() {
        let abi = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&abi);
        let mut setup = create_physics2d_abi_command_buffer(Some(256));
        let body = rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        assert!(write_physics2d_abi_set_body_command(
            &mut setup,
            1,
            &body.read().unwrap()
        ));
        assert!(execute(&abi, handle, &setup));

        let mut commands = create_physics2d_abi_command_buffer(Some(256));
        let collider = physics2d_collider(&circle(0.0, 0.0, 1.0), &MATERIAL, None, None);
        assert!(write_physics2d_abi_set_collider_command(
            &mut commands,
            1,
            1,
            &collider.read().unwrap()
        ));
        let at = PHYSICS2D_ABI_COMMAND_HEADER_BYTE_LENGTH
            + PHYSICS2D_ABI_COMMAND_RECORD_OFFSET_BYTE_LENGTH;
        let record_length = u32::from_le_bytes(commands.data[at..at + 4].try_into().unwrap()) + 8;
        commands.data[at..at + 4].copy_from_slice(&record_length.to_le_bytes());
        let end = commands.byte_length;
        commands.data[end..end + 8].copy_from_slice(&123.0_f64.to_le_bytes());
        commands.byte_length += 8;
        let header = PHYSICS2D_ABI_COMMAND_HEADER_OFFSET_BYTE_LENGTH;
        commands.data[header..header + 4]
            .copy_from_slice(&(commands.byte_length as u32).to_le_bytes());

        let mut result = create_physics2d_abi_execution_result();
        assert!(!execute_physics2d_abi_commands(
            &mut result,
            &abi,
            handle,
            &commands
        ));
        assert_eq!(result.status, Physics2DAbiExecutionStatus::InvalidCommand);
    }
}

mod get_physics2d_abi_world_status {
    use super::*;

    #[test]
    fn separates_a_live_world_from_one_that_no_longer_exists() {
        let abi = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&abi);
        assert_eq!(
            get_physics2d_abi_world_status(&abi, handle),
            Physics2DAbiWorldStatus::Ready
        );
        destroy_physics2d_abi_world(&abi, handle);
        assert_eq!(
            get_physics2d_abi_world_status(&abi, handle),
            Physics2DAbiWorldStatus::Stale
        );
    }
}

mod initialize_physics2d_abi {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_abi() {
        let mut abi = create_physics2d_abi();
        let id = flight_entity::get_entity_id(&abi);
        let old = create_physics2d_abi_world(&abi);

        initialize_physics2d_abi(&mut abi);

        // The default backend is reinstalled: a fresh world table under the same allocation.
        assert_eq!(
            get_physics2d_abi_world_status(&abi, old),
            Physics2DAbiWorldStatus::Stale
        );
        assert_eq!(abi.version, PHYSICS2D_ABI_VERSION);
        assert_eq!(flight_entity::get_entity_id(&abi), id);
    }
}

mod read_physics2d_abi_bodies {
    use super::*;

    #[test]
    fn reports_the_whole_answer_through_required_count_when_only_a_prefix_fits() {
        let (abi, handle) = settled();
        let mut small = create_physics2d_abi_body_buffer(1);
        assert!(read_physics2d_abi_bodies(&mut small, &abi, handle, None));
        assert_eq!(small.count, 1);
        assert_eq!(small.required_count, 2);
    }

    #[test]
    fn preserves_the_caller_order_of_a_selective_read_and_omits_absent_ids() {
        let (abi, handle) = settled();
        let mut out = create_physics2d_abi_body_buffer(4);
        assert!(read_physics2d_abi_bodies(
            &mut out,
            &abi,
            handle,
            Some(&[2, 77, 1])
        ));
        assert_eq!(out.count, 2);
        assert_eq!([out.ids[0], out.ids[1]], [2, 1]);
    }
}

mod read_physics2d_abi_contacts {
    use super::*;

    #[test]
    fn reports_the_resting_contact_with_its_manifold_points() {
        let (abi, handle) = settled();
        let mut contacts = create_physics2d_abi_contact_buffer(4, 8);
        assert!(read_physics2d_abi_contacts(
            &mut contacts,
            &abi,
            handle,
            Physics2DAbiContactSelection::All
        ));
        assert_eq!(contacts.count, 1);
        assert!(contacts.point_count > 0);
        assert_eq!(
            contacts.flags[0] & PHYSICS2D_ABI_CONTACT_FLAG_TOUCHING,
            PHYSICS2D_ABI_CONTACT_FLAG_TOUCHING
        );
        assert_eq!([contacts.ids[0], contacts.ids[1]], [1, 2]);
    }

    #[test]
    fn publishes_a_prefix_rather_than_a_subsequence_when_the_point_capacity_binds() {
        // The distinction only shows when a NARROWER contact sits behind a wider one: a box on the
        // floor gives a two-point manifold and a circle one. With room for a single point, a
        // subsequence would skip the box and publish the circle, so `count` would claim a prefix
        // while holding the second contact.
        let abi = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&abi);
        let mut commands = create_physics2d_abi_command_buffer(Some(8192));
        let floor = rigid_body2d(Physics2DBodyType::Static, 0.0, -0.5, None);
        add(&mut commands, 1, &floor, aabb(-8.0, -0.5, 8.0, 0.0));
        let crate_body = rigid_body2d(Physics2DBodyType::Dynamic, -2.0, 0.5, None);
        add(&mut commands, 2, &crate_body, aabb(-0.5, -0.5, 0.5, 0.5));
        let ball = rigid_body2d(Physics2DBodyType::Dynamic, 2.0, 0.5, None);
        add(&mut commands, 3, &ball, circle(0.0, 0.0, 0.5));
        assert!(execute(&abi, handle, &commands));
        for _ in 0..60 {
            step_physics2d_abi_world(&abi, handle, DT, None);
        }

        let mut full = create_physics2d_abi_contact_buffer(8, 16);
        assert!(read_physics2d_abi_contacts(
            &mut full,
            &abi,
            handle,
            Physics2DAbiContactSelection::All
        ));
        assert_eq!(full.count, 2);
        // The scene only tests what it claims to if a narrower contact really follows a wider one.
        assert_eq!(full.point_counts[0], 2);
        assert_eq!(full.point_counts[1], 1);

        let mut tight = create_physics2d_abi_contact_buffer(8, 1);
        assert!(read_physics2d_abi_contacts(
            &mut tight,
            &abi,
            handle,
            Physics2DAbiContactSelection::All
        ));
        assert_eq!(tight.count, 0);
        assert_eq!(tight.required_count, 2);
        assert_eq!(tight.required_point_count, 3);
    }

    #[test]
    fn separates_the_began_selection_from_the_standing_set() {
        let (abi, handle) = settled();
        let mut all = create_physics2d_abi_contact_buffer(4, 8);
        let mut began = create_physics2d_abi_contact_buffer(4, 8);
        read_physics2d_abi_contacts(&mut all, &abi, handle, Physics2DAbiContactSelection::All);
        read_physics2d_abi_contacts(
            &mut began,
            &abi,
            handle,
            Physics2DAbiContactSelection::Began,
        );
        assert_eq!(all.count, 1);
        assert_eq!(began.count, 0);
    }

    #[test]
    fn stops_at_the_first_contact_whose_manifold_points_do_not_fit() {
        let abi = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&abi);
        let mut commands = create_physics2d_abi_command_buffer(Some(4096));
        let box_body = rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        add(&mut commands, 1, &box_body, aabb(-0.5, -0.5, 0.5, 0.5));
        let floor = rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        add(&mut commands, 2, &floor, aabb(-2.0, -1.0, 2.0, -0.4));
        let disc = rigid_body2d(Physics2DBodyType::Static, 0.0, 0.0, None);
        add(&mut commands, 3, &disc, circle(0.6, 0.0, 0.2));
        assert!(execute(&abi, handle, &commands));
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, None),
            Physics2DAbiStepStatus::Complete
        );

        let mut full = create_physics2d_abi_contact_buffer(4, 8);
        assert!(read_physics2d_abi_contacts(
            &mut full,
            &abi,
            handle,
            Physics2DAbiContactSelection::All
        ));
        assert_eq!(full.count, 2);
        assert_eq!(&full.point_counts[..2], &[2, 1]);

        let mut short = create_physics2d_abi_contact_buffer(4, 1);
        assert!(read_physics2d_abi_contacts(
            &mut short,
            &abi,
            handle,
            Physics2DAbiContactSelection::All
        ));
        assert_eq!(short.count, 0);
        assert_eq!(short.point_count, 0);
        assert_eq!(short.required_count, 2);
        assert_eq!(short.required_point_count, 3);
    }
}

mod read_physics2d_abi_joints {
    use super::*;

    #[test]
    fn reports_an_empty_answer_without_touching_the_buffer_contents() {
        let (abi, handle) = settled();
        let mut joints = create_physics2d_abi_joint_buffer(2);
        joints.ids[0] = 42;
        assert!(read_physics2d_abi_joints(&mut joints, &abi, handle));
        assert_eq!(joints.count, 0);
        assert_eq!(joints.required_count, 0);
        assert_eq!(joints.ids[0], 42);
    }
}

mod step_physics2d_abi_world {
    use super::*;

    #[test]
    fn advances_the_world_it_names_and_leaves_a_sibling_world_alone() {
        let abi = create_physics2d_abi();
        let stepped = create_physics2d_abi_world(&abi);
        let untouched = create_physics2d_abi_world(&abi);
        for handle in [stepped, untouched] {
            let mut commands = create_physics2d_abi_command_buffer(Some(4096));
            floor_and_box(&mut commands);
            assert!(execute(&abi, handle, &commands));
        }
        for _ in 0..20 {
            assert_eq!(
                step_physics2d_abi_world(&abi, stepped, DT, None),
                Physics2DAbiStepStatus::Complete
            );
        }

        let mut a = create_physics2d_abi_body_buffer(4);
        let mut b = create_physics2d_abi_body_buffer(4);
        read_physics2d_abi_bodies(&mut a, &abi, stepped, None);
        read_physics2d_abi_bodies(&mut b, &abi, untouched, None);
        let velocity_y = PHYSICS2D_ABI_BODY_VALUE_STRIDE + PHYSICS2D_ABI_BODY_VALUE_VELOCITY_Y;
        assert_ne!(a.values[velocity_y], b.values[velocity_y]);
    }

    #[test]
    fn reports_a_destroyed_world_as_stale() {
        let abi = create_physics2d_abi();
        let handle = create_physics2d_abi_world(&abi);
        destroy_physics2d_abi_world(&abi, handle);
        assert_eq!(
            step_physics2d_abi_world(&abi, handle, DT, None),
            Physics2DAbiStepStatus::StaleWorld
        );
    }
}
