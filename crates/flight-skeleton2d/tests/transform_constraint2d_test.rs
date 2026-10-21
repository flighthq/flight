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

mod source_transform_parity {
    use super::*;

    fn transform_with(
        overrides: impl FnOnce(&mut Skeleton2DTransformConstraint),
    ) -> Skeleton2DTransformConstraint {
        let mut value = transform(vec![0], 1, 1.0);
        value.mix_rotate = 0.0;
        overrides(&mut value);
        return value;
    }

    fn posed_target() -> Bone2D {
        let mut value = bone();
        value.rotation = 40.0;
        value.scale_x = 2.0;
        value.scale_y = 2.0;
        value.shear_y = 10.0;
        value.x = 30.0;
        value.y = 12.0;
        return value;
    }

    #[test]
    fn registration_is_opt_in_and_claims_the_transform_kind() {
        let mut registry = create_skeleton_2d_constraint_registry();
        assert!(
            get_skeleton_2d_constraint_solver(&registry, SKELETON_2D_TRANSFORM_CONSTRAINT_KIND)
                .is_none()
        );
        register_skeleton_2d_transform_constraint_solver(&mut registry);
        assert!(
            get_skeleton_2d_constraint_solver(&registry, SKELETON_2D_TRANSFORM_CONSTRAINT_KIND)
                .is_some()
        );
    }

    #[test]
    fn channel_mix_is_scaled_by_the_constraint_mix() {
        let mut value = skeleton(vec![bone(), bone_at(0.0, 40.0, -1)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(
            &mut value,
            &transform_with(|c| {
                c.mix = 0.5;
                c.mix_rotate = 0.5;
            }),
        );
        assert!(close(value.bones[0].rotation, 10.0));
    }

    #[test]
    fn rotation_offset_adds_to_the_copied_value() {
        let mut value = skeleton(vec![bone(), bone_at(0.0, 40.0, -1)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(
            &mut value,
            &transform_with(|c| {
                c.mix_rotate = 1.0;
                c.offset_rotation = 25.0;
            }),
        );
        assert!(close(value.bones[0].rotation, 65.0));
    }

    #[test]
    fn offsets_each_copied_channel_by_its_own_offset_field() {
        let cases: [(&str, fn(&mut Skeleton2DTransformConstraint), f32); 6] = [
            (
                "rotation",
                |c| {
                    c.mix_rotate = 1.0;
                    c.offset_rotation = 25.0;
                },
                65.0,
            ),
            (
                "scaleX",
                |c| {
                    c.mix_scale_x = 1.0;
                    c.offset_scale_x = 0.5;
                },
                2.5,
            ),
            (
                "scaleY",
                |c| {
                    c.mix_scale_y = 1.0;
                    c.offset_scale_y = 0.5;
                },
                2.5,
            ),
            (
                "shearY",
                |c| {
                    c.mix_shear_y = 1.0;
                    c.offset_shear_y = 15.0;
                },
                25.0,
            ),
            (
                "x",
                |c| {
                    c.mix_x = 1.0;
                    c.offset_x = 7.0;
                },
                37.0,
            ),
            (
                "y",
                |c| {
                    c.mix_y = 1.0;
                    c.offset_y = 7.0;
                },
                19.0,
            ),
        ];
        for (channel, configure, expected) in cases {
            let mut value = skeleton(vec![bone(), posed_target()], None);
            compute_skeleton_2d_world_transforms(&mut value);
            solve_skeleton_2d_transform_constraint(&mut value, &transform_with(configure));
            let actual = match channel {
                "rotation" => value.bones[0].rotation,
                "scaleX" => value.bones[0].scale_x,
                "scaleY" => value.bones[0].scale_y,
                "shearY" => value.bones[0].shear_y,
                "x" => value.bones[0].x,
                _ => value.bones[0].y,
            };
            assert!(close(actual, expected), "{channel}: {actual} != {expected}");
        }
    }

    #[test]
    fn copies_world_position_through_the_constrained_parent_basis() {
        let mut value = skeleton(
            vec![
                bone_at(0.0, 90.0, -1),
                bone_at(0.0, 0.0, 0),
                bone_at(0.0, 0.0, -1),
            ],
            None,
        );
        value.bones[2].x = 0.0;
        value.bones[2].y = 30.0;
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(
            &mut value,
            &transform_with(|c| {
                c.bone_indices = vec![1];
                c.mix_x = 1.0;
                c.mix_y = 1.0;
                c.target_bone_index = 2;
            }),
        );
        compute_skeleton_2d_world_transforms(&mut value);
        assert!(close(value.bones[1].x, 30.0));
        assert!(close(value.bones[1].y, 0.0));
        assert!(close(value.world_matrices[6 + 4], 0.0));
        assert!(close(value.world_matrices[6 + 5], 30.0));
    }

    #[test]
    fn copies_scale_as_a_ratio_of_the_current_world_scale() {
        let mut value = skeleton(vec![bone(), posed_target()], None);
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(
            &mut value,
            &transform_with(|c| c.mix_scale_x = 1.0),
        );
        assert!(close(value.bones[0].scale_x, 2.0));
    }

    #[test]
    fn copies_shear_as_the_departure_of_the_y_axis_from_perpendicular() {
        let mut target = bone();
        target.shear_y = 20.0;
        let mut value = skeleton(vec![bone(), target], None);
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(
            &mut value,
            &transform_with(|c| c.mix_shear_y = 1.0),
        );
        assert!(close(value.bones[0].shear_y, 20.0));
    }

    #[test]
    fn constrains_every_named_bone_not_just_the_first() {
        let mut value = skeleton(vec![bone(), bone(), bone_at(0.0, 40.0, -1)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(
            &mut value,
            &transform_with(|c| {
                c.bone_indices = vec![0, 1];
                c.mix_rotate = 1.0;
                c.target_bone_index = 2;
            }),
        );
        assert!(close(value.bones[0].rotation, 40.0));
        assert!(close(value.bones[1].rotation, 40.0));
    }

    #[test]
    fn skips_out_of_range_bone_and_target_indices() {
        let mut value = skeleton(vec![bone(), bone_at(0.0, 40.0, -1)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_transform_constraint(
            &mut value,
            &transform_with(|c| {
                c.bone_indices = vec![9];
                c.mix_rotate = 1.0;
            }),
        );
        solve_skeleton_2d_transform_constraint(
            &mut value,
            &transform_with(|c| {
                c.mix_rotate = 1.0;
                c.target_bone_index = 9;
            }),
        );
        assert!(close(value.bones[0].rotation, 0.0));
    }
}
