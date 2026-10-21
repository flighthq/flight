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
