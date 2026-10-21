use std::sync::{Arc, RwLock};

use flight_skeleton2d::contract::*;

use crate::support::*;

fn ik(
    bones: Vec<i32>,
    target: i32,
    mix: f32,
    stretch: bool,
    compress: bool,
    bend_positive: bool,
) -> Skeleton2DIkConstraint {
    let mut value: Skeleton2DIkConstraint = flight_entity::allocate_entity();
    value.kind = String::from(SKELETON_2D_IK_CONSTRAINT_KIND);
    value.bone_indices = bones;
    value.target_bone_index = target;
    value.mix = mix;
    value.stretch = stretch;
    value.compress = compress;
    value.bend_positive = bend_positive;
    return value;
}

fn bone_at(x: f32, y: f32, length: f32, parent: i32) -> Bone2D {
    let mut value = bone();
    value.x = x;
    value.y = y;
    value.length = length;
    value.parent_index = parent;
    return value;
}

fn single_chain(target_x: f32, target_y: f32) -> Skeleton2D {
    let mut value = skeleton(
        vec![
            bone_at(0.0, 0.0, 10.0, -1),
            bone_at(target_x, target_y, 0.0, -1),
        ],
        None,
    );
    compute_skeleton_2d_world_transforms(&mut value);
    return value;
}

fn tip(skeleton: &Skeleton2D, bone_index: i32) -> (f32, f32) {
    let o = bone_index as usize * SKELETON_2D_MATRIX_STRIDE;
    let bone = &skeleton.bones[bone_index as usize];
    return (
        skeleton.world_matrices[o + 4] + skeleton.world_matrices[o] * bone.length,
        skeleton.world_matrices[o + 5] + skeleton.world_matrices[o + 1] * bone.length,
    );
}

mod register_skeleton_2d_ik_constraint_solver {
    use super::*;

    #[test]
    fn claims_the_ik_kind() {
        let mut registry = create_skeleton_2d_constraint_registry();
        register_skeleton_2d_ik_constraint_solver(&mut registry);
        assert!(
            get_skeleton_2d_constraint_solver(&registry, SKELETON_2D_IK_CONSTRAINT_KIND).is_some()
        );
    }
}

mod solve_skeleton_2d_ik_constraint {
    use super::*;

    #[test]
    fn aims_a_single_bone_at_the_target_in_degrees() {
        let mut value = single_chain(0.0, 10.0);
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0], 1, 1.0, false, false, true));
        assert!(close(value.bones[0].rotation, 90.0));
    }

    #[test]
    fn blends_by_mix() {
        let mut value = single_chain(0.0, 10.0);
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0], 1, 0.5, false, false, true));
        assert!(close(value.bones[0].rotation, 45.0));
    }

    #[test]
    fn takes_the_short_way_round() {
        let mut value = skeleton(
            vec![bone_at(0.0, 0.0, 10.0, -1), bone_at(0.0, -10.0, 0.0, -1)],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        value.bones[0].rotation = 170.0;
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0], 1, 1.0, false, false, true));
        let mut normalized = value.bones[0].rotation % 360.0;
        if normalized > 180.0 {
            normalized -= 360.0;
        }
        assert!(close(normalized, -90.0));
    }

    #[test]
    fn lengthens_a_single_bone_when_stretch_is_on() {
        let mut value = single_chain(20.0, 0.0);
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0], 1, 1.0, true, false, true));
        assert!(close(value.bones[0].scale_x, 2.0));
    }

    #[test]
    fn shortens_a_single_bone_when_compress_is_on() {
        let mut value = single_chain(5.0, 0.0);
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0], 1, 1.0, false, true, true));
        assert!(close(value.bones[0].scale_x, 0.5));
    }

    #[test]
    fn leaves_a_stretch_only_bone_alone_when_the_target_is_nearer() {
        let mut value = single_chain(5.0, 0.0);
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0], 1, 1.0, true, false, true));
        assert!(close(value.bones[0].scale_x, 1.0));
    }

    #[test]
    fn skips_a_chain_length_it_does_not_solve() {
        let mut value = single_chain(0.0, 10.0);
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0, 1, 1], 1, 1.0, false, false, true));
        assert!(close(value.bones[0].rotation, 0.0));
    }

    #[test]
    fn skips_a_target_index_outside_the_bone_array() {
        let mut value = single_chain(0.0, 10.0);
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0], 9, 1.0, false, false, true));
        assert!(close(value.bones[0].rotation, 0.0));
    }

    #[test]
    fn lands_a_two_bone_chain_tip_on_a_reachable_target() {
        let mut value = skeleton(
            vec![
                bone_at(0.0, 0.0, 10.0, -1),
                bone_at(10.0, 0.0, 10.0, 0),
                bone_at(10.0, 10.0, 0.0, -1),
            ],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0, 1], 2, 1.0, false, false, true));
        compute_skeleton_2d_world_transforms(&mut value);
        let (x, y) = tip(&value, 1);
        assert!(close(x, 10.0) && close(y, 10.0));
    }

    #[test]
    fn mirrors_the_elbow_with_bend_positive_while_landing_the_tip() {
        let build = || {
            let mut value = skeleton(
                vec![
                    bone_at(0.0, 0.0, 10.0, -1),
                    bone_at(10.0, 0.0, 10.0, 0),
                    bone_at(10.0, 10.0, 0.0, -1),
                ],
                None,
            );
            compute_skeleton_2d_world_transforms(&mut value);
            return value;
        };
        let mut positive = build();
        let mut negative = build();
        solve_skeleton_2d_ik_constraint(&mut positive, &ik(vec![0, 1], 2, 1.0, false, false, true));
        solve_skeleton_2d_ik_constraint(
            &mut negative,
            &ik(vec![0, 1], 2, 1.0, false, false, false),
        );
        compute_skeleton_2d_world_transforms(&mut positive);
        compute_skeleton_2d_world_transforms(&mut negative);
        assert!((positive.bones[1].rotation - negative.bones[1].rotation).abs() > 1.0);
        assert!(close(tip(&positive, 1).0, 10.0));
        assert!(close(tip(&negative, 1).0, 10.0));
    }

    #[test]
    fn reaches_an_unreachable_target_when_stretch_is_on() {
        let mut value = skeleton(
            vec![
                bone_at(0.0, 0.0, 10.0, -1),
                bone_at(10.0, 0.0, 10.0, 0),
                bone_at(30.0, 0.0, 0.0, -1),
            ],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_ik_constraint(&mut value, &ik(vec![0, 1], 2, 1.0, true, false, true));
        assert!(close(value.bones[0].scale_x, 1.5));
    }
}
