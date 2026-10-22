use flight_entity::Ref;
use flight_geometry::{create_vector2, create_vector3};
use flight_image::ImageResourceReference;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_materials::{
    BLINN_PHONG_MATERIAL_KIND, BlinnPhongMaterial, Material, Material3D, MaterialAlphaMode,
    STANDARD_PBR_MATERIAL_KIND, StandardPbrMaterial,
};
use flight_meshgeometry::{
    MeshGeometry, PrimitiveTopology, get_mesh_geometry_index_count, get_mesh_geometry_vertex_count,
    get_mesh_geometry_vertex_normal, get_mesh_geometry_vertex_position,
    get_mesh_geometry_vertex_uv0,
};
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::{Node3DRef, Scene3D, as_node3d_ref};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMaterial};
use flight_scene3d_formats::*;
use flight_texture::{Texture, TextureColorSpace, TextureUvTransform, get_texture_source};
use std::sync::{Arc, RwLock};

const TRIANGLE: &str = "v 0 0 0\nv 1 0 0\nv 0 1 0\n";
const FOLD: &str = "v 0 0 0\nv 1 0 0\nv 0 1 0\nv 1 1 1\n";

fn detail_number(diagnostic: &ImportDiagnostic, key: &str) -> f32 {
    let ImportDiagnosticDetailValue::Number(value) = diagnostic.detail.as_ref().unwrap()[key]
    else {
        panic!("numeric detail {key}");
    };
    return value;
}

fn detail_text<'a>(diagnostic: &'a ImportDiagnostic, key: &str) -> &'a str {
    let ImportDiagnosticDetailValue::String(value) = &diagnostic.detail.as_ref().unwrap()[key]
    else {
        panic!("text detail {key}");
    };
    return value;
}

fn material_entity(document: &Scene3DDocument, index: usize) -> Ref<dyn Material3D> {
    let Scene3DDocumentMaterial::Entity(value) = &document.materials[index] else {
        panic!("material entity");
    };
    return value.material.clone();
}

fn material_kind(document: &Scene3DDocument, index: usize) -> String {
    return match &document.materials[index] {
        Scene3DDocumentMaterial::Entity(value) => value
            .material
            .read()
            .unwrap()
            .material_fields()
            .kind
            .clone(),
        Scene3DDocumentMaterial::Fields(value) => value.kind.clone(),
    };
}

fn one_crumb<'a>(diagnostics: &'a [ImportDiagnostic], kind: &str) -> &'a ImportDiagnostic {
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].kind, kind);
    return &diagnostics[0];
}

fn scene_geometry(scene: &Scene3D, index: usize) -> Ref<MeshGeometry> {
    let meshes = scene_meshes(scene);
    let geometry = meshes[index]
        .read()
        .unwrap()
        .as_mesh()
        .unwrap()
        .geometry
        .clone();
    return geometry;
}

fn scene_meshes(scene: &Scene3D) -> Vec<Node3DRef> {
    return {
        let mut output = Vec::new();
        get_node_children(&mut output, &(scene.root.clone() as NodeRef));
        output
    }
    .iter()
    .map(|node| {
        let node = as_node3d_ref(node).unwrap();
        assert!(node.read().unwrap().as_mesh().is_some());
        return node;
    })
    .collect();
}

fn texture_uri(document: &Scene3DDocument, texture: &Ref<Texture>) -> String {
    let ImageResourceReference::External(value) =
        get_test_texture_resource(&document.resources, texture)
    else {
        panic!("external image");
    };
    return value.reference.read().unwrap().uri.clone();
}

mod create_scene3d_from_obj {
    use super::*;

    #[test]
    fn assembles_live_geometry_with_default_or_explicitly_empty_material_families_and_has_no_animation()
     {
        let source = "v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl M\nf 1 2 3\n";
        let library = parse_obj_material_library("newmtl M\nKd 1 0 0\n", None);
        for options in [
            None,
            Some(ObjImportOptions {
                material_handlers: Some(Vec::new()),
            }),
        ] {
            let mut diagnostics = Vec::new();
            let scene = create_scene3d_from_obj(
                source,
                Some(&library),
                Some(&mut diagnostics),
                options.as_ref(),
            );
            assert_eq!(
                {
                    let mut output = Vec::new();
                    get_node_children(&mut output, &(scene.root as NodeRef));
                    output
                }
                .len(),
                1
            );
            assert!(scene.animations.is_empty());
            assert!(diagnostics.is_empty());
        }
    }
    #[test]
    fn triangulates_the_source_triangle_shared_faces_quad_and_pentagon_without_transform_wrappers()
    {
        for (source, vertices, indices) in [
            (format!("{TRIANGLE}f 1 2 3\n"), 3, 3),
            (
                "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3\nf 1 3 4".to_string(),
                4,
                6,
            ),
            (
                "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4".to_string(),
                4,
                6,
            ),
            (
                "v 0 0 0\nv 1 0 0\nv 1.5 0.5 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4 5".to_string(),
                5,
                9,
            ),
            (format!("{TRIANGLE}f 1 2 3\nf 3 2 1\n"), 3, 6),
            (format!("{TRIANGLE}f -3 -2 -1\n"), 3, 3),
        ] {
            let mut diagnostics = Vec::new();
            let scene = create_scene3d_from_obj(&source, None, Some(&mut diagnostics), None);
            assert_eq!(scene_meshes(&scene).len(), 1);
            assert!(scene.animations.is_empty());
            assert!(diagnostics.is_empty());
            let geometry = scene_geometry(&scene, 0);
            let geometry = geometry.read().unwrap();
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), vertices);
            assert_eq!(get_mesh_geometry_index_count(&geometry), indices);
            if source.contains("f -3 -2 -1") {
                let mut position = create_vector3(0.0, 0.0, 0.0);
                assert!(get_mesh_geometry_vertex_position(
                    &mut position,
                    &geometry,
                    2
                ));
                assert_eq!([position.x, position.y, position.z], [0.0, 1.0, 0.0]);
            }
        }
        let scene = create_scene3d_from_obj(&format!("{TRIANGLE}f 1 2 3"), None, None, None);
        let geometry = scene_geometry(&scene, 0);
        let geometry = geometry.read().unwrap();
        let mut position = create_vector3(0.0, 0.0, 0.0);
        for (index, expected) in [
            (0, [0.0, 0.0, 0.0]),
            (1, [1.0, 0.0, 0.0]),
            (2, [0.0, 1.0, 0.0]),
        ] {
            assert!(get_mesh_geometry_vertex_position(
                &mut position,
                &geometry,
                index
            ));
            assert_eq!([position.x, position.y, position.z], expected);
        }
    }

    #[test]
    fn reads_independent_normal_uv_relative_and_double_slash_tuples_and_splits_different_authored_normals()
     {
        let scene = create_scene3d_from_obj(
            &format!("{TRIANGLE}vn 0 0 1\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1/1 2/2/1 3/3/1"),
            None,
            None,
            None,
        );
        let geometry = scene_geometry(&scene, 0);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        let mut normal = create_vector3(0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_normal(&mut normal, &geometry, 0));
        assert_eq!([normal.x, normal.y, normal.z], [0.0, 0.0, 1.0]);
        let mut uv = create_vector2(0.0, 0.0);
        for (index, expected) in [(0, [0.0, 1.0]), (1, [1.0, 1.0])] {
            assert!(get_mesh_geometry_vertex_uv0(&mut uv, &geometry, index));
            assert_eq!([uv.x, uv.y], expected);
        }
        let scene = create_scene3d_from_obj(
            &format!("{TRIANGLE}vn 0 0 -1\nf 1//1 2//1 3//1"),
            None,
            None,
            None,
        );
        let geometry = scene_geometry(&scene, 0);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        assert!(get_mesh_geometry_vertex_normal(&mut normal, &geometry, 0));
        assert_eq!([normal.x, normal.y, normal.z], [0.0, 0.0, -1.0]);
        let scene = create_scene3d_from_obj(
            &format!("{TRIANGLE}vt 0.5 0.5\nf 1/1 2/1 3/1"),
            None,
            None,
            None,
        );
        let geometry = scene_geometry(&scene, 0);
        assert!(get_mesh_geometry_vertex_uv0(
            &mut uv,
            &geometry.read().unwrap(),
            0
        ));
        assert_eq!([uv.x, uv.y], [0.5, 0.5]);
        let scene = create_scene3d_from_obj(
            &format!("{TRIANGLE}vn 0 0 1\nvn 0 0 -1\nf 1//1 2//1 3//1\nf 1//2 2//2 3//2"),
            None,
            None,
            None,
        );
        assert_eq!(
            get_mesh_geometry_vertex_count(&scene_geometry(&scene, 0).read().unwrap()),
            6
        );
    }

    #[test]
    fn keeps_named_and_unnamed_group_boundaries_bare_meshes_and_records_only_the_bare_object_recovery()
     {
        for directive in ["g", "o"] {
            let source =
                format!("{TRIANGLE}{directive} Group A\nf 1 2 3\n{directive} Group B\nf 1 2 3\n");
            let scene = create_scene3d_from_obj(&source, None, None, None);
            let meshes = scene_meshes(&scene);
            assert_eq!(meshes.len(), 2);
            assert_eq!(
                meshes[0].read().unwrap().node3d_fields().name.as_deref(),
                Some("Group A")
            );
            assert_eq!(
                meshes[1].read().unwrap().node3d_fields().name.as_deref(),
                Some("Group B")
            );
        }
        for (directive, expected) in [("g", 0), ("o", 1)] {
            let source = format!("{TRIANGLE}{directive} Cube\nf 1 2 3\n{directive}\nf 1 2 3\n");
            let mut diagnostics = Vec::new();
            let scene = create_scene3d_from_obj(&source, None, Some(&mut diagnostics), None);
            let meshes = scene_meshes(&scene);
            assert_eq!(meshes.len(), 2);
            assert_eq!(
                meshes[0].read().unwrap().node3d_fields().name.as_deref(),
                Some("Cube")
            );
            assert!(meshes[1].read().unwrap().node3d_fields().name.is_none());
            assert_eq!(diagnostics.len(), expected);
            if expected == 1 {
                let crumb = one_crumb(&diagnostics, "obj.object-name-missing");
                assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
                assert_eq!(crumb.origin, "parseObj");
                assert_eq!(detail_number(crumb, "firstLine"), 6.0);
                assert_eq!(detail_number(crumb, "count"), 1.0);
            }
        }
        for source in ["", "# just a comment\n"] {
            let scene = create_scene3d_from_obj(source, None, None, None);
            assert!(scene_meshes(&scene).is_empty());
            assert!(scene.animations.is_empty());
        }
    }

    #[test]
    fn preserves_ordered_material_subsets_resets_bare_usemtl_and_reuses_the_same_material_across_groups()
     {
        let library = parse_obj_material_library("newmtl Red\nKd 1 0 0\n", None);
        let source = format!("{TRIANGLE}g Body\nusemtl Red\nf 1 2 3\nusemtl Blue\nf 1 2 3");
        let scene = create_scene3d_from_obj(&source, None, None, None);
        let meshes = scene_meshes(&scene);
        assert_eq!(meshes.len(), 1);
        let mesh = meshes[0].read().unwrap();
        assert_eq!(mesh.node3d_fields().name.as_deref(), Some("Body"));
        let mesh = mesh.as_mesh().unwrap();
        assert_eq!(mesh.materials.read().unwrap().len(), 2);
        assert!(mesh.materials.read().unwrap().iter().all(Option::is_none));
        let geometry = mesh.geometry.read().unwrap();
        assert_eq!(geometry.subsets.len(), 2);
        for (subset, offset) in geometry.subsets.iter().zip([0, 3]) {
            assert_eq!(subset.index_offset, offset);
            assert_eq!(subset.index_count, 3);
        }
        assert_eq!(get_mesh_geometry_index_count(&geometry), 6);
        let mut diagnostics = Vec::new();
        let document = parse_obj(
            &format!("{TRIANGLE}usemtl Red\nf 1 2 3\nusemtl\nf 1 2 3"),
            Some(&library),
            Some(&mut diagnostics),
            None,
        );
        assert!(diagnostics.is_empty());
        assert_eq!(document.meshes[0].geometry.read().unwrap().subsets.len(), 2);
        assert_eq!(document.meshes[0].materials, [0, -1]);
        assert_eq!(material_kind(&document, 0), BLINN_PHONG_MATERIAL_KIND);
        for directive in ["g", "o"] {
            let source =
                format!("{TRIANGLE}usemtl Red\n{directive} A\nf 1 2 3\n{directive} B\nf 1 2 3");
            let scene = create_scene3d_from_obj(&source, Some(&library), None, None);
            let meshes = scene_meshes(&scene);
            assert_eq!(meshes.len(), 2);
            let first = meshes[0]
                .read()
                .unwrap()
                .as_mesh()
                .unwrap()
                .materials
                .read()
                .unwrap()[0]
                .clone()
                .unwrap();
            let second = meshes[1]
                .read()
                .unwrap()
                .as_mesh()
                .unwrap()
                .materials
                .read()
                .unwrap()[0]
                .clone()
                .unwrap();
            assert!(Arc::ptr_eq(&first, &second));
            let material = second.read().unwrap();
            let material = material
                .as_any()
                .downcast_ref::<BlinnPhongMaterial>()
                .unwrap();
            assert_eq!(material.diffuse, 0xff0000ff);
            assert_eq!(material.material_fields().name.as_deref(), Some("Red"));
        }
    }

    #[test]
    fn reports_every_malformed_and_bare_source_table_row_with_exact_diagnostic_details() {
        for (source, kind, reason) in [
            ("v 0 0\n", "obj.vertex-malformed", "too-few-components"),
            ("vn 0 0\n", "obj.normal-malformed", "too-few-components"),
            ("vn a b c\n", "obj.normal-malformed", "non-numeric"),
            ("vt 0\n", "obj.uv-malformed", "too-few-components"),
            ("vt a b\n", "obj.uv-malformed", "non-numeric"),
            ("v\n", "obj.vertex-malformed", "too-few-components"),
            ("vn\n", "obj.normal-malformed", "too-few-components"),
            ("vt\n", "obj.uv-malformed", "too-few-components"),
            ("v abc def ghi\n", "obj.vertex-malformed", "non-numeric"),
        ] {
            let mut diagnostics = Vec::new();
            let scene = create_scene3d_from_obj(source, None, Some(&mut diagnostics), None);
            assert!(scene_meshes(&scene).is_empty());
            let crumb = one_crumb(&diagnostics, kind);
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "parseObj");
            assert_eq!(detail_number(crumb, "firstLine"), 1.0);
            assert_eq!(detail_number(crumb, "count"), 1.0);
            assert_eq!(detail_text(crumb, "reason"), reason);
        }
        for (source, line) in [("f\n", 1.0), ("v 0 0 0\nv 1 0 0\nf 1 2\n", 3.0)] {
            let mut diagnostics = Vec::new();
            create_scene3d_from_obj(source, None, Some(&mut diagnostics), None);
            let crumb = one_crumb(&diagnostics, "obj.face-too-few-vertices");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "parseObj");
            assert_eq!(detail_number(crumb, "firstLine"), line);
            assert_eq!(detail_number(crumb, "count"), 1.0);
        }
    }

    #[test]
    fn distinguishes_invalid_position_tokens_out_of_range_positions_and_recoverable_uv_or_normal_tokens()
     {
        for token in ["0", "x", "-0", "Infinity"] {
            let mut diagnostics = Vec::new();
            create_scene3d_from_obj(
                &format!("v 0 0 0\nf {token} 1 2\n"),
                None,
                Some(&mut diagnostics),
                None,
            );
            let crumb = one_crumb(&diagnostics, "obj.face-vertex-invalid");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "parseObj");
            assert_eq!(detail_number(crumb, "firstLine"), 2.0);
            assert_eq!(detail_number(crumb, "count"), 1.0);
            assert_eq!(detail_text(crumb, "firstToken"), token);
        }
        let mut diagnostics = Vec::new();
        create_scene3d_from_obj("v 0 0 0\nf 1 2 3\n", None, Some(&mut diagnostics), None);
        let crumb = one_crumb(&diagnostics, "obj.position-index-out-of-range");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(crumb.origin, "parseObj");
        assert_eq!(detail_number(crumb, "firstLine"), 2.0);
        assert_eq!(detail_number(crumb, "firstIndex"), 2.0);
        assert_eq!(detail_number(crumb, "count"), 1.0);
        for (attribute, prefix, kind) in [
            ("vt 0 0", "/", "obj.uv-index-invalid"),
            ("vn 0 0 1", "//", "obj.normal-index-invalid"),
        ] {
            for token in ["9", "x", "0"] {
                let mut diagnostics = Vec::new();
                let source =
                    format!("{TRIANGLE}{attribute}\nf 1{prefix}1 2{prefix}{token} 3{prefix}1\n");
                let document = parse_obj(&source, None, Some(&mut diagnostics), None);
                assert_eq!(
                    get_mesh_geometry_index_count(&document.meshes[0].geometry.read().unwrap()),
                    3
                );
                let crumb = one_crumb(&diagnostics, kind);
                assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
                assert_eq!(crumb.origin, "parseObj");
                assert_eq!(detail_number(crumb, "firstLine"), 5.0);
                assert_eq!(detail_number(crumb, "count"), 1.0);
                assert_eq!(detail_text(crumb, "firstToken"), token);
            }
        }
    }

    #[test]
    fn aggregates_repeated_drops_by_reason_and_optional_index_recoveries_in_first_encounter_order()
    {
        for (source, kind, first_line, reason, first_token) in [
            (
                "v a b c\nv 0 0 0\nv d e f\nv g h i\n".to_string(),
                "obj.vertex-malformed",
                1.0,
                Some("non-numeric"),
                None,
            ),
            (
                format!("{TRIANGLE}vt 0 0\nf 1/9 2/8 3/7\n"),
                "obj.uv-index-invalid",
                5.0,
                None,
                Some("9"),
            ),
        ] {
            let mut diagnostics = Vec::new();
            create_scene3d_from_obj(&source, None, Some(&mut diagnostics), None);
            let crumb = one_crumb(&diagnostics, kind);
            assert_eq!(crumb.origin, "parseObj");
            assert_eq!(
                crumb.severity,
                if reason.is_some() {
                    ImportDiagnosticSeverity::Drop
                } else {
                    ImportDiagnosticSeverity::Recover
                }
            );
            assert_eq!(detail_number(crumb, "count"), 3.0);
            assert_eq!(detail_number(crumb, "firstLine"), first_line);
            if let Some(reason) = reason {
                assert_eq!(detail_text(crumb, "reason"), reason);
            }
            if let Some(token) = first_token {
                assert_eq!(detail_text(crumb, "firstToken"), token);
            }
        }
        for source in [
            format!("{TRIANGLE}s 1\nf 1 2 3\nl 1 2\np 3\n"),
            format!("{TRIANGLE}s 1\nf 1 2 3"),
            format!("{TRIANGLE}f 1 2 3"),
        ] {
            let mut diagnostics = Vec::new();
            create_scene3d_from_obj(&source, None, Some(&mut diagnostics), None);
            assert!(diagnostics.is_empty());
        }
    }
}

mod parse_obj {
    use super::*;

    #[test]
    fn resolves_both_models_through_the_default_family_and_honors_empty_or_subtracted_families() {
        let source =
            "v 0 0 0\nv 1 0 0\nv 0 1 0\ng A\nusemtl Classic\nf 1 2 3\ng B\nusemtl Metal\nf 1 2 3\n";
        let library = parse_obj_material_library(
            "newmtl Classic\nKd 1 0 0\nnewmtl Metal\nPr 0.4\nPm 1\n",
            None,
        );
        for (handlers, expected) in [
            (
                None,
                vec![BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND],
            ),
            (
                Some(OBJ_ALL_MATERIAL_HANDLERS.clone()),
                vec![BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND],
            ),
            (Some(Vec::new()), vec![]),
            (
                Some(OBJ_BLINN_PHONG_MATERIAL_FAMILY.clone()),
                vec![BLINN_PHONG_MATERIAL_KIND],
            ),
            (
                Some(OBJ_STANDARD_PBR_MATERIAL_FAMILY.clone()),
                vec![STANDARD_PBR_MATERIAL_KIND],
            ),
        ] {
            let options = ObjImportOptions {
                material_handlers: handlers,
            };
            let mut diagnostics = Vec::new();
            let document = parse_obj(
                source,
                Some(&library),
                Some(&mut diagnostics),
                Some(&options),
            );
            assert_eq!(document.meshes.len(), 2);
            assert!(diagnostics.is_empty());
            let kinds = document
                .materials
                .iter()
                .map(|material| match material {
                    Scene3DDocumentMaterial::Entity(value) => value
                        .material
                        .read()
                        .unwrap()
                        .material_fields()
                        .kind
                        .clone(),
                    Scene3DDocumentMaterial::Fields(value) => value.kind.clone(),
                })
                .collect::<Vec<_>>();
            assert_eq!(kinds, expected);
            for (index, mesh) in document.meshes.iter().enumerate() {
                assert_eq!(mesh.materials.len(), 1);
                let model = [BLINN_PHONG_MATERIAL_KIND, STANDARD_PBR_MATERIAL_KIND][index];
                let expected_index = expected
                    .iter()
                    .position(|kind| *kind == model)
                    .map(|value| value as i32)
                    .unwrap_or(-1);
                assert_eq!(mesh.materials, [expected_index]);
            }
        }
    }
    #[test]
    fn generates_area_weighted_normals_only_when_the_global_normal_table_is_empty_at_each_group_flush()
     {
        let document = parse_obj(&format!("{TRIANGLE}f 1 2 3\n"), None, None, None);
        let geometry = document.meshes[0].geometry.read().unwrap();
        let mut normal = create_vector3(0.0, 0.0, 0.0);
        for vertex in 0..get_mesh_geometry_vertex_count(&geometry) {
            assert!(get_mesh_geometry_vertex_normal(
                &mut normal,
                &geometry,
                vertex
            ));
            assert_eq!([normal.x, normal.y, normal.z], [0.0, 0.0, 1.0]);
        }
        let document = parse_obj(
            &format!("{TRIANGLE}vn 0 0 -1\nf 1//1 2//1 3//1"),
            None,
            None,
            None,
        );
        assert!(get_mesh_geometry_vertex_normal(
            &mut normal,
            &document.meshes[0].geometry.read().unwrap(),
            0
        ));
        assert_eq!(normal.z, -1.0);
        let document = parse_obj(
            "g a\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\ng b\nv 0 0 5\nv 1 0 5\nv 0 1 5\nf 4 5 6",
            None,
            None,
            None,
        );
        assert_eq!(document.meshes.len(), 2);
        for mesh in &document.meshes {
            assert!(get_mesh_geometry_vertex_normal(
                &mut normal,
                &mesh.geometry.read().unwrap(),
                0
            ));
            assert_eq!(normal.z, 1.0);
        }
        let document = parse_obj(&format!("{TRIANGLE}f 1 2 3\nvn 0 0 -1\n"), None, None, None);
        assert!(get_mesh_geometry_vertex_normal(
            &mut normal,
            &document.meshes[0].geometry.read().unwrap(),
            0
        ));
        assert_eq!([normal.x, normal.y, normal.z], [0.0; 3]);
    }

    #[test]
    fn derives_a_usable_tangent_frame_from_authored_uvs_and_keeps_the_whole_tangent_record_zero_without_uvs()
     {
        for (source, has_uv) in [
            (
                format!("{TRIANGLE}vt 0 0\nvt 0.9 0.2\nvt 0.2 0.9\nf 1/1 2/2 3/3"),
                true,
            ),
            (format!("{TRIANGLE}f 1 2 3"), false),
        ] {
            let document = parse_obj(&source, None, None, None);
            let geometry = document.meshes[0].geometry.read().unwrap();
            assert!(get_mesh_geometry_vertex_count(&geometry) > 0);
            for vertex in geometry.vertices.chunks_exact(CANONICAL_FLOATS_PER_VERTEX) {
                let length =
                    (vertex[6] * vertex[6] + vertex[7] * vertex[7] + vertex[8] * vertex[8]).sqrt();
                if has_uv {
                    assert!((length - 1.0).abs() < 0.5e-4);
                    assert_eq!(vertex[9].abs(), 1.0);
                } else {
                    assert_eq!(length, 0.0);
                    assert_eq!(vertex[9], 0.0);
                }
            }
        }
    }

    #[test]
    fn models_every_source_line_and_point_case_and_leaves_non_position_channels_and_materials_unbound()
     {
        for (source, topology, indices, vertices) in [
            (
                "v 0 0 0\nv 1 0 0\nv 2 0 0\nl 1 2 3",
                PrimitiveTopology::LineList,
                4,
                3,
            ),
            (
                "v 0 0 0\nv 1 0 0\np 1 2",
                PrimitiveTopology::PointList,
                2,
                2,
            ),
            (
                "v 0 0 0\nv 1 0 0\ng Wire\nl 1 2",
                PrimitiveTopology::LineList,
                2,
                2,
            ),
            (
                "v 0 0 0\nv 1 0 0\nvt 0 0\nvt 1 0\nl 1/1 2/2",
                PrimitiveTopology::LineList,
                2,
                2,
            ),
            (
                "v 0 0 0\nv 1 0 0\nl -2 -1",
                PrimitiveTopology::LineList,
                2,
                2,
            ),
        ] {
            let document = parse_obj(source, None, None, None);
            assert_eq!(document.meshes.len(), 1);
            assert_eq!(document.scenes[0].root_nodes, [0]);
            assert_eq!(document.meshes[0].materials, [-1]);
            let geometry = document.meshes[0].geometry.read().unwrap();
            assert_eq!(geometry.topology, topology);
            assert_eq!(get_mesh_geometry_index_count(&geometry), indices);
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), vertices);
            assert_eq!(geometry.vertices[0], 0.0);
            for vertex in geometry.vertices.chunks_exact(CANONICAL_FLOATS_PER_VERTEX) {
                assert_eq!(&vertex[3..], &[0.0; 9]);
            }
        }
        assert!(
            parse_obj("v 0 0 0\nl 1", None, None, None)
                .meshes
                .is_empty()
        );
        let mut diagnostics = Vec::new();
        assert!(
            parse_obj("v 0 0 0\nl 1 9", None, Some(&mut diagnostics), None)
                .meshes
                .is_empty()
        );
        let crumb = one_crumb(&diagnostics, "obj.element-index-out-of-range");
        assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(crumb.origin, "parseObj");
        assert_eq!(detail_text(crumb, "firstToken"), "9");
        assert_eq!(detail_number(crumb, "firstLine"), 2.0);
        assert_eq!(detail_number(crumb, "count"), 1.0);
    }

    #[test]
    fn splits_and_merges_each_source_smoothing_state_and_ignores_groups_for_authored_normals() {
        for (suffix, expected) in [
            ("s 1\nf 1 2 3\ns 2\nf 2 4 3", 6),
            ("s 1\nf 1 2 3\nf 2 4 3", 4),
            ("s off\nf 1 2 3\nf 2 4 3", 6),
            ("s 0\nf 1 2 3\nf 2 4 3", 6),
            ("f 1 2 3\nf 2 4 3", 4),
        ] {
            let mut diagnostics = Vec::new();
            let document = parse_obj(
                &format!("{FOLD}{suffix}"),
                None,
                Some(&mut diagnostics),
                None,
            );
            assert_eq!(
                get_mesh_geometry_vertex_count(&document.meshes[0].geometry.read().unwrap()),
                expected
            );
            assert!(diagnostics.is_empty());
        }
        let mut normals = Vec::new();
        for suffix in ["s 1\nf 1 2 3\ns 2\nf 2 4 3", "s 1\nf 1 2 3\nf 2 4 3"] {
            let document = parse_obj(&format!("{FOLD}{suffix}"), None, None, None);
            let mut normal = create_vector3(0.0, 0.0, 0.0);
            assert!(get_mesh_geometry_vertex_normal(
                &mut normal,
                &document.meshes[0].geometry.read().unwrap(),
                1
            ));
            normals.push([normal.x, normal.y, normal.z]);
        }
        assert!(
            normals[0]
                .iter()
                .zip(&normals[1])
                .any(|(hard, smooth)| (hard - smooth).abs() > 1e-4)
        );
        let document = parse_obj(
            &format!("{FOLD}vn 0 0 1\ns 1\nf 1//1 2//1 3//1\ns 2\nf 2//1 4//1 3//1"),
            None,
            None,
            None,
        );
        assert_eq!(
            get_mesh_geometry_vertex_count(&document.meshes[0].geometry.read().unwrap()),
            4
        );
    }

    #[test]
    fn maps_mtl_channels_to_live_classic_materials_without_decoding_referenced_images() {
        let library = parse_obj_material_library(
            "newmtl Shiny\nKd 0.8 0.4 0.2\nKs 1 1 1\nNs 64\nd 0.5\nmap_Kd wood.png\nmap_Ks spec.png\nnorm normal.png\n",
            None,
        );
        let scene = create_scene3d_from_obj(
            &format!("{TRIANGLE}usemtl Shiny\nf 1 2 3"),
            Some(&library),
            None,
            None,
        );
        let material = scene_meshes(&scene)[0]
            .read()
            .unwrap()
            .as_mesh()
            .unwrap()
            .materials
            .read()
            .unwrap()[0]
            .clone()
            .unwrap();
        let material = material.read().unwrap();
        let material = material
            .as_any()
            .downcast_ref::<BlinnPhongMaterial>()
            .unwrap();
        assert_eq!(material.kind, BLINN_PHONG_MATERIAL_KIND);
        assert_eq!(material.name.as_deref(), Some("Shiny"));
        assert_eq!(material.diffuse, 0xcc663380);
        assert_eq!(material.specular, 0xffffffff);
        assert_eq!(material.shininess, 64.0);
        assert_eq!(
            material.material3d_fields().alpha_mode,
            MaterialAlphaMode::Blend
        );
        for (texture, uri, color_space) in [
            (
                material.diffuse_map.as_ref().unwrap(),
                "wood.png",
                TextureColorSpace::Srgb,
            ),
            (
                material.specular_map.as_ref().unwrap(),
                "spec.png",
                TextureColorSpace::Srgb,
            ),
            (
                material.normal_map.as_ref().unwrap(),
                "normal.png",
                TextureColorSpace::Linear,
            ),
        ] {
            let ImageResourceReference::External(value) =
                get_test_texture_resource(&scene.resources, texture)
            else {
                panic!("external resource");
            };
            assert_eq!(value.reference.read().unwrap().uri, uri);
            assert_eq!(
                texture.read().unwrap().texture_fields().color_space,
                color_space
            );
            assert!(get_texture_source(&*texture.read().unwrap()).is_none());
        }
    }

    #[test]
    fn publishes_inline_mesh_references_and_shared_resource_identity_with_distinct_texture_entities()
     {
        let document = parse_obj(&format!("{TRIANGLE}f 1 2 3"), None, None, None);
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(
            get_mesh_geometry_vertex_count(&document.meshes[0].geometry.read().unwrap()),
            3
        );
        assert_eq!(document.nodes[0].mesh, Some(0));
        assert_eq!(document.scenes[0].root_nodes, [0]);
        assert!(document.materials.is_empty());
        assert_eq!(document.meshes[0].materials, [-1]);
        let library = parse_obj_material_library(
            "newmtl first\nmap_Kd shared.png\nnewmtl second\nmap_Kd shared.png\n",
            None,
        );
        let document = parse_obj(
            &format!("{TRIANGLE}usemtl first\ng first\nf 1 2 3\nusemtl second\ng second\nf 1 2 3"),
            Some(&library),
            None,
            None,
        );
        assert_eq!(document.materials.len(), 2);
        assert_eq!(document.meshes[0].materials, [0]);
        assert_eq!(document.meshes[1].materials, [1]);
        assert_eq!(document.resources.len(), 1);
        let first = material_entity(&document, 0);
        let second = material_entity(&document, 1);
        let first = first.read().unwrap();
        let second = second.read().unwrap();
        assert_eq!(first.material_fields().name.as_deref(), Some("first"));
        assert_eq!(second.material_fields().name.as_deref(), Some("second"));
        let first = first
            .as_any()
            .downcast_ref::<BlinnPhongMaterial>()
            .unwrap()
            .diffuse_map
            .as_ref()
            .unwrap();
        let second = second
            .as_any()
            .downcast_ref::<BlinnPhongMaterial>()
            .unwrap()
            .diffuse_map
            .as_ref()
            .unwrap();
        assert!(!Arc::ptr_eq(first, second));
        let ImageResourceReference::External(original) = &document.resources[0] else {
            panic!("external");
        };
        assert_eq!(original.reference.read().unwrap().uri, "shared.png");
        for texture in [first, second] {
            let ImageResourceReference::External(found) =
                get_test_texture_resource(&document.resources, texture)
            else {
                panic!("external");
            };
            assert!(Arc::ptr_eq(&found.reference, &original.reference));
        }
    }

    #[test]
    fn chooses_the_authored_shading_model_and_records_only_the_source_skips_for_unbound_channels() {
        for (mtl, expected_kind) in [
            ("Kd 0.8 0.2 0.1\nKs 1 1 1\nNs 60", BLINN_PHONG_MATERIAL_KIND),
            (
                "Kd 0.8 0.2 0.1\nNs 60\nPr 0.35\nPm 0.9",
                STANDARD_PBR_MATERIAL_KIND,
            ),
            ("Kd 1 1 1\nNs 32\nKe 1 0.5 0", BLINN_PHONG_MATERIAL_KIND),
            ("Kd 1 1 1\nKe 1 0 0\nPr 0.5", STANDARD_PBR_MATERIAL_KIND),
            (
                "Pr 0.5\nmap_Pr rough.png\nmap_Pm metal.png",
                STANDARD_PBR_MATERIAL_KIND,
            ),
            (
                "Ps 0.4\nPc 0.2\nPcr 0.1\naniso 0.3",
                STANDARD_PBR_MATERIAL_KIND,
            ),
            ("bump normal.png", BLINN_PHONG_MATERIAL_KIND),
            (
                "bump height.png\nnorm normal.png",
                BLINN_PHONG_MATERIAL_KIND,
            ),
        ] {
            let library = parse_obj_material_library(&format!("newmtl M\n{mtl}\n"), None);
            let mut diagnostics = Vec::new();
            let document = parse_obj(
                &format!("{TRIANGLE}usemtl M\nf 1 2 3"),
                Some(&library),
                Some(&mut diagnostics),
                None,
            );
            assert_eq!(document.materials.len(), 1);
            assert_eq!(material_kind(&document, 0), expected_kind);
            let material = material_entity(&document, 0);
            let material = material.read().unwrap();
            if let Some(classic) = material.as_any().downcast_ref::<BlinnPhongMaterial>() {
                if mtl.contains("Ns 60") {
                    assert_eq!(classic.shininess, 60.0);
                }
                if mtl == "bump normal.png" {
                    assert!(classic.normal_map.is_none());
                }
                if mtl.contains("norm normal.png") {
                    assert_eq!(
                        texture_uri(&document, classic.normal_map.as_ref().unwrap()),
                        "normal.png"
                    );
                }
            } else {
                let pbr = material
                    .as_any()
                    .downcast_ref::<StandardPbrMaterial>()
                    .unwrap();
                if mtl.contains("Pr 0.35") {
                    assert!((pbr.roughness - 0.35).abs() < 0.5e-6);
                    assert!((pbr.metallic - 0.9).abs() < 0.5e-6);
                    assert!(
                        (pbr.roughness
                            - flight_materials::contract::get_pbr_roughness_from_phong_shininess(
                                60.0
                            ))
                        .abs()
                            > 1e-3
                    );
                }
                if mtl.contains("Ke 1 0 0") {
                    assert_eq!(pbr.emissive, 0xff0000ff);
                }
                if mtl.contains("map_Pr") {
                    assert!(pbr.metallic_roughness_map.is_none());
                }
            }
            let expected = if mtl.contains("Ke 1 0.5") {
                Some(("mtl.emissive-dropped", "resolveObjMaterial"))
            } else if mtl.contains("map_Pr") {
                Some(("mtl.metallic-roughness-map-unpacked", "resolveObjMaterial"))
            } else if mtl.contains("bump") {
                Some(("mtl.bump-height-map-unbound", "objMaterialToBlinnPhong"))
            } else {
                None
            };
            if let Some((kind, origin)) = expected {
                let crumb = one_crumb(&diagnostics, kind);
                assert_eq!(crumb.severity, ImportDiagnosticSeverity::Skip);
                assert_eq!(crumb.origin, origin);
                assert_eq!(detail_text(crumb, "name"), "M");
            } else {
                assert!(diagnostics.is_empty());
            }
        }
    }

    #[test]
    fn binds_opacity_maps_in_both_models_and_retains_scalar_dissolve() {
        for suffix in [
            "Kd 1 1 1\nmap_d mask.png",
            "Pr 0.4\nmap_d mask.png",
            "Kd 1 1 1\nd 0.5\nmap_d mask.png",
        ] {
            let library = parse_obj_material_library(&format!("newmtl M\n{suffix}"), None);
            let document = parse_obj(
                &format!("{TRIANGLE}usemtl M\nf 1 2 3"),
                Some(&library),
                None,
                None,
            );
            let material = material_entity(&document, 0);
            let material = material.read().unwrap();
            assert_eq!(
                material.material3d_fields().alpha_mode,
                MaterialAlphaMode::Blend
            );
            let texture =
                if let Some(classic) = material.as_any().downcast_ref::<BlinnPhongMaterial>() {
                    if suffix.contains("d 0.5") {
                        assert_eq!(classic.diffuse & 0xff, 128);
                    }
                    classic.alpha_map.as_ref().unwrap()
                } else {
                    assert_eq!(material.material_fields().kind, STANDARD_PBR_MATERIAL_KIND);
                    material
                        .as_any()
                        .downcast_ref::<StandardPbrMaterial>()
                        .unwrap()
                        .alpha_map
                        .as_ref()
                        .unwrap()
                };
            assert_eq!(texture_uri(&document, texture), "mask.png");
        }
    }

    #[test]
    fn caches_missing_material_names_even_with_empty_handlers_but_stays_quiet_without_a_library() {
        let library = parse_obj_material_library("newmtl Present\nKd 1 0 0\n", None);
        for handlers in [None, Some(Vec::new())] {
            let options = ObjImportOptions {
                material_handlers: handlers,
            };
            let source = format!("{TRIANGLE}usemtl Absent\ng A\nf 1 2 3\ng B\nf 1 2 3");
            let mut diagnostics = Vec::new();
            let document = parse_obj(
                &source,
                Some(&library),
                Some(&mut diagnostics),
                Some(&options),
            );
            assert!(document.materials.is_empty());
            for mesh in &document.meshes {
                assert_eq!(mesh.materials, [-1]);
            }
            let crumb = one_crumb(&diagnostics, "obj.material-missing");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "resolveObjMaterial");
            assert_eq!(detail_text(crumb, "name"), "Absent");
            diagnostics.clear();
            let scene =
                create_scene3d_from_obj(&source, None, Some(&mut diagnostics), Some(&options));
            assert!(diagnostics.is_empty());
            for mesh in scene_meshes(&scene) {
                assert!(
                    mesh.read()
                        .unwrap()
                        .as_mesh()
                        .unwrap()
                        .materials
                        .read()
                        .unwrap()[0]
                        .is_none()
                );
            }
        }
    }

    #[test]
    fn dispatches_mutually_exclusive_families_in_either_order_and_allows_a_first_matching_override()
    {
        let source = format!("{TRIANGLE}g A\nusemtl Classic\nf 1 2 3\ng B\nusemtl Metal\nf 1 2 3");
        let library = parse_obj_material_library(
            "newmtl Classic\nKd 1 0 0\nnewmtl Metal\nPr 0.4\nPm 1",
            None,
        );
        let from_default = parse_obj(&source, Some(&library), None, None);
        for handlers in [
            OBJ_ALL_MATERIAL_HANDLERS.clone(),
            vec![
                OBJ_STANDARD_PBR_MATERIAL_HANDLER.clone(),
                OBJ_BLINN_PHONG_MATERIAL_HANDLER.clone(),
            ],
        ] {
            let explicit = parse_obj(
                &source,
                Some(&library),
                None,
                Some(&ObjImportOptions {
                    material_handlers: Some(handlers),
                }),
            );
            assert_eq!(explicit.nodes.len(), from_default.nodes.len());
            assert_eq!(
                explicit.scenes[0].root_nodes,
                from_default.scenes[0].root_nodes
            );
            assert_eq!(explicit.materials.len(), from_default.materials.len());
            for index in 0..explicit.meshes.len() {
                assert_eq!(
                    material_kind(&explicit, index),
                    material_kind(&from_default, index)
                );
                assert_eq!(
                    explicit.meshes[index].materials,
                    from_default.meshes[index].materials
                );
                assert_eq!(
                    explicit.meshes[index].geometry.read().unwrap().vertices,
                    from_default.meshes[index].geometry.read().unwrap().vertices
                );
                assert_eq!(explicit.nodes[index].name, from_default.nodes[index].name);
            }
        }
        let override_handler = Arc::new(RwLock::new(ObjMaterialHandler {
            feature: OBJ_MATERIAL_BLINN_PHONG_FEATURE.to_string(),
            matches: Arc::new(|_| true),
            resolve: OBJ_BLINN_PHONG_MATERIAL_HANDLER
                .read()
                .unwrap()
                .resolve
                .clone(),
        }));
        let mut handlers = vec![override_handler];
        handlers.extend(OBJ_ALL_MATERIAL_HANDLERS.iter().cloned());
        let document = parse_obj(
            &source,
            Some(&library),
            None,
            Some(&ObjImportOptions {
                material_handlers: Some(handlers),
            }),
        );
        assert_eq!(document.materials.len(), 2);
        assert_eq!(material_kind(&document, 0), BLINN_PHONG_MATERIAL_KIND);
        assert_eq!(material_kind(&document, 1), BLINN_PHONG_MATERIAL_KIND);
    }
}
