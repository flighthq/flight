use flight_scene3d_formats::*;

mod collect_glb_features {
    use super::*;
    use crate::gltf_test_helper::build_json_glb;

    #[test]
    fn returns_null_for_a_buffer_too_small_for_the_header() {
        let mut out = vec!["stale".to_string()];
        assert!(!collect_glb_features(&mut out, &[0; 8]));
        assert!(out.is_empty());
    }

    #[test]
    fn returns_null_for_wrong_magic_bytes() {
        let mut bytes = build_json_glb(r#"{"asset":{"version":"2.0"}}"#);
        bytes[0..4].copy_from_slice(&0x12345678_u32.to_le_bytes());
        assert!(!collect_glb_features(&mut Vec::new(), &bytes));
    }

    #[test]
    fn returns_null_for_wrong_version() {
        let mut bytes = build_json_glb(r#"{"asset":{"version":"2.0"}}"#);
        bytes[4..8].copy_from_slice(&1_u32.to_le_bytes());
        assert!(!collect_glb_features(&mut Vec::new(), &bytes));
    }

    #[test]
    fn returns_null_when_json_chunk_is_truncated() {
        let bytes = build_json_glb(r#"{"asset":{"version":"2.0"},"meshes":[{}]}"#);
        assert!(!collect_glb_features(&mut Vec::new(), &bytes[..20]));
    }

    #[test]
    fn returns_null_when_declared_length_exceeds_buffer_and_json_extends_past_it() {
        let mut bytes = build_json_glb(r#"{"asset":{"version":"2.0"},"meshes":[{}]}"#);
        let declared = bytes.len() as u32 + 100;
        bytes[8..12].copy_from_slice(&declared.to_le_bytes());
        assert!(!collect_glb_features(
            &mut Vec::new(),
            &bytes[..bytes.len() - 1]
        ));
    }

    #[test]
    fn extracts_features_from_a_valid_glb() {
        let bytes = build_json_glb(r#"{"asset":{"version":"2.0"},"meshes":[{}],"cameras":[{}]}"#);
        let mut out = Vec::with_capacity(12);
        let storage = out.as_ptr();
        assert!(collect_glb_features(&mut out, &bytes));
        assert_eq!(out.as_ptr(), storage);
        out.sort();
        assert_eq!(out, ["Camera", "Mesh"]);
    }

    #[test]
    fn returns_null_when_glb_has_no_json_chunk() {
        let mut bytes = build_json_glb(r#"{"asset":{"version":"2.0"}}"#);
        bytes[16..20].copy_from_slice(&0x004e4942_u32.to_le_bytes());
        assert!(!collect_glb_features(&mut Vec::new(), &bytes));
    }

    #[test]
    fn handles_glb_with_minimal_valid_json_chunk() {
        let bytes = build_json_glb(r#"{"asset":{"version":"2.0"}}"#);
        let mut out = vec!["stale".to_string()];
        assert!(collect_glb_features(&mut out, &bytes));
        assert!(out.is_empty());
    }

    #[test]
    fn returns_null_for_json_that_is_not_a_gltf_document() {
        assert!(!collect_glb_features(
            &mut Vec::new(),
            &build_json_glb("{}")
        ));
    }
}

mod collect_gltf_features {
    use super::*;
    use crate::gltf_test_helper::{full_gltf_document, minimal_gltf_document};

    #[test]
    fn returns_an_empty_set_for_a_minimal_valid_document() {
        let document = minimal_gltf_document();
        let mut out = vec!["stale".to_string()];
        assert!(collect_gltf_features(
            &mut out,
            GltfSource::Document(GltfDocumentSource { source: &document })
        ));
        assert!(out.is_empty());
    }

    #[test]
    fn rejects_invalid_json_null_nonobjects_and_missing_asset_version() {
        for json in [
            "not valid json {",
            "null",
            r#""hello""#,
            "{}",
            r#"{"meshes":[{}]}"#,
        ] {
            let mut out = vec!["stale".to_string()];
            assert!(!collect_gltf_features(
                &mut out,
                GltfSource::Json(GltfJsonSource { source: json })
            ));
            assert!(out.is_empty());
        }
        let document = minimal_gltf_document();
        document.write().unwrap().asset = None;
        assert!(!collect_gltf_features(
            &mut Vec::new(),
            GltfSource::Document(GltfDocumentSource { source: &document })
        ));
        for json in [r#"{"asset":{"version":2}}"#, "[]", "42", "true"] {
            assert!(!collect_gltf_features(
                &mut Vec::new(),
                GltfSource::Json(GltfJsonSource { source: json })
            ));
        }
    }

    #[test]
    fn reports_mesh_animation_camera_and_skin_only_for_nonempty_arrays() {
        let full = full_gltf_document();
        for feature in ["Mesh", "Animation", "Camera", "Skin"] {
            let document = minimal_gltf_document();
            {
                let source = full.read().unwrap();
                let mut doc = document.write().unwrap();
                match feature {
                    "Mesh" => doc.meshes = source.meshes.clone(),
                    "Animation" => doc.animations = source.animations.clone(),
                    "Camera" => doc.cameras = source.cameras.clone(),
                    "Skin" => doc.skins = source.skins.clone(),
                    _ => unreachable!(),
                }
            }
            let mut out = Vec::new();
            assert!(collect_gltf_features(
                &mut out,
                GltfSource::Document(GltfDocumentSource { source: &document })
            ));
            assert!(out.iter().any(|value| value == feature));
            assert_eq!(out, [feature]);
        }
        let empty_mesh = minimal_gltf_document();
        empty_mesh.write().unwrap().meshes = Some(Vec::new());
        let mut out = Vec::new();
        assert!(collect_gltf_features(
            &mut out,
            GltfSource::Document(GltfDocumentSource {
                source: &empty_mesh
            })
        ));
        assert!(!out.iter().any(|value| value == "Mesh"));
    }

    #[test]
    fn reports_extensions_from_extensions_used_and_none_when_absent() {
        let document = minimal_gltf_document();
        document.write().unwrap().extensions_used = Some(vec![
            "KHR_materials_unlit".to_string(),
            "KHR_draco_mesh_compression".to_string(),
        ]);
        let mut out = Vec::new();
        assert!(collect_gltf_features(
            &mut out,
            GltfSource::Document(GltfDocumentSource { source: &document })
        ));
        assert!(out.iter().any(|value| value == "KHR_materials_unlit"));
        assert!(
            out.iter()
                .any(|value| value == "KHR_draco_mesh_compression")
        );
        let document = full_gltf_document();
        {
            let mut doc = document.write().unwrap();
            doc.animations = None;
            doc.cameras = None;
            doc.skins = None;
            doc.extensions_used = None;
        }
        assert!(collect_gltf_features(
            &mut out,
            GltfSource::Document(GltfDocumentSource { source: &document })
        ));
        assert_eq!(out, ["Mesh"]);
    }

    #[test]
    fn reports_all_features_for_a_full_model() {
        let document = full_gltf_document();
        let mut out = Vec::new();
        assert!(collect_gltf_features(
            &mut out,
            GltfSource::Document(GltfDocumentSource { source: &document })
        ));
        out.sort();
        assert_eq!(
            out,
            ["Animation", "Camera", "KHR_materials_unlit", "Mesh", "Skin"]
        );
    }

    #[test]
    fn parses_a_json_string_into_features() {
        let mut out = Vec::new();
        assert!(collect_gltf_features(
            &mut out,
            GltfSource::Json(GltfJsonSource {
                source: r#"{"asset":{"version":"2.0"},"meshes":[{}],"animations":[{}]}"#
            })
        ));
        assert!(out.iter().any(|value| value == "Mesh"));
        assert!(out.iter().any(|value| value == "Animation"));
    }

    #[test]
    fn returns_a_valid_empty_set_for_only_empty_arrays() {
        let mut out = vec!["stale".to_string()];
        assert!(collect_gltf_features(
            &mut out,
            GltfSource::Json(GltfJsonSource {
                source: r#"{"asset":{"version":"2.0"},"meshes":[],"animations":[],"cameras":[],"skins":[]}"#
            })
        ));
        assert!(out.is_empty());
    }

    #[test]
    fn preserves_query_capacity_and_deduplicates_in_source_discovery_order() {
        let document = full_gltf_document();
        document.write().unwrap().extensions_used = Some(
            ["Skin", "vendor.z", "Mesh", "vendor.a", "vendor.z"]
                .map(str::to_string)
                .to_vec(),
        );
        let mut out = Vec::with_capacity(12);
        out.push("stale".to_string());
        let storage = out.as_ptr();
        let capacity = out.capacity();
        assert!(collect_gltf_features(
            &mut out,
            GltfSource::Document(GltfDocumentSource { source: &document })
        ));
        assert_eq!(
            out,
            [
                "Mesh",
                "Animation",
                "Camera",
                "Skin",
                "vendor.z",
                "vendor.a"
            ]
        );
        assert_eq!(out.as_ptr(), storage);
        assert_eq!(out.capacity(), capacity);
        assert!(collect_gltf_features(
            &mut out,
            GltfSource::Json(GltfJsonSource {
                source: r#"{"asset":{"version":"2.0"},"meshes":[{}],"animations":[{}],"cameras":[{}],"skins":[{}],"extensionsUsed":["Skin","vendor.z","Mesh","vendor.a","vendor.z"],"irrelevant":1e400}"#
            })
        ));
        assert_eq!(
            out,
            [
                "Mesh",
                "Animation",
                "Camera",
                "Skin",
                "vendor.z",
                "vendor.a"
            ]
        );
        assert!(!collect_gltf_features(
            &mut out,
            GltfSource::Json(GltfJsonSource { source: "invalid" })
        ));
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), storage);
        assert_eq!(out.capacity(), capacity);
    }
}

mod extract_glb_json_chunk {
    use super::*;

    #[test]
    fn extracts_json_from_a_valid_glb_with_original_padding() {
        let json = r#"{"asset":{"version":"2.0"}}"#;
        let bytes = build_glb(&[(0x4e4f_534a, json.as_bytes())]);
        let extracted = extract_glb_json_chunk(&bytes).unwrap();
        assert_eq!(extracted.trim_end_matches(' '), json);
        assert_eq!(extracted.len(), (json.len() + 3) & !3);
        assert_eq!(GLTF_FEATURE_NAMES, ["Animation", "Camera", "Mesh", "Skin"]);
    }

    #[test]
    fn honors_the_declared_and_actual_lengths_and_caller_byte_window() {
        let json = b"{}";
        let mut bytes = build_glb(&[(0x4e4f_534a, json)]);
        bytes[8..12].copy_from_slice(&13_u32.to_le_bytes());
        assert_eq!(extract_glb_json_chunk(&bytes), None);
        let mut bytes = build_glb(&[(0x4e4f_534a, json)]);
        let oversized = bytes.len() as u32 + 100;
        bytes[8..12].copy_from_slice(&oversized.to_le_bytes());
        assert_eq!(extract_glb_json_chunk(&bytes), Some("{}  ".to_string()));
        assert_eq!(extract_glb_json_chunk(&bytes[..bytes.len() - 1]), None);
        let mut backing = vec![0xa5; 7];
        backing.extend_from_slice(&bytes);
        backing.extend_from_slice(b"outside the caller view");
        assert_eq!(
            extract_glb_json_chunk(&backing[7..7 + bytes.len()]),
            Some("{}  ".to_string())
        );
        assert_eq!(
            extract_glb_json_chunk(&backing[7..7 + bytes.len() - 1]),
            None
        );
        let mut declared_short = bytes;
        declared_short[8..12].copy_from_slice(&20_u32.to_le_bytes());
        assert_eq!(extract_glb_json_chunk(&declared_short), None);
    }

    #[test]
    fn matches_text_decoder_replacement_and_bom_handling() {
        let bytes = build_glb(&[(
            0x4e4f_534a,
            &[0xef, 0xbb, 0xbf, b'{', 0xe2, 0x82, b'!', 0xff, b'}'],
        )]);
        assert_eq!(
            extract_glb_json_chunk(&bytes),
            Some("{\u{fffd}!\u{fffd}}   ".to_string())
        );
        let bytes = build_glb(&[(0x4e4f_534a, &[0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf])]);
        assert_eq!(
            extract_glb_json_chunk(&bytes),
            Some("\u{feff}  ".to_string())
        );
    }

    #[test]
    fn returns_null_for_an_empty_buffer_and_invalid_headers() {
        assert_eq!(extract_glb_json_chunk(&[]), None);
        assert_eq!(extract_glb_json_chunk(&[0; 8]), None);
        let mut bytes = build_glb(&[(0x4e4f_534a, b"{}")]);
        bytes[0..4].copy_from_slice(&0x1234_5678_u32.to_le_bytes());
        assert_eq!(extract_glb_json_chunk(&bytes), None);
        bytes[0..4].copy_from_slice(&0x4654_6c67_u32.to_le_bytes());
        bytes[4..8].copy_from_slice(&1_u32.to_le_bytes());
        assert_eq!(extract_glb_json_chunk(&bytes), None);
    }

    #[test]
    fn skips_unknown_chunks_and_returns_only_the_first_json_payload() {
        let bytes = build_glb(&[
            (0x004e_4942, b"binary"),
            (0x4e4f_534a, b"first"),
            (0x4e4f_534a, b"second"),
        ]);
        assert_eq!(extract_glb_json_chunk(&bytes), Some("first   ".to_string()));
        let bytes = build_glb(&[(0x004e_4942, b"binary")]);
        assert_eq!(extract_glb_json_chunk(&bytes), None);
        let bytes = build_glb(&[(0x4e4f_534a, b"")]);
        assert_eq!(extract_glb_json_chunk(&bytes), Some(String::new()));
        let mut bytes = build_glb(&[(0x004e_4942, b"binary"), (0x4e4f_534a, b"{}")]);
        bytes[12..16].copy_from_slice(&u32::MAX.to_le_bytes());
        assert_eq!(extract_glb_json_chunk(&bytes), None);
    }
}

fn build_glb(chunks: &[(u32, &[u8])]) -> Vec<u8> {
    let total_length = 12
        + chunks
            .iter()
            .map(|(_, data)| 8 + ((data.len() + 3) & !3))
            .sum::<usize>();
    let mut bytes = Vec::with_capacity(total_length);
    bytes.extend_from_slice(&0x4654_6c67_u32.to_le_bytes());
    bytes.extend_from_slice(&2_u32.to_le_bytes());
    bytes.extend_from_slice(&(total_length as u32).to_le_bytes());
    for (chunk_type, data) in chunks {
        let padded_length = (data.len() + 3) & !3;
        bytes.extend_from_slice(&(padded_length as u32).to_le_bytes());
        bytes.extend_from_slice(&chunk_type.to_le_bytes());
        bytes.extend_from_slice(data);
        bytes.resize(bytes.len() + padded_length - data.len(), b' ');
    }
    return bytes;
}
