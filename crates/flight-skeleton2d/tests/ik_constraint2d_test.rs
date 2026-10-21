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

mod source_ik_parity {
    use super::*;
    use std::sync::RwLock;

    fn ik_with(overrides: impl FnOnce(&mut Skeleton2DIkConstraint)) -> Skeleton2DIkConstraint {
        let mut value = ik(vec![0], 1, 1.0, false, false, true);
        overrides(&mut value);
        return value;
    }

    fn chain(parent_length: f32, child_length: f32, target_x: f32, target_y: f32) -> Skeleton2D {
        let mut value = skeleton(
            vec![
                bone_at(0.0, 0.0, parent_length, -1),
                bone_at(parent_length, 0.0, child_length, 0),
                bone_at(target_x, target_y, 0.0, -1),
            ],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        return value;
    }

    #[test]
    fn registration_is_opt_in_and_reaches_the_solver_through_dispatch() {
        let mut registry = create_skeleton_2d_constraint_registry();
        assert!(
            get_skeleton_2d_constraint_solver(&registry, SKELETON_2D_IK_CONSTRAINT_KIND).is_none()
        );
        register_skeleton_2d_ik_constraint_solver(&mut registry);
        assert!(
            get_skeleton_2d_constraint_solver(&registry, SKELETON_2D_IK_CONSTRAINT_KIND).is_some()
        );
        let mut value = skeleton(
            vec![bone_at(0.0, 0.0, 10.0, -1), bone_at(0.0, 20.0, 0.0, -1)],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        let constraint: Skeleton2DConstraintRef =
            Arc::new(RwLock::new(ik(vec![0], 1, 1.0, false, false, true)));
        solve_skeleton_2d_constraints(&registry, &mut value, &[constraint]);
        assert!(close(value.bones[0].rotation, 90.0));
    }

    #[test]
    fn solves_in_parent_space_without_double_counting_the_parent_rotation() {
        let mut value = skeleton(
            vec![
                bone_at(0.0, 0.0, 10.0, -1),
                bone_at(0.0, 0.0, 10.0, 0),
                bone_at(30.0, 0.0, 0.0, -1),
            ],
            None,
        );
        value.bones[0].rotation = 90.0;
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_ik_constraint(
            &mut value,
            &ik_with(|c| {
                c.bone_indices = vec![1];
                c.target_bone_index = 2;
            }),
        );
        assert!(close(value.bones[1].rotation, -90.0));
    }

    #[test]
    fn stretch_lengthens_the_tip_onto_a_far_target_uniformly() {
        let mut value = skeleton(
            vec![bone_at(0.0, 0.0, 10.0, -1), bone_at(25.0, 0.0, 0.0, -1)],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_ik_constraint(&mut value, &ik_with(|c| c.stretch = true));
        assert!(close(tip(&value, 0).0, 25.0));
        assert!(close(value.bones[0].scale_x, 2.5));
        assert!(close(value.bones[0].scale_y, 2.5));
    }

    #[test]
    fn compress_shortens_the_tip_onto_a_near_target() {
        let mut value = skeleton(
            vec![bone_at(0.0, 0.0, 10.0, -1), bone_at(4.0, 0.0, 0.0, -1)],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_ik_constraint(&mut value, &ik_with(|c| c.compress = true));
        assert!(close(tip(&value, 0).0, 4.0));
        assert!(close(value.bones[0].scale_x, 0.4));
    }

    #[test]
    fn a_stretch_only_bone_does_not_contract() {
        let mut value = skeleton(
            vec![bone_at(0.0, 0.0, 10.0, -1), bone_at(4.0, 0.0, 0.0, -1)],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_ik_constraint(&mut value, &ik_with(|c| c.stretch = true));
        assert!(close(value.bones[0].scale_x, 1.0));
        assert!(close(tip(&value, 0).0, 10.0));
    }

    #[test]
    fn a_compress_only_bone_does_not_extend() {
        let mut value = skeleton(
            vec![bone_at(0.0, 0.0, 10.0, -1), bone_at(25.0, 0.0, 0.0, -1)],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_ik_constraint(&mut value, &ik_with(|c| c.compress = true));
        assert!(close(value.bones[0].scale_x, 1.0));
        assert!(close(tip(&value, 0).0, 10.0));
    }

    #[test]
    fn blends_stretch_by_mix() {
        let mut value = skeleton(
            vec![bone_at(0.0, 0.0, 10.0, -1), bone_at(25.0, 0.0, 0.0, -1)],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_ik_constraint(
            &mut value,
            &ik_with(|c| {
                c.mix = 0.5;
                c.stretch = true;
            }),
        );
        assert!(close(value.bones[0].scale_x, 1.75));
        assert!(close(tip(&value, 0).0, 17.5));
    }

    #[test]
    fn two_bone_chain_lands_on_a_target_inside_its_reach() {
        let mut value = chain(10.0, 10.0, 12.0, 6.0);
        solve_skeleton_2d_ik_constraint(
            &mut value,
            &ik_with(|c| {
                c.bone_indices = vec![0, 1];
                c.target_bone_index = 2;
            }),
        );
        compute_skeleton_2d_world_transforms(&mut value);
        let (x, y) = tip(&value, 1);
        assert!(close(x, 12.0));
        assert!(close(y, 6.0));
    }

    #[test]
    fn bend_positive_mirrors_the_elbow_about_the_target_line() {
        let build = |bend_positive: bool| {
            let mut value = chain(10.0, 10.0, 12.0, 6.0);
            solve_skeleton_2d_ik_constraint(
                &mut value,
                &ik_with(|c| {
                    c.bend_positive = bend_positive;
                    c.bone_indices = vec![0, 1];
                    c.target_bone_index = 2;
                }),
            );
            compute_skeleton_2d_world_transforms(&mut value);
            return value;
        };
        let up = build(true);
        let down = build(false);
        let up_tip = tip(&up, 1);
        let down_tip = tip(&down, 1);
        assert!(close(up_tip.0, down_tip.0));
        assert!(close(up_tip.1, down_tip.1));
        assert!((up.world_matrices[6 + 5] - down.world_matrices[6 + 5]).abs() > 0.01);
    }

    #[test]
    fn folds_flat_and_overshoots_a_target_inside_the_dead_zone() {
        let mut value = chain(10.0, 6.0, 2.0, 0.0);
        solve_skeleton_2d_ik_constraint(
            &mut value,
            &ik_with(|c| {
                c.bone_indices = vec![0, 1];
                c.target_bone_index = 2;
            }),
        );
        compute_skeleton_2d_world_transforms(&mut value);
        assert!(close(value.world_matrices[6 + 4], 10.0));
        let (x, y) = tip(&value, 1);
        assert!(close(x, 4.0));
        assert!(close(y, 0.0));
    }

    #[test]
    fn a_stretchless_chain_straightens_and_falls_short_of_an_unreachable_target() {
        let mut value = chain(10.0, 10.0, 40.0, 0.0);
        solve_skeleton_2d_ik_constraint(
            &mut value,
            &ik_with(|c| {
                c.bone_indices = vec![0, 1];
                c.target_bone_index = 2;
            }),
        );
        compute_skeleton_2d_world_transforms(&mut value);
        let (x, y) = tip(&value, 1);
        assert!(close(x, 20.0));
        assert!(close(y, 0.0));
    }

    #[test]
    fn a_stretching_chain_reaches_an_unreachable_target() {
        let mut value = chain(10.0, 10.0, 40.0, 0.0);
        solve_skeleton_2d_ik_constraint(
            &mut value,
            &ik_with(|c| {
                c.bone_indices = vec![0, 1];
                c.stretch = true;
                c.target_bone_index = 2;
            }),
        );
        compute_skeleton_2d_world_transforms(&mut value);
        assert!(close(tip(&value, 1).0, 40.0));
        assert!(close(value.bones[0].scale_x, 2.0));
    }

    #[test]
    fn places_the_tip_correctly_across_the_whole_reach_space() {
        let lengths = [10.0f32, 6.0, 3.0, 12.5];
        let targets = [-8.0f32, -2.0, -0.5, 0.5, 2.0, 5.0, 9.0, 30.0];
        let mut checked = 0;
        for parent_length in lengths {
            for child_length in lengths {
                for target_x in targets {
                    for target_y in [0.0f32, -3.0, 4.5] {
                        for bend_positive in [true, false] {
                            let mut value = chain(parent_length, child_length, target_x, target_y);
                            solve_skeleton_2d_ik_constraint(
                                &mut value,
                                &ik_with(|c| {
                                    c.bend_positive = bend_positive;
                                    c.bone_indices = vec![0, 1];
                                    c.target_bone_index = 2;
                                }),
                            );
                            compute_skeleton_2d_world_transforms(&mut value);
                            let reach = (target_x * target_x + target_y * target_y).sqrt();
                            if reach == 0.0 {
                                continue;
                            }
                            let span = parent_length + child_length;
                            let fold = (parent_length - child_length).abs();
                            let wanted = if reach > span {
                                span
                            } else if reach < fold {
                                fold
                            } else {
                                reach
                            };
                            let (x, y) = tip(&value, 1);
                            let where_ = format!(
                                "p={parent_length} c={child_length} t=({target_x},{target_y}) bend={bend_positive}"
                            );
                            assert!(
                                close(x, wanted * target_x / reach),
                                "{where_} tip.x {x} expected {}",
                                wanted * target_x / reach
                            );
                            assert!(
                                close(y, wanted * target_y / reach),
                                "{where_} tip.y {y} expected {}",
                                wanted * target_y / reach
                            );
                            checked += 1;
                        }
                    }
                }
            }
        }
        assert!(checked > 700);
    }

    #[test]
    fn skips_a_three_bone_chain_rather_than_posing_it() {
        let mut value = skeleton(
            vec![
                bone_at(0.0, 0.0, 10.0, -1),
                bone_at(10.0, 0.0, 10.0, 0),
                bone_at(20.0, 0.0, 10.0, 1),
                bone_at(5.0, 5.0, 0.0, -1),
            ],
            None,
        );
        compute_skeleton_2d_world_transforms(&mut value);
        solve_skeleton_2d_ik_constraint(
            &mut value,
            &ik_with(|c| {
                c.bone_indices = vec![0, 1, 2];
                c.target_bone_index = 3;
            }),
        );
        assert!(close(value.bones[0].rotation, 0.0));
    }
}
