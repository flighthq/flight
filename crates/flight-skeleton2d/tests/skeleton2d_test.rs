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
