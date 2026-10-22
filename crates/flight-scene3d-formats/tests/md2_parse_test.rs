use super::md2_test_helper::*;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_meshgeometry::{get_mesh_geometry_index_count, get_mesh_geometry_vertex_count};
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::MESH_KIND;
use flight_scene3d_formats::*;
use std::sync::Arc;

mod create_scene3d_from_md2 {
    use super::*;

    #[test]
    fn authored_normal_agrees_with_counter_clockwise_triangle_winding() {
        let mut f = triangle_fixture();
        f.vertices = vec![[0, 0, 0, 5], [0, 10, 0, 5], [10, 0, 0, 5]];
        let scene = create_scene3d_from_md2(&build_md2(&f), None, None);
        let geometry = scene_geometry(&scene);
        let g = geometry.read().unwrap();
        let indices = geometry_indices(&g);
        assert_eq!(indices, [0, 2, 1]);
        assert_eq!(&g.vertices[3..6], &[0.0, 1.0, 0.0]);
        let a: Vec<_> = (0..3)
            .map(|c| {
                g.vertices[indices[1] as usize * 12 + c] - g.vertices[indices[0] as usize * 12 + c]
            })
            .collect();
        let b: Vec<_> = (0..3)
            .map(|c| {
                g.vertices[indices[2] as usize * 12 + c] - g.vertices[indices[0] as usize * 12 + c]
            })
            .collect();
        let cross = [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ];
        assert!(
            cross
                .iter()
                .zip(&g.vertices[3..6])
                .map(|(a, b)| a * b)
                .sum::<f32>()
                > 0.0
        );
    }

    #[test]
    fn deduplicates_shared_vertex_uv_pairs_and_splits_distinct_uvs() {
        let mut f = triangle_fixture();
        f.tex_coords = vec![[0, 0]];
        f.triangles = vec![([0, 1, 2], [0, 0, 0]), ([2, 1, 0], [0, 0, 0])];
        let scene = create_scene3d_from_md2(&build_md2(&f), None, None);
        let geometry = scene_geometry(&scene);
        let g = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&g), 3);
        assert_eq!(get_mesh_geometry_index_count(&g), 6);
        f.tex_coords.push([32, 32]);
        f.triangles[1] = ([0, 1, 2], [1, 1, 1]);
        let scene = create_scene3d_from_md2(&build_md2(&f), None, None);
        let geometry = scene_geometry(&scene);
        let g = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&g), 6);
        assert_eq!(get_mesh_geometry_index_count(&g), 6);
    }

    #[test]
    fn decompresses_single_triangle_and_looks_up_y_up_anorms() {
        let mut f = triangle_fixture();
        f.vertices = vec![[10, 20, 30, 5], [20, 0, 0, 5], [0, 40, 0, 5]];
        f.scale = [0.5; 3];
        f.translate = [1.0, 2.0, 3.0];
        let scene = create_scene3d_from_md2(&build_md2(&f), None, None);
        let geometry = scene_geometry(&scene);
        let g = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&g), 3);
        assert_eq!(get_mesh_geometry_index_count(&g), 3);
        assert_eq!(&g.vertices[..3], &[6.0, 18.0, -12.0]);
        assert_eq!(
            &g.vertices[3..6],
            &[MD2_ANORMS[5][0], MD2_ANORMS[5][2], -MD2_ANORMS[5][1]]
        );
        assert!(g.vertices[6..10].iter().all(|v| *v == 0.0));
    }

    #[test]
    fn rejects_header_magic_version_truncation_and_absent_frames_or_triangles() {
        use ImportDiagnosticSeverity::Reject;
        let valid = build_md2(&triangle_fixture());
        let mut bad_magic = valid.clone();
        write_i32(&mut bad_magic, 0, 0x12345678);
        let mut bad_version = valid.clone();
        write_i32(&mut bad_version, 4, 99);
        let mut no_frames = valid.clone();
        write_i32(&mut no_frames, 40, 0);
        let mut no_triangles = valid.clone();
        write_i32(&mut no_triangles, 32, 0);
        for (bytes, kind, fields) in [
            (
                vec![0; 10].into_boxed_slice(),
                "md2.header-too-short",
                vec![("byteLength", 10.0)],
            ),
            (bad_magic, "md2.bad-magic", vec![]),
            (
                bad_version,
                "md2.unsupported-version",
                vec![("version", 99.0)],
            ),
            (
                valid[..70].into(),
                "md2.truncated-data-region",
                vec![("byteLength", 70.0)],
            ),
            (no_frames, "md2.no-frames", vec![]),
            (no_triangles, "md2.no-triangles", vec![]),
        ] {
            let mut diagnostics = Vec::new();
            let scene = create_scene3d_from_md2(&bytes, Some(&mut diagnostics), None);
            let root: NodeRef = scene.root.clone();
            assert!(
                {
                    let mut output = Vec::new();
                    get_node_children(&mut output, &root);
                    output
                }
                .is_empty()
            );
            let crumb = expect_crumb(&diagnostics, kind, Reject, "parseMd2", &fields);
            if kind == "md2.bad-magic" {
                assert_eq!(
                    crumb.detail.as_ref().unwrap().get("magic"),
                    Some(&ImportDiagnosticDetailValue::String("12345678".to_string()))
                );
            }
            if kind == "md2.no-frames" || kind == "md2.no-triangles" {
                assert!(crumb.detail.is_none());
            }
        }
    }

    #[test]
    fn scales_uvs_by_skin_dimensions() {
        let mut f = triangle_fixture();
        f.skin_width = 256;
        f.skin_height = 128;
        f.tex_coords = vec![[128, 64], [256, 128], [0, 0]];
        let scene = create_scene3d_from_md2(&build_md2(&f), None, None);
        let geometry = scene_geometry(&scene);
        let g = geometry.read().unwrap();
        assert_eq!(&g.vertices[10..12], &[0.5, 0.5]);
        assert_eq!(&g.vertices[22..24], &[1.0, 1.0]);
        assert_eq!(&g.vertices[34..36], &[0.0, 0.0]);
    }

    #[test]
    fn valid_scene_and_document_produce_no_diagnostics() {
        let bytes = build_md2(&triangle_fixture());
        let mut diagnostics = Vec::new();
        let scene = create_scene3d_from_md2(&bytes, Some(&mut diagnostics), None);
        scene_geometry(&scene);
        assert!(diagnostics.is_empty());
        let document = parse_md2(&bytes, Some(&mut diagnostics), None);
        assert_eq!(document.meshes.len(), 1);
        assert!(diagnostics.is_empty());
    }
}

mod md2_anorms_tests {
    use super::*;
    #[test]
    fn contains_all_162_distinct_unit_directions() {
        assert_eq!(MD2_ANORMS.len(), 162);
        for (i, n) in MD2_ANORMS.iter().enumerate() {
            let length = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
            assert!((length - 1.0).abs() < 0.00005);
            assert!(!MD2_ANORMS[..i].contains(n));
        }
    }
}

mod parse_md2 {
    use super::*;

    #[test]
    fn all_invalid_indices_emit_drop_then_reject_without_geometry() {
        let mut f = triangle_fixture();
        f.triangles = vec![([99, 98, 97], [0, 0, 0])];
        let mut diagnostics = Vec::new();
        let scene = create_scene3d_from_md2(&build_md2(&f), Some(&mut diagnostics), None);
        let root: NodeRef = scene.root.clone();
        assert!(
            {
                let mut output = Vec::new();
                get_node_children(&mut output, &root);
                output
            }
            .is_empty()
        );
        expect_crumb(
            &diagnostics,
            "md2.triangle-vertex-index-out-of-range",
            ImportDiagnosticSeverity::Drop,
            "parseMd2",
            &[("corners", 3.0)],
        );
        assert!(
            expect_crumb(
                &diagnostics,
                "md2.no-valid-triangles",
                ImportDiagnosticSeverity::Reject,
                "parseMd2",
                &[]
            )
            .detail
            .is_none()
        );
        assert_eq!(
            diagnostics
                .iter()
                .map(|d| d.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "md2.triangle-vertex-index-out-of-range",
                "md2.no-valid-triangles"
            ]
        );
    }

    #[test]
    fn byte_fixture_keeps_dequantization_precision_until_final_f32_store() {
        let mut f = triangle_fixture();
        f.vertices[0] = [255, 255, 255, 0];
        f.scale = [0.1; 3];
        f.translate = [-25.5; 3];
        let document = parse_md2(&build_md2(&f), None, None);
        let g = document.meshes[0].geometry.read().unwrap();
        assert_eq!(g.vertices[0].to_bits(), 0x34cc0000);
        assert_eq!(g.vertices[1].to_bits(), 0x34cc0000);
        assert_eq!(g.vertices[2].to_bits(), 0xb4cc0000);
        assert_eq!(g.vertices[0], 3.7997961044311523e-7);
        assert_ne!(g.vertices[0], 0.0);
        let early = f.scale[0] * 255.0;
        assert_eq!(early + f.translate[0], 0.0);
    }

    #[test]
    fn byte_fixture_rounds_reciprocal_product_only_at_uv_store() {
        let mut f = triangle_fixture();
        f.skin_width = 3;
        f.skin_height = 3;
        f.tex_coords[0] = [5, -5];
        let document = parse_md2(&build_md2(&f), None, None);
        let g = document.meshes[0].geometry.read().unwrap();
        assert_eq!(g.vertices[10].to_bits(), 0x3fd55555);
        assert_eq!(g.vertices[11].to_bits(), 0xbfd55555);
        let early = 1.0f32 / 3.0;
        assert_eq!((5.0 * early).to_bits(), 0x3fd55556);
        f.skin_width = 0;
        f.skin_height = -1;
        let document = parse_md2(&build_md2(&f), None, None);
        let g = document.meshes[0].geometry.read().unwrap();
        assert_eq!(g.vertices[10], 0.0);
        assert_eq!(g.vertices[11].to_bits(), (-0.0f32).to_bits());
    }

    #[test]
    fn decomposes_inline_geometry_mesh_node_and_all_document_tables() {
        let mut f = triangle_fixture();
        f.skins = vec!["players/hero/skin.pcx".to_string()];
        let document = parse_md2(&build_md2(&f), None, None);
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(
            get_mesh_geometry_vertex_count(&document.meshes[0].geometry.read().unwrap()),
            3
        );
        assert_eq!(document.nodes.len(), 1);
        assert_eq!(document.nodes[0].mesh, Some(0));
        assert_eq!(document.nodes[0].kind, MESH_KIND);
        assert_eq!(document.scenes[0].root_nodes, [0]);
        assert_eq!(document.resources.len(), 1);
        assert!(Arc::ptr_eq(
            &document.meshes[0].geometry.read().unwrap().layout,
            &CANONICAL_LAYOUT
        ));
    }

    #[test]
    fn empty_malformed_document_keeps_every_table_and_true_origin() {
        let mut diagnostics = Vec::new();
        let document = parse_md2(&[0; 10], Some(&mut diagnostics), None);
        expect_empty_document(&document);
        expect_crumb(
            &diagnostics,
            "md2.header-too-short",
            ImportDiagnosticSeverity::Reject,
            "parseMd2",
            &[("byteLength", 10.0)],
        );
    }

    #[test]
    fn independent_frame_stride_and_file_extent_are_checked() {
        let mut bytes = build_md2(&triangle_fixture());
        write_i32(&mut bytes, 16, 444);
        let mut diagnostics = Vec::new();
        expect_empty_document(&parse_md2(&bytes, Some(&mut diagnostics), None));
        expect_crumb(
            &diagnostics,
            "md2.frame-size-mismatch",
            ImportDiagnosticSeverity::Reject,
            "parseMd2",
            &[("actual", 52.0), ("expected", 444.0)],
        );
        let mut bytes = build_md2(&triangle_fixture());
        write_i32(&mut bytes, 64, 999999);
        diagnostics.clear();
        assert_eq!(
            parse_md2(&bytes, Some(&mut diagnostics), None).meshes.len(),
            1
        );
        expect_crumb(
            &diagnostics,
            "md2.file-size-mismatch",
            ImportDiagnosticSeverity::Recover,
            "parseMd2",
            &[("actual", bytes.len() as f32), ("expected", 999999.0)],
        );
    }

    #[test]
    fn invalid_normal_indices_are_distinct_aggregated_and_zero_filled() {
        let mut f = triangle_fixture();
        for v in &mut f.vertices {
            v[3] = 200;
        }
        let mut diagnostics = Vec::new();
        let scene = create_scene3d_from_md2(&build_md2(&f), Some(&mut diagnostics), None);
        let geometry = scene_geometry(&scene);
        assert_eq!(&geometry.read().unwrap().vertices[3..6], &[0.0; 3]);
        expect_crumb(
            &diagnostics,
            "md2.normal-index-out-of-range",
            ImportDiagnosticSeverity::Recover,
            "readMd2Frames",
            &[("firstIndex", 200.0), ("distinctIndices", 1.0)],
        );
        f.vertices[0][3] = 255;
        f.vertices[1][3] = 170;
        diagnostics.clear();
        parse_md2(&build_md2(&f), Some(&mut diagnostics), None);
        expect_crumb(
            &diagnostics,
            "md2.normal-index-out-of-range",
            ImportDiagnosticSeverity::Recover,
            "readMd2Frames",
            &[("firstIndex", 170.0), ("distinctIndices", 3.0)],
        );
        assert_eq!(parse_md2(&build_md2(&f), None, None).meshes.len(), 1);
    }

    #[test]
    fn negative_offsets_and_counts_reject_before_allocation_or_read() {
        for offset in [44, 48, 52, 56, 24, 28, 20] {
            let mut bytes = build_md2(&triangle_fixture());
            write_i32(&mut bytes, offset, -64);
            let mut diagnostics = Vec::new();
            expect_empty_document(&parse_md2(&bytes, Some(&mut diagnostics), None));
            expect_crumb(
                &diagnostics,
                "md2.negative-header-field",
                ImportDiagnosticSeverity::Reject,
                "parseMd2",
                &[("byteLength", bytes.len() as f32)],
            );
        }
        let mut bytes = build_md2(&triangle_fixture());
        for offset in [16, 24, 40] {
            write_i32(&mut bytes, offset, if offset == 16 { 0 } else { i32::MAX });
        }
        assert!(parse_md2(&bytes, None, None).meshes.is_empty());
    }

    #[test]
    fn overlapping_sibling_sections_report_once_and_keep_geometry() {
        let mut bytes = build_md2(&triangle_fixture());
        let off_triangles = i32::from_le_bytes(bytes[52..56].try_into().unwrap());
        write_i32(&mut bytes, 56, off_triangles);
        let mut diagnostics = Vec::new();
        let document = parse_md2(&bytes, Some(&mut diagnostics), None);
        assert_eq!(document.meshes.len(), 1);
        expect_crumb(
            &diagnostics,
            "md2.section-overlap",
            ImportDiagnosticSeverity::Recover,
            "parseMd2",
            &[("first", 2.0), ("second", 3.0)],
        );
    }

    #[test]
    fn per_corner_vertex_and_texcoord_drops_preserve_valid_corners_and_counts() {
        for (bad_vertices, bad_uvs, kind) in [
            (
                [99, 1, 2],
                [0, 0, 0],
                "md2.triangle-vertex-index-out-of-range",
            ),
            (
                [0, 1, 2],
                [99, 0, 0],
                "md2.triangle-texcoord-index-out-of-range",
            ),
        ] {
            let mut f = triangle_fixture();
            f.triangles.push((bad_vertices, bad_uvs));
            let mut diagnostics = Vec::new();
            let scene = create_scene3d_from_md2(&build_md2(&f), Some(&mut diagnostics), None);
            let geometry = scene_geometry(&scene);
            assert_eq!(get_mesh_geometry_index_count(&geometry.read().unwrap()), 5);
            expect_crumb(
                &diagnostics,
                kind,
                ImportDiagnosticSeverity::Drop,
                "parseMd2",
                &[("corners", 1.0)],
            );
        }
        let mut f = triangle_fixture();
        f.triangles.push(([99, 98, 97], [0, 0, 0]));
        let mut diagnostics = Vec::new();
        parse_md2(&build_md2(&f), Some(&mut diagnostics), None);
        expect_crumb(
            &diagnostics,
            "md2.triangle-vertex-index-out-of-range",
            ImportDiagnosticSeverity::Drop,
            "parseMd2",
            &[("corners", 3.0)],
        );
        assert_eq!(diagnostics.len(), 1);
    }
}

mod parse_md2_with_section_handlers {
    use super::*;

    #[test]
    fn malformed_input_still_reports_to_supplied_collector() {
        let mut diagnostics = Vec::new();
        expect_empty_document(&parse_md2_with_section_handlers(
            &[1, 2, 3],
            Some(&mut diagnostics),
            &[],
        ));
        expect_crumb(
            &diagnostics,
            "md2.header-too-short",
            ImportDiagnosticSeverity::Reject,
            "parseMd2",
            &[("byteLength", 3.0)],
        );
    }

    #[test]
    fn uses_only_given_family_without_resolving_defaults() {
        let mut f = triangle_fixture();
        f.skins = vec!["body.pcx".to_string()];
        let bytes = build_md2(&f);
        let bare = parse_md2_with_section_handlers(&bytes, None, &[]);
        assert!(bare.materials.is_empty());
        assert_eq!(bare.meshes.len(), 1);
        assert_eq!(
            parse_md2_with_section_handlers(&bytes, None, &[MD2_SKIN_HANDLER.clone()])
                .materials
                .len(),
            1
        );
    }
}
