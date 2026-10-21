use std::sync::{Arc, RwLock};

use flight_path::PathWinding;
use flight_skeleton2d::contract::*;

use crate::support::*;

fn straight_path_attachment() -> PathAttachment2D {
    let mut out: PathAttachment2D = flight_entity::allocate_entity();
    out.kind = String::from(PATH_ATTACHMENT_2D_KIND);
    out.commands = vec![1, 2];
    out.point_count = 2;
    out.vertices = Some(vec![0.0, 0.0, 10.0, 0.0]);
    out.winding = PathWinding::NonZero;
    return out;
}

fn path_constraint(bones: Vec<i32>, slot: i32) -> Skeleton2DPathConstraint {
    let mut value: Skeleton2DPathConstraint = flight_entity::allocate_entity();
    value.kind = String::from(SKELETON_2D_PATH_CONSTRAINT_KIND);
    value.bone_indices = bones;
    value.target_slot_index = slot;
    value.mix = 1.0;
    value.mix_rotate = 1.0;
    value.mix_x = 1.0;
    value.mix_y = 1.0;
    value.position = 0.0;
    value.spacing = 0.0;
    value.position_mode = String::from(SKELETON_2D_PATH_POSITION_MODE_FIXED);
    value.rotate_mode = String::from(SKELETON_2D_PATH_ROTATE_MODE_TANGENT);
    value.spacing_mode = String::from(SKELETON_2D_PATH_SPACING_MODE_FIXED);
    return value;
}

fn rig_with_path() -> Skeleton2D {
    let mut root = bone();
    root.length = 5.0;
    let path_bone = bone();
    let mut path_slot = slot(1);
    path_slot.attachment = Some(Arc::new(RwLock::new(straight_path_attachment())));
    let mut value = skeleton(vec![root, path_bone], Some(vec![path_slot]));
    compute_skeleton_2d_world_transforms(&mut value);
    return value;
}

mod register_skeleton_2d_path_constraint_solver {
    use super::*;

    #[test]
    fn claims_the_path_kind() {
        let mut registry = create_skeleton_2d_constraint_registry();
        register_skeleton_2d_path_constraint_solver(&mut registry);
        assert!(
            get_skeleton_2d_constraint_solver(&registry, SKELETON_2D_PATH_CONSTRAINT_KIND)
                .is_some()
        );
    }
}

mod solve_path_constraint_with {
    use super::*;

    #[test]
    fn solves_with_the_explicit_guard_state() {
        let mut value = rig_with_path();
        let constraint = path_constraint(vec![0], 0);
        solve_path_constraint_with(&mut value, &constraint, &empty_guards());
        assert!(close(value.bones[0].rotation, 0.0));
    }
}

mod solve_skeleton_2d_path_constraint {
    use super::*;

    #[test]
    fn lays_a_bone_along_the_path_tangent() {
        let mut value = rig_with_path();
        value.bones[0].rotation = 45.0;
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_path_constraint(&mut value, &path_constraint(vec![0], 0));
        assert!(
            close(value.bones[0].rotation, 0.0),
            "rotation {}",
            value.bones[0].rotation
        );
    }

    #[test]
    fn skips_a_slot_that_does_not_carry_a_path() {
        let mut root = bone();
        root.length = 5.0;
        let mut value = skeleton(vec![root, bone()], Some(vec![slot(1)]));
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_path_constraint(&mut value, &path_constraint(vec![0], 0));
        assert!(
            close(value.bones[0].rotation, 0.0),
            "rotation {}",
            value.bones[0].rotation
        );
    }
}

mod source_path_constraint_parity {
    use super::*;

    fn path(vertices: Vec<f32>) -> PathAttachment2D {
        let mut out: PathAttachment2D = flight_entity::allocate_entity();
        out.kind = String::from(PATH_ATTACHMENT_2D_KIND);
        out.point_count = vertices.len() / 2;
        out.commands = vec![1];
        out.commands.resize(out.point_count, 2);
        out.vertices = Some(vertices);
        out.winding = PathWinding::NonZero;
        return out;
    }

    fn rig(chain_length: usize, attachment: Option<PathAttachment2D>) -> Skeleton2D {
        let mut bones = vec![bone()];
        for _ in 0..chain_length {
            let mut chain_bone = bone();
            chain_bone.length = 10.0;
            bones.push(chain_bone);
        }
        let mut path_slot = slot(0);
        path_slot.attachment = attachment.map(|value| {
            let reference: Attachment2DRef = Arc::new(RwLock::new(value));
            reference
        });
        let mut value = skeleton(bones, Some(vec![path_slot]));
        compute_skeleton_2d_world_transforms(&mut value);
        return value;
    }

    fn constraint(
        overrides: impl FnOnce(&mut Skeleton2DPathConstraint),
    ) -> Skeleton2DPathConstraint {
        let mut value = path_constraint(vec![1], 0);
        overrides(&mut value);
        return value;
    }

    #[test]
    fn places_a_bone_at_a_fixed_arc_length_position() {
        let mut value = rig(1, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        solve_skeleton_2d_path_constraint(&mut value, &constraint(|c| c.position = 25.0));
        assert!(close(value.bones[1].x, 25.0));
        assert!(close(value.bones[1].y, 0.0));
    }

    #[test]
    fn reads_position_as_a_path_fraction_in_percent_mode() {
        let mut value = rig(1, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.position = 0.25;
                c.position_mode = String::from(SKELETON_2D_PATH_POSITION_MODE_PERCENT);
            }),
        );
        assert!(close(value.bones[1].x, 25.0));
    }

    #[test]
    fn spaces_a_chain_by_fixed_arc_length() {
        let mut value = rig(3, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.bone_indices = vec![1, 2, 3];
                c.position = 10.0;
                c.spacing = 20.0;
            }),
        );
        assert!(close(value.bones[1].x, 10.0));
        assert!(close(value.bones[2].x, 30.0));
        assert!(close(value.bones[3].x, 50.0));
    }

    #[test]
    fn spaces_by_each_bone_own_length_in_length_mode() {
        let mut value = rig(2, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        value.bones[1].length = 40.0;
        value.bones[2].length = 10.0;
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.bone_indices = vec![1, 2];
                c.spacing = 1.0;
                c.spacing_mode = String::from(SKELETON_2D_PATH_SPACING_MODE_LENGTH);
            }),
        );
        assert!(close(value.bones[1].x, 0.0));
        assert!(close(value.bones[2].x, 40.0));
    }

    #[test]
    fn spaces_by_a_path_fraction_in_percent_mode() {
        let mut value = rig(3, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.bone_indices = vec![1, 2, 3];
                c.spacing = 0.2;
                c.spacing_mode = String::from(SKELETON_2D_PATH_SPACING_MODE_PERCENT);
            }),
        );
        assert!(close(value.bones[1].x, 0.0));
        assert!(close(value.bones[2].x, 20.0));
        assert!(close(value.bones[3].x, 40.0));
    }

    #[test]
    fn clamps_a_negative_position_per_sample_without_shifting_the_chain() {
        let mut value = rig(2, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.bone_indices = vec![1, 2];
                c.position = -30.0;
                c.spacing = 40.0;
            }),
        );
        assert!(close(value.bones[1].x, 0.0));
        assert!(close(value.bones[2].x, 10.0));
    }

    #[test]
    fn clamps_a_chain_running_off_the_end_instead_of_wrapping() {
        let mut value = rig(2, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.bone_indices = vec![1, 2];
                c.position = 90.0;
                c.spacing = 40.0;
            }),
        );
        assert!(close(value.bones[1].x, 90.0));
        assert!(close(value.bones[2].x, 100.0));
    }

    #[test]
    fn rotate_only_turns_the_bone_without_moving_it() {
        let mut value = rig(1, Some(path(vec![0.0, 0.0, 0.0, 100.0])));
        value.bones[1].x = 40.0;
        value.bones[1].y = -7.0;
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.mix_rotate = 1.0;
                c.mix_x = 0.0;
                c.mix_y = 0.0;
                c.position = 10.0;
            }),
        );
        assert!(close(value.bones[1].rotation, 90.0));
        assert_eq!(value.bones[1].x, 40.0);
        assert_eq!(value.bones[1].y, -7.0);
    }

    #[test]
    fn tangent_mode_aims_the_bone_along_the_path() {
        let mut value = rig(1, Some(path(vec![0.0, 0.0, 0.0, 100.0])));
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.mix_rotate = 1.0;
                c.position = 10.0;
            }),
        );
        assert!(close(value.bones[1].rotation, 90.0));
        assert!(close(value.bones[1].y, 10.0));
    }

    #[test]
    fn chain_mode_aims_each_bone_at_the_next_sampled_position() {
        let mut value = rig(2, Some(path(vec![0.0, 0.0, 50.0, 0.0, 50.0, 50.0])));
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.bone_indices = vec![1, 2];
                c.mix_rotate = 1.0;
                c.position = 30.0;
                c.rotate_mode = String::from(SKELETON_2D_PATH_ROTATE_MODE_CHAIN);
                c.spacing = 40.0;
            }),
        );
        assert!(close(value.bones[1].x, 30.0));
        assert!(close(value.bones[2].x, 50.0));
        assert!(close(value.bones[2].y, 20.0));
        assert!(close(value.bones[1].rotation, 45.0));
    }

    #[test]
    fn blends_position_by_mix() {
        let mut value = rig(1, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        value.bones[1].x = 0.0;
        solve_skeleton_2d_path_constraint(
            &mut value,
            &constraint(|c| {
                c.mix = 0.5;
                c.position = 40.0;
            }),
        );
        assert!(close(value.bones[1].x, 20.0));
    }

    #[test]
    fn skips_a_slot_index_outside_the_slot_array() {
        let mut value = rig(1, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        solve_skeleton_2d_path_constraint(&mut value, &constraint(|c| c.target_slot_index = 9));
        assert_eq!(value.bones[1].x, 0.0);
    }

    #[test]
    fn follows_the_path_as_posed_so_a_moved_path_drags_the_chain() {
        let mut value = rig(1, Some(path(vec![0.0, 0.0, 100.0, 0.0])));
        value.bones[0].y = 60.0;
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_path_constraint(&mut value, &constraint(|c| c.position = 25.0));
        assert!(close(value.bones[1].x, 25.0));
        assert!(close(value.bones[1].y, 60.0));
    }
}
