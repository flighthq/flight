use flight_geometry::create_matrix;
use flight_skeleton2d::contract::*;

use crate::support::*;

fn root_rotated(rotation: f32) -> Bone2D {
    let mut value = bone();
    value.rotation = rotation;
    return value;
}

fn child(parent_index: i32, x: f32, y: f32) -> Bone2D {
    let mut value = bone();
    value.parent_index = parent_index;
    value.x = x;
    value.y = y;
    return value;
}

mod clone_skeleton_2d {
    use super::*;

    #[test]
    fn deep_copies_bones_so_the_clone_poses_independently() {
        let mut source = skeleton(vec![root_rotated(30.0)], None);
        let mut clone = clone_skeleton_2d(&source);
        clone.bones[0].rotation = 90.0;
        source.bones[0].rotation = 30.0;
        assert!(close(source.bones[0].rotation, 30.0));
        assert!(close(clone.bones[0].rotation, 90.0));
        clone.world_matrices[0] = 5.0;
        assert_ne!(clone.world_matrices[0], source.world_matrices[0]);
    }

    #[test]
    fn includes_skins_so_get_skeleton_2d_skin_works_on_the_clone() {
        let mut source = skeleton(vec![bone()], Some(vec![slot(0)]));
        source.skins = Some(vec![AttachmentSkin2D {
            attachments: Vec::new(),
            name: String::from("goblin"),
        }]);
        let clone = clone_skeleton_2d(&source);
        assert_eq!(
            get_skeleton_2d_skin(&clone, "goblin").map(|skin| skin.name.as_str()),
            Some("goblin")
        );
    }
}

mod compute_skeleton_2d_bone_matrices {
    use super::*;

    #[test]
    fn yields_identity_palettes_at_the_captured_bind_pose() {
        let mut value = skeleton(vec![child(-1, 0.0, 0.0), child(0, 5.0, 0.0)], None);
        value.bones[0].rotation = 45.0;
        value.bones[0].x = 10.0;
        compute_skeleton_2d_world_transforms(&mut value);
        set_skeleton_2d_bind_pose(&mut value);
        compute_skeleton_2d_bone_matrices(&mut value);
        for i in 0..value.bones.len() {
            let o = i * SKELETON_2D_MATRIX_STRIDE;
            assert!(close(value.bone_matrices[o], 1.0));
            assert!(close(value.bone_matrices[o + 1], 0.0));
            assert!(close(value.bone_matrices[o + 3], 1.0));
            assert!(close(value.bone_matrices[o + 4], 0.0));
        }
        value.bones[0].rotation = 90.0;
        compute_skeleton_2d_world_transforms(&mut value);
        compute_skeleton_2d_bone_matrices(&mut value);
        assert!((value.bone_matrices[0] - 1.0).abs() > 1e-3 || value.bone_matrices[1].abs() > 1e-3);
    }
}

mod compute_skeleton_2d_bone_world_transform {
    use super::*;

    #[test]
    fn refreshes_one_bone_and_leaves_its_descendants_stale() {
        let mut value = skeleton(vec![bone(), child(0, 10.0, 0.0), child(1, 10.0, 0.0)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        value.bones[1].rotation = 90.0;
        compute_skeleton_2d_bone_world_transform(&mut value, 1);
        assert!(close(value.world_matrices[6], 0.0));
        assert!(close(value.world_matrices[7], 1.0));
        assert!(close(value.world_matrices[2 * 6 + 4], 20.0));
        compute_skeleton_2d_world_transforms(&mut value);
        assert!(close(value.world_matrices[2 * 6 + 4], 10.0));
        assert!(close(value.world_matrices[2 * 6 + 5], 10.0));
    }

    #[test]
    fn ignores_an_out_of_range_bone_index() {
        let mut value = skeleton(vec![bone()], None);
        compute_skeleton_2d_world_transforms(&mut value);
        compute_skeleton_2d_bone_world_transform(&mut value, 7);
        compute_skeleton_2d_bone_world_transform(&mut value, -1);
        assert!(close(value.world_matrices[0], 1.0));
    }
}

mod compute_skeleton_2d_world_transforms {
    use super::*;

    #[test]
    fn rotates_a_root_into_its_expected_world_matrix() {
        let mut value = skeleton(vec![root_rotated(90.0)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        assert!(close(value.world_matrices[0], 0.0));
        assert!(close(value.world_matrices[1], 1.0));
        assert!(close(value.world_matrices[2], -1.0));
        assert!(close(value.world_matrices[3], 0.0));
    }

    #[test]
    fn places_a_child_at_parent_times_local() {
        let mut value = skeleton(vec![root_rotated(90.0), child(0, 2.0, 0.0)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        assert!(close(value.world_matrices[6 + 4], 0.0));
        assert!(close(value.world_matrices[6 + 5], 2.0));
    }

    #[test]
    fn honors_the_inherit_presets() {
        let mut only_translation = skeleton(vec![root_rotated(90.0), child(0, 2.0, 0.0)], None);
        only_translation.bones[1].transform_mode = TRANSFORM_MODE_2D_ONLY_TRANSLATION;
        compute_skeleton_2d_world_transforms(&mut only_translation);
        assert!(close(only_translation.world_matrices[6], 1.0));
        assert!(close(only_translation.world_matrices[6 + 4], 0.0));
        assert!(close(only_translation.world_matrices[6 + 5], 2.0));

        let mut no_scale = skeleton(vec![root_rotated(0.0), child(0, 1.0, 0.0)], None);
        no_scale.bones[0].scale_x = 2.0;
        no_scale.bones[0].scale_y = 1.0;
        no_scale.bones[1].transform_mode = TRANSFORM_MODE_2D_NO_SCALE;
        compute_skeleton_2d_world_transforms(&mut no_scale);
        assert!(close(no_scale.world_matrices[6], 1.0));
        assert!(close(no_scale.world_matrices[6 + 4], 2.0));
    }

    #[test]
    fn applies_shear_to_the_x_axis_angle() {
        let mut value = skeleton(vec![root_rotated(0.0)], None);
        value.bones[0].shear_x = 30.0;
        compute_skeleton_2d_world_transforms(&mut value);
        assert!(close(value.world_matrices[0], 30.0f32.to_radians().cos()));
        assert!(close(value.world_matrices[1], 30.0f32.to_radians().sin()));
    }
}

mod create_skeleton_2d {
    use super::*;

    #[test]
    fn sizes_the_flat_buffers_to_six_floats_per_bone() {
        let value = create_skeleton_2d(vec![bone(), bone()], None);
        assert_eq!(value.world_matrices.len(), 2 * SKELETON_2D_MATRIX_STRIDE);
        assert_eq!(
            value.inverse_bind_matrices.len(),
            2 * SKELETON_2D_MATRIX_STRIDE
        );
        assert_eq!(value.bone_matrices.len(), 2 * SKELETON_2D_MATRIX_STRIDE);
    }
}

mod dispose_skeleton_2d {
    use super::*;

    #[test]
    fn clears_bones_and_slots() {
        let mut value = skeleton(vec![bone()], Some(vec![slot(0)]));
        dispose_skeleton_2d(&mut value);
        assert!(value.bones.is_empty());
        assert!(value.slots.is_none());
    }
}

mod equals_skeleton_2d {
    use super::*;

    #[test]
    fn is_true_for_a_clone_and_false_after_an_edit() {
        let mut source = skeleton(vec![root_rotated(10.0)], None);
        let clone = clone_skeleton_2d(&source);
        assert!(equals_skeleton_2d(&source, &clone));
        source.bones[0].rotation = 20.0;
        assert!(!equals_skeleton_2d(&source, &clone));
        assert!(equals_skeleton_2d(&source, &source));
    }
}

mod get_skeleton_2d_bone_index_by_name {
    use super::*;

    #[test]
    fn finds_a_named_bone_and_returns_minus_one_for_a_miss() {
        let mut named = bone();
        named.name = Some(String::from("root"));
        let value = skeleton(vec![named], None);
        assert_eq!(get_skeleton_2d_bone_index_by_name(&value, "root"), 0);
        assert_eq!(get_skeleton_2d_bone_index_by_name(&value, "missing"), -1);
    }
}

mod get_skeleton_2d_bone_world_matrix {
    use super::*;

    #[test]
    fn writes_in_range_and_returns_false_out_of_range() {
        let mut value = skeleton(vec![bone()], None);
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 0));
        assert!(close(out.a, 1.0));
        assert!(!get_skeleton_2d_bone_world_matrix(&mut out, &value, 2));
    }
}

mod get_skeleton_2d_skin {
    use super::*;

    #[test]
    fn finds_a_skin_by_name_and_returns_none_otherwise() {
        let mut value = skeleton(vec![bone()], None);
        assert!(get_skeleton_2d_skin(&value, "goblin").is_none());
        value.skins = Some(vec![AttachmentSkin2D {
            attachments: Vec::new(),
            name: String::from("goblin"),
        }]);
        assert_eq!(
            get_skeleton_2d_skin(&value, "goblin").map(|skin| skin.name.as_str()),
            Some("goblin")
        );
        assert!(get_skeleton_2d_skin(&value, "other").is_none());
    }
}

mod initialize_skeleton_2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create() {
        let mut value = skeleton(vec![bone()], None);
        initialize_skeleton_2d(
            &mut value,
            vec![1.0; 6],
            vec![bone()],
            vec![2.0; 6],
            None,
            None,
            vec![3.0; 6],
        );
        assert_eq!(value.bone_matrices[0], 1.0);
        assert_eq!(value.inverse_bind_matrices[0], 2.0);
        assert_eq!(value.world_matrices[0], 3.0);
    }
}

mod reset_skeleton_2d_to_setup {
    use super::*;

    #[test]
    fn copies_every_animatable_local_transform() {
        let setup = skeleton(vec![root_rotated(10.0)], None);
        let mut pose = clone_skeleton_2d(&setup);
        pose.bones[0].rotation = 90.0;
        pose.bones[0].scale_x = 3.0;
        pose.bones[0].shear_x = 4.0;
        pose.bones[0].x = 5.0;
        reset_skeleton_2d_to_setup(&setup, &mut pose);
        assert!(close(pose.bones[0].rotation, 10.0));
        assert!(close(pose.bones[0].scale_x, 1.0));
        assert!(close(pose.bones[0].shear_x, 0.0));
        assert!(close(pose.bones[0].x, 0.0));
    }

    #[test]
    #[should_panic(expected = "setup and pose must contain the same number of bones")]
    fn rejects_structurally_incompatible_skeletons() {
        let setup = skeleton(vec![bone()], None);
        let mut pose = skeleton(vec![bone(), bone()], None);
        reset_skeleton_2d_to_setup(&setup, &mut pose);
    }
}

mod set_skeleton_2d_bind_pose {
    use super::*;

    #[test]
    fn captures_the_inverse_world_so_the_palette_is_identity_at_bind() {
        let mut value = skeleton(vec![root_rotated(45.0)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        set_skeleton_2d_bind_pose(&mut value);
        compute_skeleton_2d_bone_matrices(&mut value);
        assert!(close(value.bone_matrices[0], 1.0));
        assert!(close(value.bone_matrices[3], 1.0));
    }
}

mod set_skeleton_2d_skin {
    use super::*;

    #[test]
    fn writes_named_attachments_and_leaves_unmentioned_slots_alone() {
        let mut value = skeleton(vec![bone()], Some(vec![slot(0), slot(0)]));
        set_skeleton_2d_skin(
            &mut value,
            &AttachmentSkin2D {
                attachments: vec![SkinAttachment2D {
                    attachment: region_ref(region(1.0, 1.0)),
                    name: String::from("hat"),
                    slot_index: 0,
                }],
                name: String::from("goblin"),
            },
        );
        let slots = value.slots.unwrap();
        assert!(slots[0].attachment.is_some());
        assert!(slots[1].attachment.is_none());
    }

    #[test]
    fn skips_an_entry_naming_a_slot_outside_the_skeleton() {
        let mut value = skeleton(vec![bone()], Some(vec![slot(0)]));
        set_skeleton_2d_skin(
            &mut value,
            &AttachmentSkin2D {
                attachments: vec![SkinAttachment2D {
                    attachment: region_ref(region(1.0, 1.0)),
                    name: String::from("hat"),
                    slot_index: 9,
                }],
                name: String::from("goblin"),
            },
        );
        assert!(value.slots.unwrap()[0].attachment.is_none());
    }

    #[test]
    fn is_a_no_op_with_no_slots() {
        let mut value = skeleton(vec![bone()], None);
        set_skeleton_2d_skin(
            &mut value,
            &AttachmentSkin2D {
                attachments: Vec::new(),
                name: String::from("goblin"),
            },
        );
        assert!(value.slots.is_none());
    }
}

mod source_formula_parity {
    use super::*;
    use std::sync::Arc;

    fn root(x: f32, y: f32, rotation: f32) -> Bone2D {
        let mut value = bone();
        value.x = x;
        value.y = y;
        value.rotation = rotation;
        return value;
    }

    #[test]
    fn bone_palette_is_identity_in_all_six_components_at_bind() {
        let mut value = skeleton(vec![root(10.0, 0.0, 45.0), child(0, 5.0, 0.0)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        set_skeleton_2d_bind_pose(&mut value);
        compute_skeleton_2d_bone_matrices(&mut value);
        for index in 0..value.bones.len() {
            let offset = index * SKELETON_2D_MATRIX_STRIDE;
            assert!(close(value.bone_matrices[offset], 1.0));
            assert!(close(value.bone_matrices[offset + 1], 0.0));
            assert!(close(value.bone_matrices[offset + 2], 0.0));
            assert!(close(value.bone_matrices[offset + 3], 1.0));
            assert!(close(value.bone_matrices[offset + 4], 0.0));
            assert!(close(value.bone_matrices[offset + 5], 0.0));
        }
    }

    #[test]
    fn root_rotation_places_translation_in_the_world_matrix() {
        let mut value = skeleton(vec![root(10.0, 0.0, 90.0)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        assert!(close(value.world_matrices[0], 0.0));
        assert!(close(value.world_matrices[1], 1.0));
        assert!(close(value.world_matrices[2], -1.0));
        assert!(close(value.world_matrices[3], 0.0));
        assert!(close(value.world_matrices[4], 10.0));
        assert!(close(value.world_matrices[5], 0.0));
    }

    #[test]
    fn child_composes_parent_translation_and_rotation() {
        let mut value = skeleton(vec![root(10.0, 0.0, 90.0), child(0, 2.0, 0.0)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 1));
        assert!(close(out.tx, 10.0));
        assert!(close(out.ty, 2.0));
    }

    #[test]
    fn only_translation_keeps_parent_position_but_not_rotation() {
        let mut value = skeleton(vec![root(0.0, 0.0, 90.0), child(0, 3.0, 0.0)], None);
        value.bones[1].transform_mode = TRANSFORM_MODE_2D_ONLY_TRANSLATION;
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 1));
        assert!(close(out.a, 1.0));
        assert!(close(out.b, 0.0));
        assert!(close(out.c, 0.0));
        assert!(close(out.d, 1.0));
        assert!(close(out.tx, 0.0));
        assert!(close(out.ty, 3.0));
    }

    #[test]
    fn no_scale_strips_a_uniform_three_times_parent_scale() {
        let mut value = skeleton(vec![root(0.0, 0.0, 0.0), child(0, 0.0, 0.0)], None);
        value.bones[0].scale_x = 3.0;
        value.bones[0].scale_y = 3.0;
        value.bones[1].transform_mode = TRANSFORM_MODE_2D_NO_SCALE;
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 1));
        assert!(close(out.a, 1.0));
        assert!(close(out.b, 0.0));
        assert!(close(out.c, 0.0));
        assert!(close(out.d, 1.0));
    }

    #[test]
    fn no_rotation_or_reflection_strips_rotation_and_keeps_two_times_scale() {
        let mut value = skeleton(vec![root(0.0, 0.0, 90.0), child(0, 0.0, 0.0)], None);
        value.bones[0].scale_x = 2.0;
        value.bones[0].scale_y = 2.0;
        value.bones[1].transform_mode = TRANSFORM_MODE_2D_NO_ROTATION_OR_REFLECTION;
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 1));
        assert!(close(out.a, 2.0));
        assert!(close(out.b, 0.0));
        assert!(close(out.c, 0.0));
        assert!(close(out.d, 2.0));
    }

    #[test]
    fn no_scale_or_reflection_never_flips_under_a_reflected_parent() {
        let mut value = skeleton(vec![root(0.0, 0.0, 0.0), child(0, 0.0, 0.0)], None);
        value.bones[0].scale_x = -2.0;
        value.bones[0].scale_y = 2.0;
        value.bones[1].transform_mode = TRANSFORM_MODE_2D_NO_SCALE_OR_REFLECTION;
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 1));
        assert!(close(out.a * out.d - out.c * out.b, 1.0));
    }

    #[test]
    fn formula_normal_composes_asymmetric_parent_with_a_rotated_child() {
        let mut value = skeleton(vec![root(0.0, 0.0, 90.0), child(0, 0.0, 0.0)], None);
        value.bones[0].scale_x = 2.0;
        value.bones[0].scale_y = 1.0;
        value.bones[1].rotation = 90.0;
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 1));
        assert!(close(out.a, -1.0));
        assert!(close(out.b, 0.0));
        assert!(close(out.c, 0.0));
        assert!(close(out.d, -2.0));
    }

    #[test]
    fn formula_no_rotation_or_reflection_keeps_per_axis_parent_scale() {
        let mut value = skeleton(vec![root(0.0, 0.0, 90.0), child(0, 0.0, 0.0)], None);
        value.bones[0].scale_x = 2.0;
        value.bones[0].scale_y = 1.0;
        value.bones[1].transform_mode = TRANSFORM_MODE_2D_NO_ROTATION_OR_REFLECTION;
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 1));
        assert!(close(out.a, 2.0));
        assert!(close(out.b, 0.0));
        assert!(close(out.c, 0.0));
        assert!(close(out.d, 1.0));
    }

    #[test]
    fn formula_no_scale_normalizes_the_parent_rotation() {
        let mut value = skeleton(vec![root(0.0, 0.0, 90.0), child(0, 0.0, 0.0)], None);
        value.bones[0].scale_x = 2.0;
        value.bones[0].scale_y = 1.0;
        value.bones[1].transform_mode = TRANSFORM_MODE_2D_NO_SCALE;
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 1));
        assert!(close(out.a, 0.0));
        assert!(close(out.b, 1.0));
        assert!(close(out.c, -1.0));
        assert!(close(out.d, 0.0));
    }

    #[test]
    fn formula_no_scale_and_no_scale_or_reflection_differ_on_a_reflected_parent() {
        let mut value = skeleton(
            vec![root(0.0, 0.0, 0.0), child(0, 0.0, 0.0), child(0, 0.0, 0.0)],
            None,
        );
        value.bones[0].scale_y = -1.0;
        value.bones[1].transform_mode = TRANSFORM_MODE_2D_NO_SCALE;
        value.bones[2].transform_mode = TRANSFORM_MODE_2D_NO_SCALE_OR_REFLECTION;
        compute_skeleton_2d_world_transforms(&mut value);
        let mut kept = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut kept, &value, 1));
        assert!(close(kept.a, 1.0));
        assert!(close(kept.d, -1.0));
        assert!(close(kept.a * kept.d - kept.c * kept.b, -1.0));
        let mut stripped = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut stripped, &value, 2));
        assert!(close(stripped.a, 1.0));
        assert!(close(stripped.d, 1.0));
        assert!(close(
            stripped.a * stripped.d - stripped.c * stripped.b,
            1.0
        ));
    }

    #[test]
    fn formula_shear_offsets_the_x_axis_angle() {
        let mut value = skeleton(vec![root(0.0, 0.0, 0.0)], None);
        value.bones[0].shear_x = 45.0;
        compute_skeleton_2d_world_transforms(&mut value);
        let root2 = std::f32::consts::FRAC_1_SQRT_2;
        assert!(close(value.world_matrices[0], root2));
        assert!(close(value.world_matrices[1], root2));
        assert!(close(value.world_matrices[2], 0.0));
        assert!(close(value.world_matrices[3], 1.0));
    }

    #[test]
    fn formula_inherit_combo_without_a_named_preset_keeps_scale_strips_reflection() {
        let mut value = skeleton(vec![root(0.0, 0.0, 0.0), child(0, 0.0, 0.0)], None);
        value.bones[0].scale_x = 2.0;
        value.bones[0].scale_y = -2.0;
        value.bones[1].transform_mode = TransformInherit2D {
            reflection: false,
            rotation: true,
            scale: true,
            translation: true,
        };
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 1));
        assert!(close(out.a, 2.0));
        assert!(close(out.b, 0.0));
        assert!(close(out.c, 0.0));
        assert!(close(out.d, 2.0));
        assert!(close(out.a * out.d - out.c * out.b, 4.0));
    }

    #[test]
    fn formula_stripping_translation_uses_the_local_position_and_keeps_the_basis() {
        let bones = |translation: bool| {
            vec![
                root(10.0, 20.0, 90.0),
                Bone2D {
                    transform_mode: TransformInherit2D {
                        reflection: true,
                        rotation: true,
                        scale: true,
                        translation,
                    },
                    x: 3.0,
                    y: 4.0,
                    ..child(0, 0.0, 0.0)
                },
            ]
        };
        let mut stripped = skeleton(bones(false), None);
        compute_skeleton_2d_world_transforms(&mut stripped);
        let mut inherited = skeleton(bones(true), None);
        compute_skeleton_2d_world_transforms(&mut inherited);
        assert!(close(stripped.world_matrices[6 + 4], 3.0));
        assert!(close(stripped.world_matrices[6 + 5], 4.0));
        assert!(close(inherited.world_matrices[6 + 4], 6.0));
        assert!(close(inherited.world_matrices[6 + 5], 23.0));
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &stripped, 1));
        assert!(close(out.a, 0.0));
        assert!(close(out.b, 1.0));
        assert!(close(out.c, -1.0));
        assert!(close(out.d, 0.0));
    }

    #[test]
    fn create_leaves_slots_null() {
        let value = create_skeleton_2d(vec![bone(), bone()], None);
        assert!(value.slots.is_none());
    }

    #[test]
    fn world_matrix_translation_and_out_of_range_negative_index() {
        let mut value = skeleton(vec![root(7.0, 0.0, 0.0)], None);
        compute_skeleton_2d_world_transforms(&mut value);
        let mut out = create_matrix(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        assert!(get_skeleton_2d_bone_world_matrix(&mut out, &value, 0));
        assert!(close(out.tx, 7.0));
        assert!(!get_skeleton_2d_bone_world_matrix(&mut out, &value, 5));
        assert!(!get_skeleton_2d_bone_world_matrix(&mut out, &value, -1));
    }

    #[test]
    fn skin_lookup_finds_the_second_skin_and_handles_no_wardrobe() {
        let mut value = skeleton(vec![bone()], None);
        assert!(get_skeleton_2d_skin(&value, "goblin").is_none());
        value.skins = Some(vec![
            AttachmentSkin2D {
                attachments: Vec::new(),
                name: String::from("goblin"),
            },
            AttachmentSkin2D {
                attachments: Vec::new(),
                name: String::from("goblingirl"),
            },
        ]);
        assert_eq!(
            get_skeleton_2d_skin(&value, "goblingirl").map(|skin| skin.name.as_str()),
            Some("goblingirl")
        );
        assert!(get_skeleton_2d_skin(&value, "nope").is_none());
    }

    #[test]
    fn bone_index_finds_the_second_named_bone() {
        let mut first = bone();
        first.name = Some(String::from("root"));
        let mut second = bone();
        second.parent_index = 0;
        second.name = Some(String::from("arm"));
        let value = skeleton(vec![first, second], None);
        assert_eq!(get_skeleton_2d_bone_index_by_name(&value, "arm"), 1);
        assert_eq!(get_skeleton_2d_bone_index_by_name(&value, "leg"), -1);
    }

    #[test]
    fn reset_copies_all_seven_animatable_fields() {
        let mut setup_bone = bone();
        setup_bone.rotation = 12.0;
        setup_bone.scale_x = 2.0;
        setup_bone.scale_y = 3.0;
        setup_bone.shear_x = 4.0;
        setup_bone.shear_y = 5.0;
        setup_bone.x = 6.0;
        setup_bone.y = 7.0;
        let setup = skeleton(vec![setup_bone.clone()], None);
        let mut pose = clone_skeleton_2d(&setup);
        pose.bones[0].rotation = 90.0;
        pose.bones[0].scale_x = 9.0;
        pose.bones[0].scale_y = 8.0;
        pose.bones[0].shear_x = 7.0;
        pose.bones[0].shear_y = 6.0;
        pose.bones[0].x = 5.0;
        pose.bones[0].y = 4.0;
        reset_skeleton_2d_to_setup(&setup, &mut pose);
        assert_eq!(pose.bones[0], setup_bone);
    }

    #[test]
    fn bind_pose_palette_has_zero_translation_and_identity_scale() {
        let mut value = skeleton(vec![root(4.0, 0.0, 60.0)], None);
        value.bones[0].scale_x = 2.0;
        compute_skeleton_2d_world_transforms(&mut value);
        set_skeleton_2d_bind_pose(&mut value);
        compute_skeleton_2d_bone_matrices(&mut value);
        assert!(close(value.bone_matrices[0], 1.0));
        assert!(close(value.bone_matrices[3], 1.0));
        assert!(close(value.bone_matrices[4], 0.0));
        assert!(close(value.bone_matrices[5], 0.0));
    }

    #[test]
    fn set_skin_preserves_unmentioned_base_attachment_identity() {
        let mut value = skeleton(vec![bone()], Some(vec![slot(0), slot(0)]));
        let base = region_ref(region(2.0, 2.0));
        value.slots.as_mut().unwrap()[1].attachment = Some(base.clone());
        let hat = region_ref(region(1.0, 1.0));
        set_skeleton_2d_skin(
            &mut value,
            &AttachmentSkin2D {
                attachments: vec![SkinAttachment2D {
                    attachment: hat,
                    name: String::from("head"),
                    slot_index: 0,
                }],
                name: String::from("goblin"),
            },
        );
        let slots = value.slots.unwrap();
        let surviving = slots[1].attachment.as_ref().expect("base attachment");
        assert!(Arc::ptr_eq(surviving, &base));
    }

    #[test]
    fn set_skin_skips_negative_and_out_of_range_slot_indices() {
        let mut value = skeleton(vec![bone()], Some(vec![slot(0)]));
        set_skeleton_2d_skin(
            &mut value,
            &AttachmentSkin2D {
                attachments: vec![
                    SkinAttachment2D {
                        attachment: region_ref(region(1.0, 1.0)),
                        name: String::from("ghost"),
                        slot_index: 9,
                    },
                    SkinAttachment2D {
                        attachment: region_ref(region(1.0, 1.0)),
                        name: String::from("ghost2"),
                        slot_index: -1,
                    },
                ],
                name: String::from("broken"),
            },
        );
        assert!(value.slots.unwrap()[0].attachment.is_none());
    }

    #[test]
    fn equals_is_false_when_the_clone_is_edited() {
        let setup = skeleton(vec![root(0.0, 0.0, 15.0)], None);
        let mut clone = clone_skeleton_2d(&setup);
        assert!(equals_skeleton_2d(&setup, &clone));
        clone.bones[0].rotation = 16.0;
        assert!(!equals_skeleton_2d(&setup, &clone));
    }
}

mod validate_skeleton_2d {
    use super::*;

    #[test]
    fn returns_none_for_a_valid_rig() {
        let value = skeleton(vec![bone(), child(0, 1.0, 0.0)], None);
        assert_eq!(validate_skeleton_2d(&value), None);
    }

    #[test]
    fn reports_a_parent_index_not_before_the_child() {
        let value = skeleton(vec![child(1, 0.0, 0.0)], None);
        assert!(
            validate_skeleton_2d(&value)
                .unwrap()
                .contains("not < its own index")
        );
    }

    #[test]
    fn reports_a_mis_sized_buffer() {
        let mut value = skeleton(vec![bone()], None);
        value.world_matrices.push(0.0);
        assert!(
            validate_skeleton_2d(&value)
                .unwrap()
                .contains("worldMatrices length")
        );
    }
}
