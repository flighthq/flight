use flight_scene3d_formats::contract::*;

pub(crate) fn build_md2_header(skins: i32, triangles: i32, frames: i32) -> Vec<u8> {
    let mut bytes = vec![0; MD2_HEADER_SIZE];
    for (offset, value) in [
        (0, MD2_MAGIC),
        (4, MD2_VERSION),
        (20, skins),
        (32, triangles),
        (40, frames),
    ] {
        bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
    }
    return bytes;
}

mod collect_md2_features {
    use super::*;
    #[test]
    fn rejects_small_wrong_magic_wrong_version_and_each_negative_count() {
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &[0; 10]) {
                    Some(output)
                } else {
                    None
                }
            },
            None
        );
        for (offset, value) in [(0, 0x12345678_i32), (4, 99), (20, -1), (32, -1), (40, -1)] {
            let mut bytes = build_md2_header(0, 0, 0);
            bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
            assert_eq!(
                {
                    let mut output = Vec::new();
                    if collect_md2_features(&mut output, &bytes) {
                        Some(output)
                    } else {
                        None
                    }
                },
                None
            );
        }
    }
    #[test]
    fn reports_mesh_only_when_triangles_and_at_least_one_frame_are_present() {
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &build_md2_header(0, 0, 0)) {
                    Some(output)
                } else {
                    None
                }
            },
            Some(vec![])
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &build_md2_header(0, 10, 1)) {
                    Some(output)
                } else {
                    None
                }
            },
            Some(vec!["Mesh".to_string()])
        );
        assert!(
            !{
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &build_md2_header(0, 10, 0)) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap()
            .contains(&"Mesh".to_string())
        );
        assert!(
            !{
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &build_md2_header(0, 0, 5)) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap()
            .contains(&"Mesh".to_string())
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &build_md2_header(0, 1, 1)) {
                    Some(output)
                } else {
                    None
                }
            },
            Some(vec!["Mesh".to_string()])
        );
    }
    #[test]
    fn reports_material_and_animation_from_their_independent_counts_in_source_order() {
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &build_md2_header(2, 0, 0)) {
                    Some(output)
                } else {
                    None
                }
            },
            Some(vec!["Material".to_string()])
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &build_md2_header(0, 0, 5)) {
                    Some(output)
                } else {
                    None
                }
            },
            Some(vec!["Animation".to_string()])
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &build_md2_header(0, 0, 1)) {
                    Some(output)
                } else {
                    None
                }
            },
            Some(vec![])
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &build_md2_header(1, 50, 10)) {
                    Some(output)
                } else {
                    None
                }
            },
            Some(
                MD2_FEATURE_NAMES
                    .iter()
                    .map(|value| value.to_string())
                    .collect()
            )
        );
    }
    #[test]
    fn honors_source_byte_subview_offsets() {
        let mut bytes = vec![0; 5];
        bytes.extend_from_slice(&build_md2_header(1, 50, 10));
        assert_eq!(
            {
                let mut output = Vec::new();
                if collect_md2_features(&mut output, &bytes[5..]) {
                    Some(output)
                } else {
                    None
                }
            }
            .unwrap(),
            vec!["Mesh", "Material", "Animation"]
        );
    }
    #[test]
    fn clears_previous_results_retains_capacity_and_distinguishes_valid_empty_from_invalid_input() {
        let mut out = Vec::with_capacity(16);
        out.push("stale".to_string());
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        assert!(collect_md2_features(&mut out, &build_md2_header(1, 1, 2)));
        assert_eq!(out, ["Mesh", "Material", "Animation"]);
        assert!(collect_md2_features(&mut out, &build_md2_header(0, 0, 0)));
        assert!(out.is_empty());
        out.push("stale".to_string());
        assert!(!collect_md2_features(&mut out, &[]));
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}
