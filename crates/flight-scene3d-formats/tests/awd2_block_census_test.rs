use super::awd2_test_helper::{block, file};
use flight_scene3d_formats::contract::*;

mod collect_awd2_block_counts {
    use super::*;

    #[test]
    fn rejects_unreadable_headers_or_overrunning_blocks_and_skips_payloads_by_length() {
        assert!(
            {
                let mut output = Vec::new();
                if collect_awd2_block_counts(&mut output, &[], None, None) {
                    Some(output)
                } else {
                    None
                }
            }
            .is_none()
        );
        let mut bytes = file(&[block(42, 0, 1, &[])]);
        bytes[19..23].copy_from_slice(&65535_u32.to_le_bytes());
        assert!(
            {
                let mut output = Vec::new();
                if collect_awd2_block_counts(&mut output, &bytes, None, None) {
                    Some(output)
                } else {
                    None
                }
            }
            .is_none()
        );
        let bytes = file(&[block(200, 0, 1, &[9, 9, 9]), block(42, 0, 2, &[])]);
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_awd2_block_counts(&mut output, &bytes, None, None) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap(),
            [
                Awd2BlockCount {
                    name: "Unknown(200)".to_string(),
                    count: 1
                },
                Awd2BlockCount {
                    name: "Camera".to_string(),
                    count: 1
                },
            ]
        );
    }

    #[test]
    fn counts_distinct_qualified_names_in_discovery_order_and_ignores_partial_trailing_headers() {
        let mut bytes = file(&[
            block(81, 0, 1, &[]),
            block(81, 0, 2, &[]),
            block(42, 0, 3, &[]),
            block(81, 1, 4, &[]),
        ]);
        bytes.extend_from_slice(&[8; 10]);
        bytes[8..12].copy_from_slice(&0_u32.to_le_bytes());
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_awd2_block_counts(&mut output, &bytes, None, None) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap(),
            [
                Awd2BlockCount {
                    name: "Material".to_string(),
                    count: 2
                },
                Awd2BlockCount {
                    name: "Camera".to_string(),
                    count: 1
                },
                Awd2BlockCount {
                    name: "Namespace1Block(81)".to_string(),
                    count: 1
                },
            ]
        );
        bytes[7] = 1;
        assert!(
            {
                let mut output = Vec::new();
                if collect_awd2_block_counts(&mut output, &bytes, None, None) {
                    Some(output)
                } else {
                    None
                }
            }
            .is_none()
        );
    }
    #[test]
    fn clears_stale_and_partial_rows_retains_capacity_and_keeps_the_empty_file_success_distinct_from_failure()
     {
        let mut out = Vec::with_capacity(16);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        let good = file(&[block(42, 0, 1, &[])]);
        assert!(collect_awd2_block_counts(&mut out, &good, None, None));
        assert_eq!(
            out,
            [Awd2BlockCount {
                name: "Camera".to_string(),
                count: 1
            }]
        );
        let mut malformed = file(&[block(42, 0, 1, &[]), block(1, 0, 2, &[])]);
        malformed[30..34].copy_from_slice(&100_u32.to_le_bytes());
        assert!(!collect_awd2_block_counts(&mut out, &malformed, None, None));
        assert!(out.is_empty());
        assert!(collect_awd2_block_counts(&mut out, &file(&[]), None, None));
        assert!(out.is_empty());
        assert!(!collect_awd2_block_counts(&mut out, &[], None, None));
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}

mod get_awd2_block_name {
    use super::*;

    #[test]
    fn names_core_types_and_keeps_unknown_and_noncore_names_stable_and_distinct() {
        assert_eq!(get_awd2_block_name(0, 81), "Material");
        assert_eq!(get_awd2_block_name(0, 42), "Camera");
        assert_eq!(get_awd2_block_name(0, 200), "Unknown(200)");
        assert_eq!(get_awd2_block_name(1, 81), "Namespace1Block(81)");
        assert_ne!(get_awd2_block_name(0, 81), get_awd2_block_name(1, 81));
    }
}

mod get_awd2_feature_names {
    use super::*;

    #[test]
    fn lists_every_named_type_once_in_the_source_map_order() {
        assert_eq!(
            {
                let mut output = Vec::new();
                get_awd2_feature_names(&mut output);
                output
            },
            [
                "TriangleGeometry",
                "Container",
                "MeshInstance",
                "Light",
                "Camera",
                "LightPicker",
                "Material",
                "Texture",
                "Skeleton",
                "SkeletonPose",
                "SkeletonAnimation",
                "SkeletonClipNode",
                "AnimationSet"
            ]
        );
    }
    #[test]
    fn replaces_stale_names_on_every_call_without_replacing_the_callers_buffer() {
        let mut out = Vec::with_capacity(32);
        out.push("stale".to_string());
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        get_awd2_feature_names(&mut out);
        let expected = out.clone();
        assert_eq!(expected.len(), 13);
        out[0] = "changed".to_string();
        get_awd2_feature_names(&mut out);
        assert_eq!(out, expected);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}
