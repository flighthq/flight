use super::md5_test_helper::*;
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_meshgeometry::{
    CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, IndexBuffer, IndexBufferU16, MeshGeometry,
    MeshGeometryOptions, create_mesh_geometry, get_mesh_geometry_vertex_count,
};
use flight_scene3d::Scene3DDocument;
use flight_scene3d_formats::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

fn parse_source(source: &str, diagnostics: Option<&mut Vec<ImportDiagnostic>>) -> Scene3DDocument {
    return parse_md5_mesh_with_section_handlers(source, diagnostics, &MD5_ALL_SECTION_HANDLERS);
}

fn indices(geometry: &MeshGeometry) -> Vec<u32> {
    return match &geometry.indices {
        IndexBuffer::None => Vec::new(),
        IndexBuffer::U16(value) => value
            .data
            .read()
            .unwrap()
            .iter()
            .map(|value| *value as u32)
            .collect(),
        IndexBuffer::U32(value) => value.data.read().unwrap().to_vec(),
    };
}

fn close(a: f32, b: f32) {
    assert!((a - b).abs() < 0.00001, "{a} != {b}");
}

fn diagnostic<'a>(diagnostics: &'a [ImportDiagnostic], kind: &str) -> &'a ImportDiagnostic {
    return diagnostics
        .iter()
        .find(|value| value.kind == kind)
        .unwrap_or_else(|| panic!("missing {kind}"));
}

fn number(diagnostic: &ImportDiagnostic, key: &str) -> f32 {
    let ImportDiagnosticDetailValue::Number(value) =
        diagnostic.detail.as_ref().unwrap().get(key).unwrap()
    else {
        panic!("expected numeric {key}");
    };
    return *value;
}

fn bitangent(vertices: &[f32], vertex: usize) -> [f32; 3] {
    let base = vertex * 20;
    let n = &vertices[base + 3..base + 6];
    let t = &vertices[base + 6..base + 9];
    let sign = vertices[base + 9];
    return [
        sign * (n[1] * t[2] - n[2] * t[1]),
        sign * (n[2] * t[0] - n[0] * t[2]),
        sign * (n[0] * t[1] - n[1] * t[0]),
    ];
}

mod canonicalize_md5_tangent_handedness {
    use super::*;

    #[test]
    fn census_reports_contradictions_and_retains_the_first_sign_for_shared_vertices() {
        let mut vertices = vec![0.0; 4 * 12];
        for (vertex, (x, y, u, v)) in [
            (0.0, 0.0, 0.0, 0.0),
            (1.0, 0.0, 1.0, 0.0),
            (0.0, 1.0, 0.0, 1.0),
            (1.0, 1.0, -1.0, 1.0),
        ]
        .into_iter()
        .enumerate()
        {
            let base = vertex * 12;
            vertices[base] = x;
            vertices[base + 1] = y;
            vertices[base + 5] = 1.0;
            vertices[base + 9] = 1.0;
            vertices[base + 10] = u;
            vertices[base + 11] = v;
        }
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 {
                data: Arc::new(RwLock::new(vec![0, 1, 2, 3, 2, 1].into_boxed_slice())),
            })),
            layout: CANONICAL_LAYOUT.clone(),
            vertices: vertices.into_boxed_slice(),
            subsets: None,
            topology: None,
        });
        let mut drops = Vec::new();
        canonicalize_md5_tangent_handedness(&mut geometry, Some(&mut drops));
        assert_eq!(drops.len(), 1);
        assert_eq!(
            drops[0].value.kind,
            "md5mesh.tangent-handedness-contradiction"
        );
        assert_eq!(
            drops[0].value.detail.get("firstVertices"),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );
        assert_eq!(geometry.vertices[12 + 9], 1.0);
        assert_eq!(geometry.vertices[24 + 9], 1.0);
        assert_eq!(geometry.vertices[36 + 9], -1.0);
        canonicalize_md5_tangent_handedness(&mut geometry, None);
        assert_eq!(geometry.vertices[12 + 9], 1.0);
    }
}

mod parse_md5_mesh_with_section_handlers {
    use super::*;

    #[test]
    fn emits_canonical_triangle_normals_tangents_uvs_skin_document_and_quiet_diagnostics() {
        let mut diagnostics = Vec::new();
        let document = parse_source(SINGLE_TRIANGLE, Some(&mut diagnostics));
        assert!(diagnostics.is_empty());
        assert_eq!(document.meshes.len(), 1);
        assert!(document.animations.is_empty());
        assert_eq!(document.nodes.len(), 3);
        assert_eq!(document.nodes[0].name.as_deref(), Some("skeleton"));
        assert_eq!(document.nodes[0].children, [1]);
        assert_eq!(document.scenes[0].root_nodes, [0, 2]);
        assert_eq!(document.nodes[2].mesh, Some(0));
        assert_eq!(document.skins[0].joints, [1]);
        assert_eq!(document.skins[0].inverse_bind.len(), 1);
        assert_eq!(document.meshes[0].skin, Some(0));
        assert_eq!(document.meshes[0].materials, [0]);
        assert_eq!(document.resources.len(), 1);
        let geometry = document.meshes[0].geometry.read().unwrap();
        assert!(Arc::ptr_eq(
            &geometry.layout,
            &CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT
        ));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        assert_eq!(indices(&geometry), [0, 2, 1]);
        for (vertex, position) in [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, -1.0]]
            .iter()
            .enumerate()
        {
            let base = vertex * 20;
            for component in 0..3 {
                close(geometry.vertices[base + component], position[component]);
            }
            close(geometry.vertices[base + 3], 0.0);
            close(geometry.vertices[base + 4], -1.0);
            close(geometry.vertices[base + 5], 0.0);
            let t = &geometry.vertices[base + 6..base + 9];
            close((t[0] * t[0] + t[1] * t[1] + t[2] * t[2]).sqrt(), 1.0);
            assert_eq!(geometry.vertices[base + 9], -1.0);
            assert_eq!(&geometry.vertices[base + 12..base + 16], &[0.0; 4]);
            assert_eq!(
                &geometry.vertices[base + 16..base + 20],
                &[1.0, 0.0, 0.0, 0.0]
            );
        }
        assert_eq!(&geometry.vertices[10..12], &[0.0, 0.0]);
        assert_eq!(&geometry.vertices[30..32], &[1.0, 0.0]);
        assert_eq!(&geometry.vertices[50..52], &[0.0, 1.0]);
    }

    #[test]
    fn shares_area_weighted_normals_without_welding_uv_seams_or_tangent_records() {
        let document = parse_source(UV_SEAM_FOLD, None);
        let geometry = document.meshes[0].geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 6);
        for (a, b) in [(0, 3), (1, 4)] {
            let n = &geometry.vertices[a * 20 + 3..a * 20 + 6];
            close(n[0], 0.0);
            close(n[1], -2.0 / 5.0f32.sqrt());
            close(n[2], -1.0 / 5.0f32.sqrt());
            assert_eq!(n, &geometry.vertices[b * 20 + 3..b * 20 + 6]);
        }
        assert_ne!(&geometry.vertices[10..12], &geometry.vertices[70..72]);
        assert_ne!(&geometry.vertices[6..10], &geometry.vertices[66..70]);
    }

    #[test]
    fn resolves_authored_uv_polarity_after_mirrored_splits_and_preserves_skinned_records() {
        for source in [SINGLE_TRIANGLE, MIRRORED_UV_TRIANGLES] {
            let document = parse_source(source, None);
            let geometry = document.meshes[0].geometry.read().unwrap();
            for triangle in indices(&geometry).chunks_exact(3) {
                let [a, b, c] = [
                    triangle[0] as usize * 20,
                    triangle[1] as usize * 20,
                    triangle[2] as usize * 20,
                ];
                let v = &geometry.vertices;
                let determinant = (v[b + 10] - v[a + 10]) * (v[c + 11] - v[a + 11])
                    - (v[c + 10] - v[a + 10]) * (v[b + 11] - v[a + 11]);
                let sign = if determinant < 0.0 { -1.0 } else { 1.0 };
                for base in [a, b, c] {
                    assert_eq!(v[base + 9], sign);
                }
            }
            if source == MIRRORED_UV_TRIANGLES {
                assert_eq!(get_mesh_geometry_vertex_count(&geometry), 6);
                let indices = indices(&geometry);
                assert_eq!(
                    geometry.vertices[indices[0] as usize * 20 + 9],
                    -geometry.vertices[indices[3] as usize * 20 + 9]
                );
                for vertex in 0..6 {
                    assert_eq!(geometry.vertices[vertex * 20 + 16], 1.0);
                }
            }
        }
        let document = parse_source(DEGENERATE_UV_TRIANGLE, None);
        let geometry = document.meshes[0].geometry.read().unwrap();
        for index in indices(&geometry) {
            assert_eq!(geometry.vertices[index as usize * 20 + 9].abs(), 1.0);
        }
    }

    #[test]
    fn duplicated_mirrored_seam_reconstructs_continuous_unit_bitangents() {
        let document = parse_source(DIVERGENT_MIRRORED_UV_SEAM, None);
        let geometry = document.meshes[0].geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 6);
        assert_eq!(geometry.vertices[9], -geometry.vertices[69]);
        let a = bitangent(&geometry.vertices, 0);
        let b = bitangent(&geometry.vertices, 3);
        close((a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt(), 1.0);
        close((b[0] * b[0] + b[1] * b[1] + b[2] * b[2]).sqrt(), 1.0);
        for component in 0..3 {
            close(a[component], b[component]);
        }
    }

    #[test]
    fn preserves_hierarchy_parent_relative_locals_and_absolute_inverse_binds() {
        let document = parse_source(MULTI_JOINT_HIERARCHY, None);
        assert_eq!(document.skins[0].joints, [1, 2, 3]);
        assert_eq!(document.nodes[1].children, [2, 3]);
        assert_eq!(document.meshes[0].skin, Some(0));
        assert_eq!(document.nodes[2].name.as_deref(), Some("child_a"));
        let source = SINGLE_TRIANGLE.replace(
            "\"root\" -1 ( 0 0 0 ) ( 0 0 0 )",
            "\"root\" -1 ( 10 0 0 ) ( 0 0 0 )\n\"child\" 0 ( 10 5 0 ) ( 0 0 0 )",
        );
        let document = parse_source(&source, None);
        close(document.nodes[1].transform.position.x, 10.0);
        close(document.nodes[2].transform.position.x, 0.0);
        close(document.nodes[2].transform.position.z, -5.0);
        close(document.skins[0].inverse_bind[1].m[12], -10.0);
        close(document.skins[0].inverse_bind[1].m[14], 5.0);
    }

    #[test]
    fn bakes_weighted_joint_positions_and_keeps_the_same_top_four_as_the_skin_channels() {
        for (source, expected) in [
            (
                MULTI_JOINT_HIERARCHY,
                [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, -1.0]],
            ),
            (
                WEIGHTED_VERTICES,
                [[5.0, 0.0, 0.0], [1.0, 0.0, 0.0], [10.0, 0.0, -1.0]],
            ),
        ] {
            let document = parse_source(source, None);
            let geometry = document.meshes[0].geometry.read().unwrap();
            for (vertex, position) in expected.iter().enumerate() {
                for component in 0..3 {
                    close(
                        geometry.vertices[vertex * 20 + component],
                        position[component],
                    );
                }
            }
        }
        let mut diagnostics = Vec::new();
        let document = parse_source(OVER_INFLUENCED_VERTEX, Some(&mut diagnostics));
        let geometry = document.meshes[0].geometry.read().unwrap();
        for (a, b) in geometry.vertices[..3].iter().zip([3.0, 4.0, -4.0]) {
            close(*a, b);
        }
        assert_eq!(&geometry.vertices[12..16], &[0.0, 1.0, 2.0, 3.0]);
        for (a, b) in geometry.vertices[16..20].iter().zip([0.4, 0.3, 0.2, 0.1]) {
            close(*a, b);
        }
        let crumb = diagnostic(&diagnostics, "md5mesh.vertex-over-influenced");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(crumb.origin, "parseMd5Mesh");
        assert_eq!(number(crumb, "count"), 1.0);
        assert_eq!(number(crumb, "maxInfluences"), 5.0);
    }

    #[test]
    fn dropped_zero_weight_vertex_keeps_its_ordinal_placeholder_at_the_model_origin() {
        let source = SINGLE_TRIANGLE
            .replace("\"root\" -1 ( 0 0 0 )", "\"root\" -1 ( 5 5 5 )")
            .replace("vert 0 ( 0.0 0.0 ) 0 1", "vert 0 ( 0.0 0.0 ) 0 0")
            .replace("vert 1 ( 1.0 0.0 ) 1 1", "vert 1 ( 1.0 0.0 ) 0 1");
        let document = parse_source(&source, None);
        let geometry = document.meshes[0].geometry.read().unwrap();
        assert_eq!(&geometry.vertices[..3], &[0.0, 0.0, 0.0]);
        assert_eq!(&geometry.vertices[20..23], &[5.0, 5.0, -5.0]);
    }

    #[test]
    fn quaternion_w_and_rotated_weight_positions_follow_the_mesh_rule() {
        let source = SINGLE_TRIANGLE
            .replace("( 0 0 0 ) ( 0 0 0 )", "( 0 0 0 ) ( 0.5 0.5 0.5 )")
            .replace("weight 0 0 1.0 ( 0 0 0 )", "weight 0 0 1.0 ( 1 0 0 )")
            .replace("weight 1 0 1.0 ( 1 0 0 )", "weight 1 0 1.0 ( 0 1 0 )")
            .replace("weight 2 0 1.0 ( 0 1 0 )", "weight 2 0 1.0 ( 0 0 1 )");
        let document = parse_source(&source, None);
        let geometry = document.meshes[0].geometry.read().unwrap();
        for (vertex, expected) in [[0.0, 1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, -1.0]]
            .iter()
            .enumerate()
        {
            for component in 0..3 {
                close(
                    geometry.vertices[vertex * 20 + component],
                    expected[component],
                );
            }
        }
    }

    #[test]
    fn empty_and_unrecognised_inputs_reject_once_before_ordered_drop_flushes() {
        for source in [
            "",
            "// comment\n",
            "v 0 0 0\nf 1 1 1",
            "<html>404</html>",
            "MD5Version 10\nnumFrames 1",
        ] {
            let mut diagnostics = Vec::new();
            let document = parse_source(source, Some(&mut diagnostics));
            assert!(document.nodes.is_empty());
            assert!(document.meshes.is_empty());
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].kind, "md5mesh.no-data");
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
        }
        let mut diagnostics = Vec::new();
        parse_source(
            "joints {\nbad one\nbad two\nbad three\n}",
            Some(&mut diagnostics),
        );
        assert_eq!(
            diagnostics
                .iter()
                .map(|value| value.kind.as_str())
                .collect::<Vec<_>>(),
            ["md5mesh.no-data", "md5mesh.malformed-joint"]
        );
        assert_eq!(number(&diagnostics[1], "count"), 3.0);
        assert_eq!(number(&diagnostics[1], "firstLine"), 2.0);
        let document = parse_source(
            "joints {\n}\nmesh {\nnumverts 0\nnumtris 0\nnumweights 0\n}",
            None,
        );
        assert!(document.nodes.is_empty());
    }

    #[test]
    fn empty_mesh_sections_emit_no_mesh_node_and_report_one_drop() {
        let source = SINGLE_TRIANGLE
            .replace("numtris 1", "numtris 0")
            .replace("tri 0 0 1 2", "");
        let mut diagnostics = Vec::new();
        let document = parse_source(&source, Some(&mut diagnostics));
        assert!(document.meshes.is_empty());
        assert_eq!(document.nodes.len(), 2);
        let crumb = diagnostic(&diagnostics, "md5mesh.mesh-empty");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(crumb.origin, "parseMd5Mesh");
        assert_eq!(number(crumb, "count"), 1.0);
    }

    #[test]
    fn reports_each_malformed_record_reason_and_source_line_without_throwing() {
        for (source, kind, reason, line) in [
            ("joints {\nbad\n}", "joint", "missing-name-quotes", 2.0),
            (
                "joints {\n\"j\" 0 ( 1 2 ) ( 0 0 0 )\n}",
                "joint",
                "not-enough-components",
                2.0,
            ),
            (
                "joints {\n\"j\" 0 ( NaN 0 0 ) ( 0 0 0 )\n}",
                "joint",
                "non-numeric",
                2.0,
            ),
            (
                "mesh {\nvert 0 ( abc def ) 0 1\n}",
                "vert",
                "non-numeric",
                2.0,
            ),
            (
                "mesh {\nvert 0 ( 0 0 ) -3 2\n}",
                "vert",
                "weight-range",
                2.0,
            ),
            ("mesh {\nvert 0 ( 0 0 ) 0 0\n}", "vert", "weight-range", 2.0),
            ("mesh {\nvert 0\n}", "vert", "not-enough-components", 2.0),
            ("mesh {\ntri 0 abc\n}", "tri", "not-enough-components", 2.0),
            ("mesh {\ntri 0 abc 1 2\n}", "tri", "non-numeric", 2.0),
            (
                "mesh {\nweight 0\n}",
                "weight",
                "not-enough-components",
                2.0,
            ),
            (
                "mesh {\nweight 0 0 NaN ( 0 0 0 )\n}",
                "weight",
                "non-numeric",
                2.0,
            ),
        ] {
            let mut diagnostics = Vec::new();
            parse_source(source, Some(&mut diagnostics));
            let crumb = diagnostic(&diagnostics, &format!("md5mesh.malformed-{kind}"));
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "parseMd5Mesh");
            assert_eq!(number(crumb, "firstLine"), line);
            assert_eq!(number(crumb, "count"), 1.0);
            assert_eq!(
                crumb.detail.as_ref().unwrap().get("reason"),
                Some(&ImportDiagnosticDetailValue::String(reason.to_string()))
            );
        }
    }

    #[test]
    fn fills_record_gaps_keeps_first_repeats_and_reports_counts_on_both_block_exits() {
        let source = SINGLE_TRIANGLE.replace("weight 1 0 1.0 ( 1 0 0 )", "weight 1 0 1.0 ( 1 0 )");
        let mut diagnostics = Vec::new();
        let document = parse_source(&source, Some(&mut diagnostics));
        diagnostic(&diagnostics, "md5mesh.malformed-weight");
        diagnostic(&diagnostics, "md5mesh.weight-index-gap");
        let geometry = document.meshes[0].geometry.read().unwrap();
        close(geometry.vertices[40], 0.0);
        close(geometry.vertices[42], -1.0);
        assert!(geometry.vertices[40].is_finite());
        let source = SINGLE_TRIANGLE.replace(
            "weight 1 0 1.0 ( 1 0 0 )",
            "weight 1 0 1.0 ( 1 0 0 )\nweight 1 0 1.0 ( 100 0 0 )",
        );
        let mut diagnostics = Vec::new();
        let document = parse_source(&source, Some(&mut diagnostics));
        assert_eq!(
            number(
                diagnostic(&diagnostics, "md5mesh.weight-index-repeated"),
                "firstIndex"
            ),
            1.0
        );
        close(
            document.meshes[0].geometry.read().unwrap().vertices[20],
            1.0,
        );
        for closed in [true, false] {
            let source = SINGLE_TRIANGLE.replace("numweights 3", "numweights 4");
            let source = if closed {
                source
            } else {
                source.trim_end_matches('}').to_string()
            };
            let mut diagnostics = Vec::new();
            parse_source(&source, Some(&mut diagnostics));
            let crumb = diagnostic(&diagnostics, "md5mesh.weight-count-mismatch");
            assert_eq!(number(crumb, "firstExpected"), 4.0);
            assert_eq!(number(crumb, "firstActual"), 3.0);
            assert_eq!(
                diagnostics
                    .iter()
                    .any(|value| value.kind == "md5mesh.mesh-block-unclosed"),
                !closed
            );
        }
        for ordinal in ["-1", "1e3", "3.9", "+1", "01", "-0"] {
            for (record, tail) in [
                ("vert", "( 0 0 ) 0 1"),
                ("tri", "0 1 2"),
                ("weight", "0 1 ( 0 0 0 )"),
            ] {
                let mut diagnostics = Vec::new();
                parse_source(
                    &format!("mesh {{\n{record} {ordinal} {tail}\n}}"),
                    Some(&mut diagnostics),
                );
                let crumb = diagnostic(&diagnostics, &format!("md5mesh.malformed-{record}"));
                assert_eq!(
                    crumb.detail.as_ref().unwrap().get("reason"),
                    Some(&ImportDiagnosticDetailValue::String(
                        "bad-index".to_string()
                    ))
                );
            }
        }
    }

    #[test]
    fn drops_complete_invalid_triangles_and_recovers_invalid_weight_ranges_and_parents() {
        for index in ["-1", "7"] {
            let mut diagnostics = Vec::new();
            let document = parse_source(
                &SINGLE_TRIANGLE.replace("tri 0 0 1 2", &format!("tri 0 0 1 {index}")),
                Some(&mut diagnostics),
            );
            assert!(document.meshes.is_empty());
            let crumb = diagnostic(&diagnostics, "md5mesh.triangle-vertex-out-of-range");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(number(crumb, "firstCount"), 3.0);
        }
        for parent in ["-7", "0", "9"] {
            let mut diagnostics = Vec::new();
            parse_source(
                &SINGLE_TRIANGLE.replace("\"root\" -1", &format!("\"root\" {parent}")),
                Some(&mut diagnostics),
            );
            assert_eq!(
                number(
                    diagnostic(&diagnostics, "md5mesh.joint-parent-out-of-range"),
                    "firstParent"
                ),
                parent.parse::<f32>().unwrap()
            );
        }
        for (original, replacement, kind, expected) in [
            (
                "vert 0 ( 0.0 0.0 ) 0 1",
                "vert 0 ( 0.0 0.0 ) 50 1",
                "md5mesh.vertex-weight-out-of-range",
                50.0,
            ),
            (
                "weight 0 0 1.0",
                "weight 0 99 1.0",
                "md5mesh.weight-joint-out-of-range",
                99.0,
            ),
        ] {
            let mut diagnostics = Vec::new();
            parse_source(
                &SINGLE_TRIANGLE.replace(original, replacement),
                Some(&mut diagnostics),
            );
            let crumb = diagnostic(&diagnostics, kind);
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
            assert_eq!(number(crumb, "firstIndex"), expected);
        }
    }

    #[test]
    fn reports_version_shader_and_unclosed_blocks_and_ignores_comments() {
        for (source, kind) in [
            ("MD5Version 11", "md5mesh.unsupported-version"),
            (
                "joints {\n\"root\" -1 ( 0 0 0 ) ( 0 0 0 )",
                "md5mesh.joints-block-unclosed",
            ),
            ("mesh {\nnumverts 0", "md5mesh.mesh-block-unclosed"),
        ] {
            let mut diagnostics = Vec::new();
            parse_source(source, Some(&mut diagnostics));
            assert_eq!(
                diagnostic(&diagnostics, kind).severity,
                ImportDiagnosticSeverity::Recover
            );
            parse_source(source, None);
        }
        let source =
            SINGLE_TRIANGLE.replace("shader \"textures/default\"", "shader textures/default");
        let mut diagnostics = Vec::new();
        let document = parse_source(&source, Some(&mut diagnostics));
        assert!(document.materials.is_empty());
        assert!(document.meshes[0].materials.is_empty());
        diagnostic(&diagnostics, "md5mesh.shader-unquoted");
        let source = SINGLE_TRIANGLE
            .replace("joints {", "joints {\n // comment")
            .replace("mesh {", "mesh {\n // comment");
        let mut diagnostics = Vec::new();
        parse_source(&source, Some(&mut diagnostics));
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn supplied_families_are_exact_and_each_material_handler_gets_a_fresh_shallow_context() {
        let bare = parse_md5_mesh_with_section_handlers(SINGLE_TRIANGLE, None, &[]);
        assert!(bare.materials.is_empty());
        assert!(bare.skins.is_empty());
        assert_eq!(bare.meshes.len(), 1);
        let observed = Arc::new(Mutex::new(Vec::new()));
        let skeleton = Arc::new(RwLock::new(Md5SectionHandler {
            feature: MD5_SKELETON_FEATURE.to_string(),
            collect: Arc::new(|context| context.skin = Some(7)),
        }));
        let material = |slot: i32| -> Ref<Md5SectionHandler> {
            let observed = observed.clone();
            return Arc::new(RwLock::new(Md5SectionHandler {
                feature: MD5_MATERIAL_FEATURE.to_string(),
                collect: Arc::new(move |context| {
                    observed.lock().unwrap().push((
                        slot,
                        context.skin,
                        context.mesh.as_ref().unwrap().shader.to_string(),
                    ));
                    context.mesh.as_mut().unwrap().materials.push(slot);
                    context.skin = Some(-1);
                }),
            }));
        };
        let document = parse_md5_mesh_with_section_handlers(
            SINGLE_TRIANGLE,
            None,
            &[material(1), skeleton, material(2)],
        );
        assert_eq!(document.meshes[0].skin, Some(7));
        assert_eq!(document.meshes[0].materials, [1, 2]);
        assert_eq!(
            *observed.lock().unwrap(),
            [
                (1, Some(7), "textures/default".to_string()),
                (2, Some(7), "textures/default".to_string())
            ]
        );
    }

    #[test]
    fn numeric_prefix_finite_validation_and_mesh_quaternion_normalization_precede_f32_projection() {
        let captured = Arc::new(Mutex::new(Vec::new()));
        let output = captured.clone();
        let handler = Arc::new(RwLock::new(Md5SectionHandler {
            feature: MD5_SKELETON_FEATURE.to_string(),
            collect: Arc::new(move |context| {
                *output.lock().unwrap() = context
                    .joints
                    .iter()
                    .map(|j| {
                        [
                            j.position_x,
                            j.position_y,
                            j.position_z,
                            j.orientation_x,
                            j.orientation_y,
                            j.orientation_z,
                            j.orientation_w,
                        ]
                    })
                    .collect();
            }),
        }));
        let mut diagnostics = Vec::new();
        parse_md5_mesh_with_section_handlers(
            "\u{feff}joints {\n\"huge\" -1 ( 1e300 1.25junk 0xFF ) ( 1e20 0 0 )\n\"prefix\" -1 ( 1e+ 2.5E-1suffix .5x ) ( 0 0 0 )\n}",
            Some(&mut diagnostics),
            &[handler.clone()],
        );
        let captured = captured.lock().unwrap();
        assert_eq!(captured.len(), 2);
        assert_eq!(captured[0], [f32::INFINITY, 1.25, 0.0, 1.0, 0.0, 0.0, 0.0]);
        assert_eq!(captured[1], [1.0, 0.25, 0.5, 0.0, 0.0, 0.0, -1.0]);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "md5mesh.joint-orientation-not-unit");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        drop(captured);
        for token in ["Infinity", "-Infinity", "NaN", "1e400", ".", "-x"] {
            let mut diagnostics = Vec::new();
            parse_md5_mesh_with_section_handlers(
                &format!("joints {{\n\"bad\" -1 ( {token} 0 0 ) ( 0 0 0 )\n}}"),
                Some(&mut diagnostics),
                &[handler.clone()],
            );
            assert_eq!(
                diagnostics
                    .iter()
                    .map(|value| value.kind.as_str())
                    .collect::<Vec<_>>(),
                ["md5mesh.no-data", "md5mesh.malformed-joint"]
            );
            assert_eq!(diagnostics[1].severity, ImportDiagnosticSeverity::Drop);
        }
    }
}

mod tally_md5_drop {
    use super::*;

    #[test]
    fn disabled_collector_is_noop_and_ordered_groups_retain_first_detail_and_severity() {
        tally_md5_drop(
            None,
            ImportDiagnosticSeverity::Drop,
            "unused",
            "",
            HashMap::new(),
        );
        let mut tallies = Vec::new();
        for (severity, kind, discriminator, line) in [
            (ImportDiagnosticSeverity::Drop, "bad", "first", 1.0),
            (ImportDiagnosticSeverity::Recover, "other", "", 2.0),
            (ImportDiagnosticSeverity::Recover, "bad", "first", 3.0),
            (ImportDiagnosticSeverity::Drop, "bad", "second", 4.0),
        ] {
            tally_md5_drop(
                Some(&mut tallies),
                severity,
                kind,
                discriminator,
                HashMap::from([(
                    "firstLine".to_string(),
                    ImportDiagnosticDetailValue::Number(line),
                )]),
            );
        }
        assert_eq!(
            tallies
                .iter()
                .map(|entry| entry.key.as_str())
                .collect::<Vec<_>>(),
            ["bad|first", "other|", "bad|second"]
        );
        assert_eq!(tallies[0].value.count, 2);
        assert_eq!(tallies[0].value.severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(
            tallies[0].value.detail.get("firstLine"),
            Some(&ImportDiagnosticDetailValue::Number(1.0))
        );
    }
}
