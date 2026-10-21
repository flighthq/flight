use flight_skeleton2d::contract::*;

use crate::support::*;

fn transform(bones: Vec<i32>, target: i32, mix: f32) -> Skeleton2DTransformConstraint {
    let mut value: Skeleton2DTransformConstraint = flight_entity::allocate_entity();
    value.kind = String::from(SKELETON_2D_TRANSFORM_CONSTRAINT_KIND);
    value.bone_indices = bones;
    value.target_bone_index = target;
    value.mix = mix;
    value.mix_rotate = 1.0;
    value.mix_scale_x = 0.0;
    value.mix_scale_y = 0.0;
    value.mix_shear_y = 0.0;
    value.mix_x = 0.0;
    value.mix_y = 0.0;
    return value;
}

fn bone_at(x: f32, rotation: f32, parent: i32) -> Bone2D {
    let mut value = bone();
    value.x = x;
    value.rotation = rotation;
    value.parent_index = parent;
    return value;
}

mod register_skeleton_2d_transform_constraint_solver {
    use super::*;

    #[test]
    fn claims_the_transform_kind() {
        let mut registry = create_skeleton_2d_constraint_registry();
        register_skeleton_2d_transform_constraint_solver(&mut registry);
        assert!(
            get_skeleton_2d_constraint_solver(&registry, SKELETON_2D_TRANSFORM_CONSTRAINT_KIND)
                .is_some()
        );
    }
}

mod solve_skeleton_2d_transform_constraint {
    use super::*;

    #[test]
    fn copies_the_target_world_rotation_onto_the_constrained_bone() {
        let mut value = skeleton(vec![bone_at(0.0, 30.0, -1), bone_at(0.0, 0.0, -1)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(&mut value, &transform(vec![1], 0, 1.0));
        assert!(close(value.bones[1].rotation, 30.0));
    }

    #[test]
    fn leaves_channels_it_was_not_told_to_copy_alone() {
        let mut value = skeleton(vec![bone_at(5.0, 0.0, -1), bone_at(2.0, 0.0, -1)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(&mut value, &transform(vec![1], 0, 1.0));
        assert!(close(value.bones[1].x, 2.0));
    }

    #[test]
    fn blends_the_copied_rotation_by_mix() {
        let mut value = skeleton(vec![bone_at(0.0, 40.0, -1), bone_at(0.0, 0.0, -1)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(&mut value, &transform(vec![1], 0, 0.5));
        assert!(close(value.bones[1].rotation, 20.0));
    }
}
