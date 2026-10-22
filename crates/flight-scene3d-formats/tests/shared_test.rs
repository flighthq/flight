use flight_scene3d_formats::contract::*;

mod convert_positions_z_up_to_y_up {
    use super::*;
    #[test]
    fn rotates_packed_and_interleaved_streams_preserving_positive_zero_and_tails() {
        let mut values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        convert_positions_z_up_to_y_up(&mut values, None, None);
        assert_eq!(values, [1.0, 3.0, -2.0, 4.0, 6.0, -5.0]);
        let mut values = [
            1.0, 2.0, 3.0, 10.0, 20.0, 30.0, 4.0, 5.0, 6.0, 40.0, 50.0, 60.0,
        ];
        convert_positions_z_up_to_y_up(&mut values, Some(6), Some(0));
        assert_eq!(
            values,
            [
                1.0, 3.0, -2.0, 10.0, 20.0, 30.0, 4.0, 6.0, -5.0, 40.0, 50.0, 60.0
            ]
        );
        let mut values = [1.0, 0.0, 3.0];
        convert_positions_z_up_to_y_up(&mut values, None, None);
        assert_eq!(values[2].to_bits(), 0.0_f32.to_bits());
        let mut empty: [f32; 0] = [];
        convert_positions_z_up_to_y_up(&mut empty, None, None);
        assert_eq!(empty, [0.0_f32; 0]);
        let mut values = vec![1.0, 2.0, 3.0].into_boxed_slice();
        convert_positions_z_up_to_y_up(&mut values, None, None);
        assert_eq!(&*values, &[1.0, 3.0, -2.0]);
    }
}
mod convert_quaternions_z_up_to_y_up {
    use super::*;
    #[test]
    fn rotates_each_quaternion_vector_part_and_preserves_scalar_and_positive_zero() {
        let mut values = [0.5, 0.5, 0.5, -0.5];
        convert_quaternions_z_up_to_y_up(&mut values, None, None);
        assert_eq!(values, [0.5, 0.5, -0.5, -0.5]);
        let mut values = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];
        convert_quaternions_z_up_to_y_up(&mut values, None, None);
        assert_eq!(values, [1.0, 3.0, -2.0, 4.0, 5.0, 7.0, -6.0, 8.0]);
        let mut values = [0.0, 0.0, 1.0, 1.0];
        convert_quaternions_z_up_to_y_up(&mut values, None, None);
        assert_eq!(values[2].to_bits(), 0.0_f32.to_bits());
    }
}
mod convert_transform_lh_to_rh {
    use super::*;
    #[test]
    fn reflects_exact_awd_double_transform_components() {
        let mut transform = [
            1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 10.0, 20.0, 30.0,
        ];
        convert_transform_lh_to_rh(&mut transform);
        assert_eq!(
            transform,
            [
                1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 10.0, 20.0, -30.0
            ]
        );
        let mut transform = [
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0,
        ];
        convert_transform_lh_to_rh(&mut transform);
        assert_eq!(
            transform,
            [
                1.0, 2.0, -3.0, 4.0, 5.0, -6.0, -7.0, -8.0, 9.0, 10.0, 11.0, -12.0
            ]
        );
    }
}
mod create_embedded_texture_ref {
    use super::*;
    use flight_image::ImageResourceReference;
    use std::sync::{Arc, RwLock};
    #[test]
    fn retains_encoded_bytes_without_decoding_and_supports_null_mime() {
        let bytes = Arc::new(RwLock::new(vec![1_u8, 2, 3, 4].into_boxed_slice()));
        let mut resources = Vec::new();
        let texture =
            create_embedded_texture_ref(bytes.clone(), Some("image/png"), Some(&mut resources));
        assert!(flight_texture::get_texture_source(&*texture.read().unwrap()).is_none());
        let ImageResourceReference::Embedded(value) =
            get_test_texture_resource(&resources, &texture)
        else {
            panic!("expected embedded")
        };
        let value = value.reference.read().unwrap();
        assert!(Arc::ptr_eq(&value.bytes, &bytes));
        assert_eq!(value.mime_type.as_deref(), Some("image/png"));
        assert_eq!(
            value.state,
            flight_resource::ResourceResolutionState::Unresolved
        );
        drop(value);
        let texture = create_embedded_texture_ref(bytes, None, Some(&mut resources));
        let ImageResourceReference::Embedded(value) =
            get_test_texture_resource(&resources, &texture)
        else {
            panic!("expected embedded")
        };
        assert_eq!(value.reference.read().unwrap().mime_type, None);
        let texture = create_embedded_texture_ref(
            Arc::new(RwLock::new(vec![0_u8].into_boxed_slice())),
            None,
            Some(&mut resources),
        );
        let ImageResourceReference::Embedded(value) =
            get_test_texture_resource(&resources, &texture)
        else {
            panic!("expected embedded")
        };
        assert_eq!(value.reference.read().unwrap().mime_type, None);
    }
    #[test]
    fn reuses_only_matching_byte_identity_and_mime_with_fresh_registered_textures() {
        let bytes = Arc::new(RwLock::new(vec![1_u8, 2, 3].into_boxed_slice()));
        let mut resources = Vec::new();
        let first =
            create_embedded_texture_ref(bytes.clone(), Some("image/png"), Some(&mut resources));
        let second =
            create_embedded_texture_ref(bytes.clone(), Some("image/png"), Some(&mut resources));
        assert!(!Arc::ptr_eq(&first, &second));
        assert_eq!(resources.len(), 1);
        let ImageResourceReference::Embedded(value) = &resources[0] else {
            panic!("expected embedded")
        };
        let value = value.reference.read().unwrap();
        assert_eq!(value.textures.len(), 2);
        assert!(Arc::ptr_eq(&value.textures[0], &first));
        assert!(Arc::ptr_eq(&value.textures[1], &second));
        drop(value);
        create_embedded_texture_ref(
            Arc::new(RwLock::new(vec![1_u8, 2, 3].into_boxed_slice())),
            Some("image/png"),
            Some(&mut resources),
        );
        create_embedded_texture_ref(bytes, Some("image/jpeg"), Some(&mut resources));
        assert_eq!(resources.len(), 3);
    }
}
mod create_external_texture_ref {
    use super::*;
    use flight_image::ImageResourceReference;
    use std::sync::Arc;
    #[test]
    fn keeps_authored_path_and_unresolved_state_without_loading() {
        let mut resources = Vec::new();
        let texture = create_external_texture_ref("models/hero.png", None, Some(&mut resources));
        assert!(flight_texture::get_texture_source(&*texture.read().unwrap()).is_none());
        let ImageResourceReference::External(value) =
            get_test_texture_resource(&resources, &texture)
        else {
            panic!("expected external")
        };
        let value = value.reference.read().unwrap();
        assert_eq!(value.uri, "models/hero.png");
        assert_eq!(value.base_path, None);
        assert_eq!(
            value.state,
            flight_resource::ResourceResolutionState::Unresolved
        );
    }
    #[test]
    fn matches_uri_and_base_path_exactly_and_preserves_resource_material_arc_identity() {
        let mut resources = Vec::new();
        let first = create_external_texture_ref("hero.png", Some("models"), Some(&mut resources));
        let second = create_external_texture_ref("hero.png", Some("models"), Some(&mut resources));
        assert!(!Arc::ptr_eq(&first, &second));
        assert_eq!(resources.len(), 1);
        let mut material = flight_materials::contract::create_blinn_phong_material();
        material.diffuse_map = Some(first.clone());
        let ImageResourceReference::External(value) = &resources[0] else {
            panic!("expected external")
        };
        let value = value.reference.read().unwrap();
        assert_eq!(value.textures.len(), 2);
        assert!(Arc::ptr_eq(
            &value.textures[0],
            material.diffuse_map.as_ref().unwrap()
        ));
        assert!(Arc::ptr_eq(&value.textures[1], &second));
        drop(value);
        create_external_texture_ref("hero.png", None, Some(&mut resources));
        create_external_texture_ref("hero.png", Some(""), Some(&mut resources));
        create_external_texture_ref("other.png", Some("models"), Some(&mut resources));
        assert_eq!(resources.len(), 4);
    }
}
mod negate_vec3_z {
    use super::*;
    #[test]
    fn reflects_z_and_canonicalizes_negative_zero() {
        let mut values = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0];
        negate_vec3_z(&mut values);
        assert_eq!(values, [1.0, 2.0, -3.0, 4.0, 5.0, -6.0]);
        let mut values = vec![1.0, 2.0, 0.0];
        negate_vec3_z(&mut values);
        assert_eq!(values[2].to_bits(), 0.0_f32.to_bits());
    }
}
mod pack_skin_influences {
    use super::*;
    #[test]
    fn keeps_top_four_sorted_in_place_and_renormalizes_without_overwriting_output_tails() {
        let mut influences = [
            SkinInfluence {
                joint_index: 5.0,
                weight: 0.1,
            },
            SkinInfluence {
                joint_index: 2.0,
                weight: 0.4,
            },
            SkinInfluence {
                joint_index: 9.0,
                weight: 0.05,
            },
            SkinInfluence {
                joint_index: 1.0,
                weight: 0.3,
            },
            SkinInfluence {
                joint_index: 7.0,
                weight: 0.15,
            },
        ];
        let mut joints = vec![99.0; 5];
        let mut weights = vec![99.0; 5];
        pack_skin_influences(&mut joints, &mut weights, &mut influences);
        assert_eq!(joints, vec![2.0, 1.0, 7.0, 5.0, 99.0]);
        let actual = weights[..4].iter().sum::<f32>();
        assert!((actual - 1.0).abs() <= 4.0 * f32::EPSILON * 1.0_f32.max(actual.abs()));
        let expected = 0.4 / 0.95;
        assert!((weights[0] - expected).abs() <= 4.0 * f32::EPSILON * 1.0_f32.max(expected.abs()));
        assert_eq!(weights[4], 99.0);
        assert_eq!(influences[4].joint_index, 9.0);
        let mut influences = [
            SkinInfluence {
                joint_index: 5.0,
                weight: 0.1,
            },
            SkinInfluence {
                joint_index: 2.0,
                weight: 0.4,
            },
            SkinInfluence {
                joint_index: 9.0,
                weight: 0.05,
            },
            SkinInfluence {
                joint_index: 1.0,
                weight: 0.3,
            },
            SkinInfluence {
                joint_index: 7.0,
                weight: 0.15,
            },
        ];
        let mut joints = Vec::new();
        let mut weights = Vec::new();
        pack_skin_influences(&mut joints, &mut weights, &mut influences);
        assert_eq!(joints, [2.0, 1.0, 7.0, 5.0]);
        let actual = weights.iter().sum::<f32>();
        assert!((actual - 1.0).abs() <= 4.0 * f32::EPSILON * 1.0_f32.max(actual.abs()));
        assert!((weights[0] - expected).abs() <= 4.0 * f32::EPSILON * 1.0_f32.max(expected.abs()));
    }
    #[test]
    fn zero_fills_unused_influences_and_leaves_empty_bind_weights_zero() {
        let mut joints = Vec::new();
        let mut weights = Vec::new();
        pack_skin_influences(
            &mut joints,
            &mut weights,
            &mut [SkinInfluence {
                joint_index: 3.0,
                weight: 0.5,
            }],
        );
        assert_eq!(joints, vec![3.0, 0.0, 0.0, 0.0]);
        assert_eq!(weights, vec![1.0, 0.0, 0.0, 0.0]);
        pack_skin_influences(&mut joints, &mut weights, &mut []);
        assert_eq!(joints, vec![0.0; 4]);
        assert_eq!(weights, vec![0.0; 4]);
        let mut joints = Vec::new();
        let mut weights = Vec::new();
        pack_skin_influences(&mut joints, &mut weights, &mut []);
        assert_eq!(joints, [0.0; 4]);
        assert_eq!(weights, [0.0; 4]);
    }
}
mod reverse_triangle_winding {
    use super::*;
    #[test]
    fn swaps_complete_triangle_corners_in_place_and_leaves_the_tail() {
        let mut indices = vec![0.0, 1.0, 2.0, 3.0, 4.0, 5.0];
        reverse_triangle_winding(&mut indices);
        assert_eq!(indices, [0.0, 2.0, 1.0, 3.0, 5.0, 4.0]);
        let mut indices = vec![0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0];
        reverse_triangle_winding(&mut indices);
        assert_eq!(indices, [0.0, 2.0, 1.0, 3.0, 5.0, 4.0, 6.0, 7.0]);
        reverse_triangle_winding(&mut Vec::new());
        let mut numbers = vec![0.5, -1.25, f32::NAN];
        reverse_triangle_winding(&mut numbers);
        assert_eq!(numbers[0], 0.5);
        assert!(numbers[1].is_nan());
        assert_eq!(numbers[2], -1.25);
    }
}
mod reverse_vertex_triangle_winding {
    use super::*;
    #[test]
    fn carries_every_authored_record_attribute_and_exact_source_tail_cases() {
        let mut values = [0.0, 1.0, 2.0, 3.0, 4.0, 5.0];
        reverse_vertex_triangle_winding(&mut values, 1);
        assert_eq!(values, [0.0, 2.0, 1.0, 3.0, 5.0, 4.0]);
        let mut values = [
            0.0, 0.0, 0.0, 10.0, 1.0, 0.0, 0.0, 11.0, 0.0, 1.0, 0.0, 12.0,
        ];
        reverse_vertex_triangle_winding(&mut values, 4);
        assert_eq!(
            values,
            [
                0.0, 0.0, 0.0, 10.0, 0.0, 1.0, 0.0, 12.0, 1.0, 0.0, 0.0, 11.0
            ]
        );
        let mut values = [0.0, 1.0, 2.0, 3.0, 4.0];
        reverse_vertex_triangle_winding(&mut values, 1);
        assert_eq!(values, [0.0, 2.0, 1.0, 3.0, 4.0]);
        let mut values = [0.0, 1.0, 2.0];
        reverse_vertex_triangle_winding(&mut values, 0);
        assert_eq!(values, [0.0, 1.0, 2.0]);
        let mut indices = vec![10.0, 20.0, 30.0];
        reverse_triangle_winding(&mut indices);
        assert_eq!(indices, [10.0, 30.0, 20.0]);
    }

    #[test]
    fn swaps_whole_interleaved_records_and_preserves_incomplete_triangles() {
        let mut vertices = [0.0, 10.0, 1.0, 11.0, 2.0, 12.0, 3.0, 13.0, 4.0];
        reverse_vertex_triangle_winding(&mut vertices, 2);
        assert_eq!(vertices, [0.0, 10.0, 2.0, 12.0, 1.0, 11.0, 3.0, 13.0, 4.0]);
        let before = vertices;
        reverse_vertex_triangle_winding(&mut vertices, 0);
        assert_eq!(vertices, before);
        reverse_vertex_triangle_winding(&mut vertices, -1);
        assert_eq!(vertices, before);
    }
}
