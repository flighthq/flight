use super::three_ds_test_helper::*;
use flight_scene3d_formats::*;

mod collect_three_ds_chunk_counts {
    use super::*;

    #[test]
    fn counts_feature_chunks_in_discovery_order_and_repeated_meshes() {
        let file = build_minimal_three_ds(&[
            write_chunk(THREE_DS_MATERIAL, &[0; 4]),
            write_object_chunk("Box", THREE_DS_TRIMESH, &[0; 4]),
            write_object_chunk("Lamp", THREE_DS_LIGHT, &[0; 12]),
            write_object_chunk("Cam", THREE_DS_CAMERA, &[0; 32]),
        ]);
        let counts = {
            let mut output = Vec::new();
            if collect_three_ds_chunk_counts(&mut output, &file) {
                Some(output)
            } else {
                None
            }
        }
        .unwrap();
        assert_eq!(
            counts
                .iter()
                .map(|row| (row.chunk_id, row.count))
                .collect::<Vec<_>>(),
            [
                (THREE_DS_MATERIAL, 1),
                (THREE_DS_TRIMESH, 1),
                (THREE_DS_LIGHT, 1),
                (THREE_DS_CAMERA, 1)
            ]
        );
        let file = build_minimal_three_ds(&[
            write_object_chunk("A", THREE_DS_TRIMESH, &[0; 4]),
            write_object_chunk("B", THREE_DS_TRIMESH, &[0; 4]),
            write_object_chunk("C", THREE_DS_TRIMESH, &[0; 4]),
        ]);
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &file) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap(),
            [ThreeDsChunkCount {
                chunk_id: THREE_DS_TRIMESH,
                count: 3
            }]
        );
    }

    #[test]
    fn descends_keyframes_but_only_counts_the_first_feature_inside_each_object() {
        let file = write_chunk(
            THREE_DS_MAIN,
            &write_chunk(
                THREE_DS_KEYFRAME,
                &write_chunk(THREE_DS_KEYFRAME_OBJECT_NODE, &[]),
            ),
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &file) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap(),
            [ThreeDsChunkCount {
                chunk_id: THREE_DS_KEYFRAME_OBJECT_NODE,
                count: 1
            }]
        );
        let mut object = b"Box\0".to_vec();
        object.extend_from_slice(&write_chunk(THREE_DS_TRIMESH, &[]));
        object.extend_from_slice(&write_chunk(THREE_DS_CAMERA, &[0; 32]));
        let file = build_minimal_three_ds(&[write_chunk(THREE_DS_OBJECT, &object)]);
        let counts = {
            let mut output = Vec::new();
            if collect_three_ds_chunk_counts(&mut output, &file) {
                Some(output)
            } else {
                None
            }
        }
        .unwrap();
        assert_eq!(
            counts,
            [ThreeDsChunkCount {
                chunk_id: THREE_DS_TRIMESH,
                count: 1
            }]
        );
    }

    #[test]
    fn empty_editor_is_readable_but_short_or_wrong_main_is_not() {
        assert!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &build_minimal_three_ds(&[])) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap()
            .is_empty()
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &[0; 3]) {
                    Some(output)
                } else {
                    None
                }
            },
            None
        );
        let mut wrong = build_minimal_three_ds(&[]);
        wrong[..2].fill(0);
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &wrong) {
                    Some(output)
                } else {
                    None
                }
            },
            None
        );
    }

    #[test]
    fn malformed_lengths_and_unterminated_names_stop_without_reading_past_the_region() {
        let mut zero = vec![0; 6].into_boxed_slice();
        zero[..2].copy_from_slice(&THREE_DS_MATERIAL.to_le_bytes());
        let file = build_minimal_three_ds(&[zero, write_chunk(THREE_DS_MATERIAL, &[])]);
        assert!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &file) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap()
            .is_empty()
        );
        let mut too_long = write_chunk(THREE_DS_MATERIAL, &[]);
        too_long[2..6].copy_from_slice(&1000u32.to_le_bytes());
        assert!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &build_minimal_three_ds(&[too_long]))
                {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap()
            .is_empty()
        );
        assert!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(
                    &mut output,
                    &build_minimal_three_ds(&[write_chunk(THREE_DS_OBJECT, b"unterminated")]),
                ) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap()
            .is_empty()
        );
        let mut root = build_minimal_three_ds(&[]);
        root[2..6].copy_from_slice(&0u32.to_le_bytes());
        assert!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &root) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap()
            .is_empty()
        );
    }

    #[test]
    fn material_census_reads_each_map_without_inventing_missing_maps() {
        let mut body = Vec::new();
        for id in [
            THREE_DS_MATERIAL_TEXTURE_MAP,
            THREE_DS_MATERIAL_BUMP_MAP,
            THREE_DS_MATERIAL_OPACITY_MAP,
        ] {
            body.extend_from_slice(&write_chunk(id, &[0; 4]));
        }
        let counts = {
            let mut output = Vec::new();
            if collect_three_ds_chunk_counts(
                &mut output,
                &build_minimal_three_ds(&[write_chunk(THREE_DS_MATERIAL, &body)]),
            ) {
                Some(output)
            } else {
                None
            }
        }
        .unwrap();
        assert_eq!(
            counts
                .iter()
                .map(|row| (row.chunk_id, row.count))
                .collect::<Vec<_>>(),
            [
                (THREE_DS_MATERIAL, 1),
                (THREE_DS_MATERIAL_TEXTURE_MAP, 1),
                (THREE_DS_MATERIAL_BUMP_MAP, 1),
                (THREE_DS_MATERIAL_OPACITY_MAP, 1)
            ]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(
                    &mut output,
                    &build_minimal_three_ds(&[write_chunk(THREE_DS_MATERIAL, &[0; 4])]),
                ) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap(),
            [ThreeDsChunkCount {
                chunk_id: THREE_DS_MATERIAL,
                count: 1
            }]
        );
    }

    #[test]
    fn spot_light_subchunk_is_distinct_from_a_plain_point_light() {
        let mut body = vec![0; 12];
        body.extend_from_slice(&write_chunk(THREE_DS_LIGHT_SPOT, &[0; 24]));
        let counts = {
            let mut output = Vec::new();
            if collect_three_ds_chunk_counts(
                &mut output,
                &build_minimal_three_ds(&[write_object_chunk("Spot", THREE_DS_LIGHT, &body)]),
            ) {
                Some(output)
            } else {
                None
            }
        }
        .unwrap();
        assert_eq!(
            counts,
            [
                ThreeDsChunkCount {
                    chunk_id: THREE_DS_LIGHT,
                    count: 1
                },
                ThreeDsChunkCount {
                    chunk_id: THREE_DS_LIGHT_SPOT,
                    count: 1
                }
            ]
        );
        let counts = {
            let mut output = Vec::new();
            if collect_three_ds_chunk_counts(
                &mut output,
                &build_minimal_three_ds(&[write_object_chunk("Point", THREE_DS_LIGHT, &[0; 12])]),
            ) {
                Some(output)
            } else {
                None
            }
        }
        .unwrap();
        assert_eq!(
            counts,
            [ThreeDsChunkCount {
                chunk_id: THREE_DS_LIGHT,
                count: 1
            }]
        );
    }

    #[test]
    fn uses_source_byte_view_offsets() {
        let valid = build_minimal_three_ds(&[write_object_chunk("A", THREE_DS_TRIMESH, &[])]);
        let mut buffer = vec![0xaa; 7];
        buffer.extend_from_slice(&valid);
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &buffer[7..]) {
                    Some(output)
                } else {
                    None
                }
            },
            {
                let mut output = Vec::new();
                if collect_three_ds_chunk_counts(&mut output, &valid) {
                    Some(output)
                } else {
                    None
                }
            }
        );
    }
    #[test]
    fn replaces_previous_counts_retains_capacity_and_distinguishes_a_valid_empty_main_from_an_invalid_header()
     {
        let mut out = Vec::with_capacity(16);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        let bytes = build_minimal_three_ds(&[write_chunk(THREE_DS_MATERIAL, &[])]);
        assert!(collect_three_ds_chunk_counts(&mut out, &bytes));
        assert_eq!(
            out,
            [ThreeDsChunkCount {
                chunk_id: THREE_DS_MATERIAL,
                count: 1
            }]
        );
        assert!(collect_three_ds_chunk_counts(
            &mut out,
            &build_minimal_three_ds(&[])
        ));
        assert!(out.is_empty());
        assert!(collect_three_ds_chunk_counts(&mut out, &bytes));
        assert!(!collect_three_ds_chunk_counts(&mut out, &[]));
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}

mod get_three_ds_chunk_name {
    use super::*;
    #[test]
    fn recognizes_all_feature_ids_and_formats_unknown_hex_labels() {
        for (id, name) in [
            (THREE_DS_TRIMESH, "Trimesh"),
            (THREE_DS_MATERIAL, "Material"),
            (THREE_DS_MATERIAL_TEXTURE_MAP, "MaterialTextureMap"),
            (THREE_DS_MATERIAL_BUMP_MAP, "MaterialBumpMap"),
            (THREE_DS_MATERIAL_OPACITY_MAP, "MaterialOpacityMap"),
            (THREE_DS_LIGHT, "Light"),
            (THREE_DS_LIGHT_SPOT, "LightSpot"),
            (THREE_DS_CAMERA, "Camera"),
            (THREE_DS_KEYFRAME_OBJECT_NODE, "KeyframeObjectNode"),
        ] {
            assert_eq!(get_three_ds_chunk_name(id), name);
        }
        assert_eq!(get_three_ds_chunk_name(0xbeef), "Unknown(0xbeef)");
        assert_eq!(get_three_ds_chunk_name(1), "Unknown(0x0001)");
    }
}

mod get_three_ds_feature_names {
    use super::*;
    #[test]
    fn derives_the_complete_unique_vocabulary_in_source_table_order() {
        let names = {
            let mut output = Vec::new();
            get_three_ds_feature_names(&mut output);
            output
        };
        assert!(!names.is_empty());
        assert!(names.iter().all(|name| !name.starts_with("Unknown(")));
        assert!(names.contains(&get_three_ds_chunk_name(0x4100)));
        assert!(names.contains(&get_three_ds_chunk_name(0xafff)));
        assert_eq!(
            names,
            [
                "Trimesh",
                "Material",
                "MaterialTextureMap",
                "MaterialOpacityMap",
                "MaterialBumpMap",
                "Light",
                "LightSpot",
                "Camera",
                "KeyframeObjectNode"
            ]
        );
        for (i, name) in names.iter().enumerate() {
            assert!(!names[..i].contains(name));
        }
    }
    #[test]
    fn replaces_stale_names_on_every_call_without_replacing_the_callers_buffer() {
        let mut out = Vec::with_capacity(32);
        out.push("stale".to_string());
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        get_three_ds_feature_names(&mut out);
        let expected = out.clone();
        assert_eq!(expected.len(), 9);
        out[0] = "changed".to_string();
        get_three_ds_feature_names(&mut out);
        assert_eq!(out, expected);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}
