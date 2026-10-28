use super::three_ds_test_helper::*;
use flight_geometry::contract::{
    compose_matrix4_from_transform3d, create_matrix4, create_vector3, matrix4_transform_point,
};
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_materials::{BlinnPhongMaterial, MaterialAlphaMode};
use flight_meshgeometry::get_mesh_geometry_vertex_count;
use flight_scene3d::Scene3DDocumentMaterial;
use flight_scene3d_formats::*;
use std::sync::Arc;

fn close(a: f32, b: f32) {
    assert!((a - b).abs() < 0.0001, "{a} != {b}");
}
fn diagnostic<'a>(diagnostics: &'a [ImportDiagnostic], kind: &str) -> &'a ImportDiagnostic {
    return diagnostics
        .iter()
        .find(|crumb| crumb.kind == kind)
        .unwrap_or_else(|| panic!("missing {kind}"));
}

mod parse_three_ds_trimesh {
    use super::*;
    #[test]
    fn reads_vertices_faces_uvs_groups_smoothing_and_local_matrix_and_rejects_missing_geometry() {
        let mut bytes = write_vertices(&TRIANGLE_POSITIONS).to_vec();
        bytes.extend_from_slice(&write_faces(
            &[0, 1, 2],
            &[write_face_group("mat", &[0]), write_smoothing(&[1])],
        ));
        bytes.extend_from_slice(&write_chunk(
            THREE_DS_TRANSFORM_MATRIX,
            &float_bytes(&IDENTITY_LOCAL),
        ));
        let chunk = write_chunk(THREE_DS_TRIMESH, &bytes);
        let mesh = parse_three_ds_trimesh(&chunk, 0, chunk.len(), "Box", None).unwrap();
        assert_eq!(mesh.name, "Box");
        assert_eq!(&*mesh.vertices, &TRIANGLE_POSITIONS);
        assert_eq!(&*mesh.faces, &[0, 1, 2]);
        assert_eq!(mesh.material_groups[0].name, "mat");
        assert_eq!(mesh.smoothing_groups.as_deref(), Some([1u32].as_slice()));
        assert_eq!(
            mesh.local_matrix.as_deref(),
            Some(IDENTITY_LOCAL.as_slice())
        );
        for children in [
            Vec::new(),
            write_vertices(&TRIANGLE_POSITIONS).to_vec(),
            write_faces(&[0, 1, 2], &[]).to_vec(),
        ] {
            let chunk = write_chunk(THREE_DS_TRIMESH, &children);
            let mut drops = Vec::new();
            assert!(
                parse_three_ds_trimesh(&chunk, 0, chunk.len(), "Missing", Some(&mut drops))
                    .is_none()
            );
            assert_eq!(
                drops.last().unwrap().value.kind,
                "3ds.mesh-missing-geometry"
            );
        }
    }

    #[test]
    fn every_count_guard_reports_its_reason_and_preserves_the_source_survivor_policy() {
        for (id, payload, kind, reason, survives, severity) in [
            (
                THREE_DS_VERTICES,
                Vec::new(),
                "3ds.vertices-truncated",
                "no-count",
                false,
                ImportDiagnosticSeverity::Drop,
            ),
            (
                THREE_DS_VERTICES,
                vec![3, 0, 0, 0, 0, 0],
                "3ds.vertices-truncated",
                "truncated",
                false,
                ImportDiagnosticSeverity::Drop,
            ),
            (
                THREE_DS_FACES,
                Vec::new(),
                "3ds.faces-truncated",
                "no-count",
                false,
                ImportDiagnosticSeverity::Drop,
            ),
            (
                THREE_DS_FACES,
                vec![3, 0, 0, 0],
                "3ds.faces-truncated",
                "truncated",
                false,
                ImportDiagnosticSeverity::Drop,
            ),
            (
                THREE_DS_UV_COORDS,
                Vec::new(),
                "3ds.uv-truncated",
                "no-count",
                true,
                ImportDiagnosticSeverity::Recover,
            ),
            (
                THREE_DS_UV_COORDS,
                vec![3, 0, 0, 0],
                "3ds.uv-truncated",
                "truncated",
                true,
                ImportDiagnosticSeverity::Recover,
            ),
        ] {
            let vertices = if id == THREE_DS_VERTICES {
                write_chunk(id, &payload)
            } else {
                write_vertices(&TRIANGLE_POSITIONS)
            };
            let faces = if id == THREE_DS_FACES {
                write_chunk(id, &payload)
            } else {
                write_faces(&[0, 1, 2], &[])
            };
            let mut bytes = vertices.to_vec();
            bytes.extend_from_slice(&faces);
            if id == THREE_DS_UV_COORDS {
                bytes.extend_from_slice(&write_chunk(id, &payload));
            }
            let chunk = write_chunk(THREE_DS_TRIMESH, &bytes);
            let mut drops = Vec::new();
            let mesh = parse_three_ds_trimesh(&chunk, 0, chunk.len(), "Broken", Some(&mut drops));
            assert_eq!(mesh.is_some(), survives);
            parse_three_ds_trimesh(&chunk, 0, chunk.len(), "Broken", None);
            let crumb = drops.iter().find(|entry| entry.value.kind == kind).unwrap();
            assert_eq!(crumb.value.severity, severity);
            assert_eq!(
                crumb.value.detail.get("reason"),
                Some(&ImportDiagnosticDetailValue::String(reason.to_string()))
            );
            if reason == "truncated" {
                assert_eq!(
                    crumb.value.detail.get("firstCount"),
                    Some(&ImportDiagnosticDetailValue::Number(3.0))
                );
            }
        }
    }

    #[test]
    fn trailing_group_smoothing_and_local_matrix_faults_keep_the_mesh_and_tally_by_reason() {
        for (trailing, kind) in [
            (
                write_chunk(THREE_DS_FACE_MATERIAL, b"M\0"),
                "3ds.material-group-truncated",
            ),
            (
                write_chunk(THREE_DS_FACE_MATERIAL, b"M\0\x02\0\0\0"),
                "3ds.material-group-truncated",
            ),
            (
                write_face_group("M", &[9]),
                "3ds.material-group-face-out-of-range",
            ),
            (write_smoothing(&[]), "3ds.smoothing-truncated"),
            (vec![0; 6].into_boxed_slice(), "3ds.face-subchunk-exceeds"),
        ] {
            let mut bytes = write_vertices(&TRIANGLE_POSITIONS).to_vec();
            bytes.extend_from_slice(&write_faces(&[0, 1, 2], &[trailing]));
            let chunk = write_chunk(THREE_DS_TRIMESH, &bytes);
            let mut drops = Vec::new();
            assert!(
                parse_three_ds_trimesh(&chunk, 0, chunk.len(), "Partial", Some(&mut drops))
                    .is_some()
            );
            assert!(drops.iter().any(|entry| entry.value.kind == kind));
        }
        let mut bytes = write_vertices(&TRIANGLE_POSITIONS).to_vec();
        bytes.extend_from_slice(&write_faces(&[0, 1, 2], &[]));
        bytes.extend_from_slice(&write_chunk(THREE_DS_TRANSFORM_MATRIX, &[0; 8]));
        bytes.extend_from_slice(&[0; 6]);
        let chunk = write_chunk(THREE_DS_TRIMESH, &bytes);
        let mut drops = Vec::new();
        let mesh =
            parse_three_ds_trimesh(&chunk, 0, chunk.len(), "Partial", Some(&mut drops)).unwrap();
        assert!(mesh.local_matrix.is_none());
        assert_eq!(
            drops
                .iter()
                .map(|entry| entry.value.kind.as_str())
                .collect::<Vec<_>>(),
            ["3ds.local-matrix-truncated", "3ds.subchunk-exceeds-trimesh"]
        );
    }
}

mod three_ds_mesh_handler {
    use super::*;
    #[test]
    fn family_identity_and_triangle_geometry_preserve_source_winding_axis_rotation_uv_flip_and_tangent_zero_fill()
     {
        assert_eq!(THREE_DS_MESH_FAMILY.len(), 1);
        assert!(Arc::ptr_eq(
            &THREE_DS_MESH_FAMILY[0],
            &THREE_DS_MESH_HANDLER
        ));
        assert_eq!(
            THREE_DS_MESH_HANDLER.read().unwrap().chunk_ids,
            [THREE_DS_TRIMESH]
        );
        let bytes = build_minimal_three_ds(&[write_mesh_object(
            "Tri",
            &TRIANGLE_POSITIONS,
            &write_faces(&[0, 1, 2], &[]),
            Some(&[0.0, 0.0, 1.0, 0.0, 0.5, 1.0]),
            None,
        )]);
        let mut diagnostics = Vec::new();
        let document = parse3ds(&bytes, Some(&mut diagnostics), None);
        assert!(diagnostics.is_empty());
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.nodes[0].name.as_deref(), Some("Tri"));
        assert_eq!(document.nodes[0].mesh, Some(0));
        assert_eq!(document.scenes[0].root_nodes, [0]);
        assert_eq!(document.meshes[0].materials, [-1]);
        let geometry = document.meshes[0].geometry.read().unwrap();
        assert!(Arc::ptr_eq(&geometry.layout, &CANONICAL_LAYOUT));
        assert_eq!(geometry_indices(&geometry), [0, 1, 2]);
        assert_eq!(&geometry.vertices[..3], &[0.0, 0.0, 0.0]);
        assert_eq!(&geometry.vertices[12..15], &[1.0, 0.0, 0.0]);
        assert_eq!(&geometry.vertices[24..27], &[0.0, 0.0, -1.0]);
        for vertex in 0..3 {
            assert_eq!(
                &geometry.vertices[vertex * 12 + 3..vertex * 12 + 6],
                &[0.0, 1.0, 0.0]
            );
            assert_eq!(
                &geometry.vertices[vertex * 12 + 6..vertex * 12 + 10],
                &[0.0; 4]
            );
        }
        assert_eq!(&geometry.vertices[10..12], &[0.0, 1.0]);
        assert_eq!(&geometry.vertices[22..24], &[1.0, 1.0]);
        assert_eq!(&geometry.vertices[34..36], &[0.5, 0.0]);
    }

    #[test]
    fn signed_volume_distinguishes_outward_inward_and_open_meshes_independently_of_normals() {
        for inward in [false, true] {
            let mut indices = CUBE_INDICES_CCW_OUT;
            if inward {
                for face in indices.chunks_exact_mut(3) {
                    face.swap(1, 2);
                }
            }
            let bytes = build_minimal_three_ds(&[write_mesh_object(
                "Cube",
                &CUBE_POSITIONS,
                &write_faces(&indices, &[]),
                None,
                None,
            )]);
            let document = parse3ds(&bytes, None, None);
            let geometry = document.meshes[0].geometry.read().unwrap();
            assert!(
                (signed_volume_of_closed_geometry(&geometry).unwrap()
                    - if inward { -1.0 } else { 1.0 })
                .abs()
                    < 0.0000005
            );
        }
        let bytes = build_minimal_three_ds(&[write_mesh_object(
            "Open",
            &CUBE_POSITIONS,
            &write_faces(&CUBE_INDICES_CCW_OUT[..30], &[]),
            None,
            None,
        )]);
        let document = parse3ds(&bytes, None, None);
        assert_eq!(
            signed_volume_of_closed_geometry(&document.meshes[0].geometry.read().unwrap()),
            None
        );
    }

    #[test]
    fn splits_smoothing_creases_and_preserves_smooth_defaults_and_overlapping_masks() {
        let positions = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 0.0, 1.0];
        for (masks, expected) in [
            (None, 4),
            (Some(vec![1, 1]), 4),
            (Some(vec![1, 2]), 6),
            (Some(vec![0, 0]), 6),
            (Some(vec![3, 2]), 4),
        ] {
            let trailing = masks
                .map(|masks| vec![write_smoothing(&masks)])
                .unwrap_or_default();
            let bytes = build_minimal_three_ds(&[write_mesh_object(
                "Fold",
                &positions,
                &write_faces(&[0, 1, 2, 1, 3, 2], &trailing),
                None,
                None,
            )]);
            let document = parse3ds(&bytes, None, None);
            let geometry = document.meshes[0].geometry.read().unwrap();
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), expected);
            if expected == 6 {
                assert_ne!(&geometry.vertices[3..6], &geometry.vertices[39..42]);
            }
        }
    }

    #[test]
    fn keeps_unit_edges_until_derived_normals_are_written_even_when_a_large_pivot_collapses_final_float32_positions()
     {
        let mesh = write_mesh_object(
            "FarPivot",
            &TRIANGLE_POSITIONS,
            &write_faces(&[0, 1, 2], &[]),
            None,
            Some(&IDENTITY_LOCAL),
        );
        let mut body = write_chunk(THREE_DS_EDITOR, &mesh).to_vec();
        body.extend_from_slice(&pivot_chunk("FarPivot", [1e10, 0.0, 0.0]));
        let mut diagnostics = Vec::new();
        let document = parse3ds(
            &write_chunk(THREE_DS_MAIN, &body),
            Some(&mut diagnostics),
            None,
        );
        assert!(diagnostics.is_empty());
        let geometry = document.meshes[0].geometry.read().unwrap();
        assert_eq!(geometry.vertices[0], -1e10);
        assert_eq!(geometry.vertices[12], -1e10);
        for corner in 0..3 {
            assert_eq!(
                &geometry.vertices[corner * 12 + 3..corner * 12 + 6],
                &[0.0, 1.0, 0.0]
            );
        }
        assert_eq!(document.nodes[0].transform.position.x, 1e10);
        assert_eq!((1.0_f64 - 1e10_f64) - (0.0_f64 - 1e10_f64), 1.0);
        assert_eq!((1.0_f32 - 1e10_f32) - (0.0_f32 - 1e10_f32), 0.0);
    }

    #[test]
    fn explicit_float64_normal_scratch_keeps_large_finite_cross_products_normalizable() {
        let positions = [0.0, 0.0, 0.0, 1e20, 0.0, 0.0, 0.0, 1e20, 0.0];
        let bytes = build_minimal_three_ds(&[write_mesh_object(
            "Large",
            &positions,
            &write_faces(&[0, 1, 2], &[]),
            None,
            None,
        )]);
        let document = parse3ds(&bytes, None, None);
        let geometry = document.meshes[0].geometry.read().unwrap();
        assert_eq!(&geometry.vertices[3..6], &[0.0, 1.0, 0.0]);
    }

    #[test]
    fn mirrored_local_placement_reverses_the_file_corner_order_and_keeps_the_world_normal_outward()
    {
        use flight_geometry::{
            clone_matrix4, create_vector4, inverse_matrix4, matrix4_transform_vector,
            transpose_matrix4,
        };
        let local = [-1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];
        let world = [0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 3.0, 0.0];
        let bytes = build_minimal_three_ds(&[write_mesh_object(
            "Mirror",
            &world,
            &write_faces(&[0, 1, 2], &[]),
            None,
            Some(&local),
        )]);
        let document = parse3ds(&bytes, None, None);
        let geometry = document.meshes[0].geometry.read().unwrap();
        let mut placement = create_matrix4();
        compose_matrix4_from_transform3d(&mut placement, &document.nodes[0].transform);
        let m = &placement.m;
        let determinant = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9])
            + m[8] * (m[1] * m[6] - m[2] * m[5]);
        assert!(determinant < 0.0);
        let indices = geometry_indices(&geometry);
        close(geometry.vertices[indices[1] as usize * 12 + 2], -3.0);
        let mut inverse = create_matrix4();
        assert!(inverse_matrix4(&mut inverse, &placement));
        let source = clone_matrix4(&inverse);
        transpose_matrix4(&mut inverse, &source);
        let base = indices[0] as usize * 12;
        let normal = create_vector4(
            geometry.vertices[base + 3],
            geometry.vertices[base + 4],
            geometry.vertices[base + 5],
            0.0,
        );
        let mut transformed = create_vector4(0.0, 0.0, 0.0, 0.0);
        matrix4_transform_vector(&mut transformed, &inverse, &normal);
        assert!(transformed.y * 6.0 > 0.0);
    }

    #[test]
    fn material_groups_emit_contiguous_subsets_default_tail_and_last_claim_wins_with_first_use_cache()
     {
        let positions = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0];
        let red = write_material(&material_fixture("Red", [255.0, 0.0, 0.0]));
        let blue = write_material(&material_fixture("Blue", [0.0, 0.0, 255.0]));
        for (groups, expected) in [
            (
                vec![
                    write_face_group("Red", &[0]),
                    write_face_group("Blue", &[1]),
                ],
                vec![0, 1],
            ),
            (vec![write_face_group("Red", &[0])], vec![0, -1]),
        ] {
            let bytes = build_minimal_three_ds(&[
                red.clone(),
                blue.clone(),
                write_mesh_object(
                    "Quad",
                    &positions,
                    &write_faces(&[0, 1, 2, 0, 2, 3], &groups),
                    None,
                    None,
                ),
            ]);
            let document = parse3ds(&bytes, None, None);
            assert_eq!(document.meshes[0].materials, expected);
            let geometry = document.meshes[0].geometry.read().unwrap();
            let subsets = &geometry.subsets;
            assert_eq!(subsets.len(), 2);
            assert_eq!(
                (
                    subsets[0].index_offset,
                    subsets[0].index_count,
                    subsets[1].index_offset,
                    subsets[1].index_count
                ),
                (0, 3, 3, 3)
            );
        }
        let groups = [
            write_face_group("Red", &[0]),
            write_face_group("Blue", &[0, 1]),
        ];
        let mesh = write_mesh_object(
            "Quad",
            &positions,
            &write_faces(&[0, 1, 2, 0, 2, 3], &groups),
            None,
            None,
        );
        let bytes = build_minimal_three_ds(&[red, blue, mesh.clone(), mesh]);
        let document = parse3ds(&bytes, None, None);
        assert_eq!(document.materials.len(), 2);
        assert_eq!(document.meshes[0].materials, [1]);
        assert_eq!(document.meshes[1].materials, [1]);
    }

    #[test]
    fn material_conversion_preserves_authored_name_texture_identity_scalar_alpha_and_opacity_map_blending()
     {
        let mut fixture = material_fixture("Skin", [204.0, 102.0, 51.0]);
        fixture.texture_filename = Some("skin.png");
        fixture.bump_filename = Some("height.png");
        fixture.shininess_percent = Some(50);
        for (opacity_map, transparency) in [
            (None, None),
            (None, Some(25)),
            (Some("alpha.png"), None),
            (Some("alpha.png"), Some(25)),
            (Some("alpha.png"), Some(40)),
        ] {
            fixture.opacity_filename = opacity_map;
            fixture.transparency_percent = transparency;
            let mesh = write_mesh_object(
                "Tri",
                &TRIANGLE_POSITIONS,
                &write_faces(&[0, 1, 2], &[write_face_group("Skin", &[0])]),
                None,
                None,
            );
            let bytes = build_minimal_three_ds(&[write_material(&fixture), mesh]);
            let document = parse3ds(&bytes, None, None);
            let Scene3DDocumentMaterial::Entity(entry) = &document.materials[0] else {
                panic!("entity");
            };
            let material = entry.material.read().unwrap();
            let value = material
                .as_any()
                .downcast_ref::<BlinnPhongMaterial>()
                .unwrap();
            assert_eq!(material.material_fields().name.as_deref(), Some("Skin"));
            assert_eq!(
                value.diffuse,
                match transparency {
                    Some(25) => 0xcc6633bf,
                    Some(40) => 0xcc663399,
                    _ => 0xcc6633ff,
                }
            );
            assert_eq!(value.specular, 0xffffffff);
            assert_eq!(value.shininess, 64.0);
            assert!(value.normal_map.is_none());
            assert_eq!(
                material.material3d_fields().alpha_mode,
                if opacity_map.is_some() || transparency.is_some() {
                    MaterialAlphaMode::Blend
                } else {
                    MaterialAlphaMode::Opaque
                }
            );
            let texture = value.diffuse_map.as_ref().unwrap();
            assert!(flight_texture::get_texture_source(&*texture.read().unwrap()).is_none());
            let resource = flight_scene3d_formats::contract::get_test_texture_resource(
                &document.resources,
                texture,
            );
            let flight_image::ImageResourceReference::External(resource) = resource else {
                panic!("external");
            };
            assert_eq!(resource.reference.read().unwrap().uri, "skin.png");
            assert_eq!(value.alpha_map.is_some(), opacity_map.is_some());
            if let Some(alpha) = &value.alpha_map {
                let resource = flight_scene3d_formats::contract::get_test_texture_resource(
                    &document.resources,
                    alpha,
                );
                let flight_image::ImageResourceReference::External(resource) = resource else {
                    panic!("external alpha");
                };
                assert_eq!(resource.reference.read().unwrap().uri, "alpha.png");
                assert!(!Arc::ptr_eq(alpha, texture));
            }
        }
        fixture.opacity_filename = None;
        fixture.transparency_percent = None;
        fixture.shininess_percent = Some(0);
        fixture.diffuse_float = true;
        fixture.diffuse = [1.0, 0.4, 0.2];
        let bytes = build_minimal_three_ds(&[
            write_material(&fixture),
            write_mesh_object(
                "Tri",
                &TRIANGLE_POSITIONS,
                &write_faces(&[0, 1, 2], &[write_face_group("Skin", &[0])]),
                None,
                None,
            ),
        ]);
        let document = parse3ds(&bytes, None, None);
        let Scene3DDocumentMaterial::Entity(entry) = &document.materials[0] else {
            panic!("entity");
        };
        let material = entry.material.read().unwrap();
        let value = material
            .as_any()
            .downcast_ref::<BlinnPhongMaterial>()
            .unwrap();
        assert_eq!(value.shininess, 0.0);
        assert_eq!(value.diffuse, 0xff6633ff);
    }

    #[test]
    fn repeated_missing_geometry_flushes_one_crumb_with_first_name_and_count_across_objects() {
        let bytes = build_minimal_three_ds(&[
            write_object_chunk("A", THREE_DS_TRIMESH, &write_vertices(&TRIANGLE_POSITIONS)),
            write_object_chunk("B", THREE_DS_TRIMESH, &write_vertices(&TRIANGLE_POSITIONS)),
        ]);
        let mut diagnostics = Vec::new();
        parse3ds(&bytes, Some(&mut diagnostics), None);
        assert_eq!(diagnostics.len(), 1);
        let crumb = &diagnostics[0];
        assert_eq!(crumb.kind, "3ds.mesh-missing-geometry");
        assert_eq!(crumb.origin, "parse3ds");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
        let detail = crumb.detail.as_ref().unwrap();
        assert_eq!(
            detail.get("count"),
            Some(&ImportDiagnosticDetailValue::Number(2.0))
        );
        assert_eq!(
            detail.get("firstName"),
            Some(&ImportDiagnosticDetailValue::String("A".to_string()))
        );
        assert_eq!(
            detail.get("missing"),
            Some(&ImportDiagnosticDetailValue::String("faces".to_string()))
        );
        parse3ds(&bytes, None, None);
    }

    #[test]
    fn missing_material_empty_mesh_and_bad_face_are_distinct_aggregate_drop_sites() {
        let bytes = build_minimal_three_ds(&[
            write_mesh_object(
                "Missing",
                &TRIANGLE_POSITIONS,
                &write_faces(&[0, 1, 2], &[write_face_group("Unknown", &[0])]),
                None,
                None,
            ),
            write_mesh_object("Empty", &[], &write_faces(&[], &[]), None, None),
            write_mesh_object(
                "BadFace",
                &TRIANGLE_POSITIONS,
                &write_faces(&[0, 1, 7], &[]),
                None,
                None,
            ),
        ]);
        let mut diagnostics = Vec::new();
        let document = parse3ds(&bytes, Some(&mut diagnostics), None);
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.meshes[0].materials, [-1]);
        let bad_face = diagnostic(&diagnostics, "3ds.face-index-out-of-range")
            .detail
            .as_ref()
            .unwrap();
        assert_eq!(
            bad_face.get("firstDroppedFaces"),
            Some(&ImportDiagnosticDetailValue::Number(1.0))
        );
        assert_eq!(
            bad_face.get("firstVertexCount"),
            Some(&ImportDiagnosticDetailValue::Number(3.0))
        );
        assert_eq!(
            bad_face.get("count"),
            Some(&ImportDiagnosticDetailValue::Number(1.0))
        );
        for kind in [
            "3ds.material-missing",
            "3ds.mesh-empty",
            "3ds.face-index-out-of-range",
        ] {
            let crumb = diagnostic(&diagnostics, kind);
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "parse3ds");
        }
    }

    #[test]
    fn local_translated_rotated_scaled_and_mirrored_placements_reproduce_original_world_positions()
    {
        for local in [
            [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 4.0, 5.0, 6.0],
            [0.0, 1.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 4.0, 5.0, 6.0],
            [2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 4.0, 4.0, 5.0, 6.0],
            [-1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 4.0, 5.0, 6.0],
        ] {
            let bytes = build_minimal_three_ds(&[write_mesh_object(
                "Placed",
                &TRIANGLE_POSITIONS,
                &write_faces(&[0, 1, 2], &[]),
                None,
                Some(&local),
            )]);
            let document = parse3ds(&bytes, None, None);
            let geometry = document.meshes[0].geometry.read().unwrap();
            let mut placement = create_matrix4();
            compose_matrix4_from_transform3d(&mut placement, &document.nodes[0].transform);
            let expected: Vec<_> = TRIANGLE_POSITIONS
                .chunks_exact(3)
                .map(|p| [p[0], p[2], -p[1]])
                .collect();
            for vertex in 0..geometry.vertices.len() / 12 {
                let base = vertex * 12;
                let point = create_vector3(
                    geometry.vertices[base],
                    geometry.vertices[base + 1],
                    geometry.vertices[base + 2],
                );
                let mut world = create_vector3(0.0, 0.0, 0.0);
                matrix4_transform_point(&mut world, &placement, &point);
                assert!(expected.iter().any(|p| (world.x - p[0]).abs() < 0.0001
                    && (world.y - p[1]).abs() < 0.0001
                    && (world.z - p[2]).abs() < 0.0001));
            }
        }
    }

    #[test]
    fn source_placement_cases_preserve_each_vertex_and_pivot_names_only_affect_their_own_objects() {
        let worlds = [
            [10.0, 20.0, 30.0, 11.0, 20.0, 30.0, 10.0, 21.0, 30.0],
            [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, -7.0, 8.0, -9.0],
            [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 18.0],
        ];
        let matrices = [
            [
                1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 10.0, 20.0, 30.0,
            ],
            [0.0, 1.0, 0.0, -1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 5.0, -5.0, 2.0],
            [2.0, 0.0, 0.0, 0.0, 3.0, 0.0, 0.0, 0.0, 4.0, 1.0, 1.0, 1.0],
        ];
        for (world, local) in worlds.iter().zip(matrices) {
            let bytes = build_minimal_three_ds(&[write_mesh_object(
                "Placed",
                world,
                &write_faces(&[0, 1, 2], &[]),
                None,
                Some(&local),
            )]);
            let document = parse3ds(&bytes, None, None);
            let geometry = document.meshes[0].geometry.read().unwrap();
            let mut placement = create_matrix4();
            compose_matrix4_from_transform3d(&mut placement, &document.nodes[0].transform);
            for vertex in 0..3 {
                let base = vertex * 12;
                let point = create_vector3(
                    geometry.vertices[base],
                    geometry.vertices[base + 1],
                    geometry.vertices[base + 2],
                );
                let mut placed = create_vector3(0.0, 0.0, 0.0);
                matrix4_transform_point(&mut placed, &placement, &point);
                close(placed.x, world[vertex * 3]);
                close(placed.y, world[vertex * 3 + 2]);
                close(placed.z, -world[vertex * 3 + 1]);
            }
        }
        for pivot in [
            None,
            Some(("Real", [2.0, 3.0, 4.0])),
            Some(("Ghost", [5.0; 3])),
        ] {
            let mesh = write_mesh_object(
                "Real",
                &worlds[0],
                &write_faces(&[0, 1, 2], &[]),
                None,
                Some(&matrices[0]),
            );
            let mut payload = write_chunk(THREE_DS_EDITOR, &mesh).to_vec();
            if let Some((name, value)) = pivot {
                payload.extend_from_slice(&pivot_chunk(name, value));
            }
            let document = parse3ds(&write_chunk(THREE_DS_MAIN, &payload), None, None);
            let geometry = document.meshes[0].geometry.read().unwrap();
            assert_eq!(
                &geometry.vertices[..3],
                if pivot.is_some_and(|(name, _)| name == "Real") {
                    &[-2.0, -4.0, 3.0]
                } else {
                    &[0.0, 0.0, 0.0]
                }
            );
        }
        let bytes = build_minimal_three_ds(&[write_mesh_object(
            "Plain",
            &worlds[0],
            &write_faces(&[0, 1, 2], &[]),
            None,
            None,
        )]);
        let document = parse3ds(&bytes, None, None);
        assert_eq!(document.nodes[0].transform.position.x, 0.0);
        assert_eq!(document.nodes[0].transform.scale.x, 1.0);
        assert_eq!(
            &document.meshes[0].geometry.read().unwrap().vertices[..3],
            &[10.0, 30.0, -20.0]
        );
    }

    #[test]
    fn pivots_move_local_origins_without_moving_world_geometry_and_singular_matrices_keep_identity()
    {
        let mesh = write_mesh_object(
            "Pivot",
            &TRIANGLE_POSITIONS,
            &write_faces(&[0, 1, 2], &[]),
            None,
            Some(&IDENTITY_LOCAL),
        );
        let editor = write_chunk(THREE_DS_EDITOR, &mesh);
        let mut bytes = editor.to_vec();
        bytes.extend_from_slice(&pivot_chunk("Pivot", [2.0, 3.0, 4.0]));
        let document = parse3ds(&write_chunk(THREE_DS_MAIN, &bytes), None, None);
        assert_eq!(
            (
                document.nodes[0].transform.position.x,
                document.nodes[0].transform.position.y,
                document.nodes[0].transform.position.z
            ),
            (2.0, 4.0, -3.0)
        );
        assert_eq!(
            &document.meshes[0].geometry.read().unwrap().vertices[..3],
            &[-2.0, -4.0, 3.0]
        );
        let bytes = build_minimal_three_ds(&[write_mesh_object(
            "Singular",
            &TRIANGLE_POSITIONS,
            &write_faces(&[0, 1, 2], &[]),
            None,
            Some(&[0.0; 12]),
        )]);
        let mut diagnostics = Vec::new();
        let document = parse3ds(&bytes, Some(&mut diagnostics), None);
        diagnostic(&diagnostics, "3ds.local-matrix-singular");
        assert_eq!(
            (
                document.nodes[0].transform.position.x,
                document.nodes[0].transform.position.y,
                document.nodes[0].transform.position.z
            ),
            (0.0, 0.0, 0.0)
        );
        assert_eq!(
            &document.meshes[0].geometry.read().unwrap().vertices[..3],
            &[0.0, 0.0, 0.0]
        );
    }
}
