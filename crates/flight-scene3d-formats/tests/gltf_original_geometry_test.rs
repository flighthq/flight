use crate::gltf_original_test_helper::*;
use flight_entity::Unknown;
use flight_geometry::{create_vector2, create_vector3, create_vector4};
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_meshgeometry::{
    IndexBuffer, PrimitiveTopology, get_mesh_geometry_index_count, get_mesh_geometry_vertex_count,
    get_mesh_geometry_vertex_normal, get_mesh_geometry_vertex_position,
    get_mesh_geometry_vertex_tangent, get_mesh_geometry_vertex_uv0,
};
use flight_node::contract::get_node_local_matrix4;
use flight_node::get_node_children;
use flight_scene3d::{Mesh, is_mesh};
use flight_scene3d_formats::contract::*;
use serde_json::json;
use std::sync::{Arc, RwLock};

mod create_scene3d_from_gltf {
    use super::*;

    #[test]
    fn case_070_builds_the_correct_hierarchy_for_a_2_node_parent_child_scene() {
        let scene = original_scene(&original_gltf_fixture("parentChild"), None);
        let roots = original_children(&scene);
        assert_eq!(roots.len(), 1);
        let node: Unknown = Some(Arc::new(roots[0].clone()));
        assert!(!is_mesh(&node));
        let mut children = Vec::new();
        get_node_children(&mut children, &roots[0]);
        assert_eq!(children.len(), 1);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(is_mesh(&node));
    }

    #[test]
    fn case_071_builds_the_node_hierarchy_with_the_imported_mesh_and_transform() {
        let scene = original_scene(&original_gltf_fixture("triangle"), None);
        let children = original_children(&scene);
        assert_eq!(children.len(), 1);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(is_mesh(&node));
        // D1 f32 bound (TS: 0.005)
        assert!(
            (get_node_local_matrix4(&children[0]).m[12] as f64 - 5.0).abs()
                <= 0.005_f64.max(4.0 * f32::EPSILON as f64 * 5.0)
        );
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 3);
    }

    #[test]
    fn case_072_drops_the_primitive_when_the_position_accessor_index_is_out_of_bounds() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["attributes"]["POSITION"] = json!(99);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.primitive-no-position",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstAccessor", ImportDiagnosticDetailValue::Number(99.0))],
        );
        let children = original_children(&scene);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(!is_mesh(&node));
        assert!(
            !diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "gltf.accessor-not-found")
        );
    }

    #[test]
    fn case_073_drops_the_primitive_when_the_position_accessor_bufferview_is_missing() {
        let mut source = original_gltf_fixture("triangle");
        source["bufferViews"] = json!([]);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.primitive-no-position",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
        let children = original_children(&scene);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(!is_mesh(&node));
    }

    #[test]
    fn case_074_returns_a_scene_for_a_document_with_no_nodes() {
        let scene = original_scene(&json!({"asset":{"version":"2.0"}}), None);
        assert!(original_children(&scene).is_empty());
    }

    #[test]
    fn case_075_de_strides_interleaved_position_and_normal_attributes_via_bufferview_bytestride() {
        let bytes: Vec<_> = [
            1.0_f32, 2.0, 3.0, 0.0, 0.0, 1.0, 4.0, 5.0, 6.0, 0.0, 1.0, 0.0,
        ]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"byteOffset":0,"componentType":5126,"count":2,"type":"VEC3"},{"bufferView":0,"byteOffset":12,"componentType":5126,"count":2,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":48,"byteOffset":0,"byteStride":24}]),
            &bytes,
            json!([{"attributes":{"NORMAL":1,"POSITION":0}}]),
        );

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let mut position = create_vector3(0.0, 0.0, 0.0);
        let mut normal = create_vector3(0.0, 0.0, 0.0);
        get_mesh_geometry_vertex_position(&mut position, &geometry, 0);
        get_mesh_geometry_vertex_normal(&mut normal, &geometry, 0);
        assert_eq!([position.x, position.y, position.z], [1.0, 2.0, 3.0]);
        assert_eq!([normal.x, normal.y, normal.z], [0.0, 0.0, 1.0]);
        get_mesh_geometry_vertex_position(&mut position, &geometry, 1);
        get_mesh_geometry_vertex_normal(&mut normal, &geometry, 1);
        assert_eq!([position.x, position.y, position.z], [4.0, 5.0, 6.0]);
        assert_eq!([normal.x, normal.y, normal.z], [0.0, 1.0, 0.0]);
    }

    #[test]
    fn case_076_decodes_normalized_signed_and_unsigned_integer_attributes_to_their_float_ranges() {
        let mut bytes: Vec<_> = [1.0_f32, 2.0, 3.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        bytes.extend([127_u8, 128, 0]);
        bytes.extend(65535_u16.to_le_bytes());
        bytes.extend(0_u16.to_le_bytes());
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"},{"bufferView":1,"componentType":5120,"count":1,"normalized":true,"type":"VEC3"},{"bufferView":2,"componentType":5123,"count":1,"normalized":true,"type":"VEC2"}]),
            json!([{"buffer":0,"byteLength":12,"byteOffset":0},{"buffer":0,"byteLength":3,"byteOffset":12},{"buffer":0,"byteLength":4,"byteOffset":15}]),
            &bytes,
            json!([{"attributes":{"NORMAL":1,"POSITION":0,"TEXCOORD_0":2}}]),
        );

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let mut normal = create_vector3(0.0, 0.0, 0.0);
        let mut uv = create_vector2(0.0, 0.0);
        get_mesh_geometry_vertex_normal(&mut normal, &geometry, 0);
        get_mesh_geometry_vertex_uv0(&mut uv, &geometry, 0);
        assert_eq!([normal.x, normal.y, normal.z], [1.0, -1.0, 0.0]);
        assert_eq!([uv.x, uv.y], [1.0, 0.0]);
    }

    #[test]
    fn case_077_decodes_a_normalized_short_5122_attribute_to_the_1_1_float_range() {
        let mut bytes: Vec<_> = [1.0_f32, 2.0, 3.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        bytes.extend(
            [32767_i16, -32767, 0]
                .iter()
                .flat_map(|value| value.to_le_bytes()),
        );
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"},{"bufferView":1,"componentType":5122,"count":1,"normalized":true,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":12,"byteOffset":0},{"buffer":0,"byteLength":6,"byteOffset":12}]),
            &bytes,
            json!([{"attributes":{"NORMAL":1,"POSITION":0}}]),
        );

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let mut normal = create_vector3(0.0, 0.0, 0.0);
        get_mesh_geometry_vertex_normal(&mut normal, &geometry, 0);
        assert_original_close5(normal.x, 1.0);
        assert_original_close5(normal.y, -1.0);
        assert_original_close5(normal.z, 0.0);
    }

    #[test]
    fn case_078_decodes_a_normalized_ubyte_5121_texcoord_0_to_the_0_1_float_range() {
        let mut bytes: Vec<_> = [1.0_f32, 2.0, 3.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        bytes.extend([255_u8, 128]);
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":1,"type":"VEC3"},{"bufferView":1,"componentType":5121,"count":1,"normalized":true,"type":"VEC2"}]),
            json!([{"buffer":0,"byteLength":12,"byteOffset":0},{"buffer":0,"byteLength":2,"byteOffset":12}]),
            &bytes,
            json!([{"attributes":{"POSITION":0,"TEXCOORD_0":1}}]),
        );

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let mut uv = create_vector2(0.0, 0.0);
        get_mesh_geometry_vertex_uv0(&mut uv, &geometry, 0);
        assert_original_close5(uv.x, 1.0);
        assert_original_close5(uv.y, 128.0 / 255.0);
    }

    #[test]
    fn case_079_drops_the_primitive_when_the_position_accessor_runs_past_its_backing_buffer() {
        let bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":10,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":120,"byteOffset":0}]),
            &bytes,
            json!([{"attributes":{"POSITION":0}}]),
        );
        let mut source = source;
        source["buffers"][0]["byteLength"] = json!(120);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.primitive-no-position",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
        let children = original_children(&scene);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(!is_mesh(&node));
    }

    #[test]
    fn case_080_keeps_a_drawable_finite_mesh_when_an_optional_normal_accessor_fails() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["attributes"]["NORMAL"] = json!(99);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.accessor-not-found",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[],
        );
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        for value in &geometry.vertices {
            assert!(value.is_finite());
        }
        let floats_per_vertex = geometry.layout.read().unwrap().stride as usize / 4;
        for vertex in 0..get_mesh_geometry_vertex_count(&geometry) as usize {
            let base = vertex * floats_per_vertex + 3;
            let length = geometry.vertices[base]
                .hypot(geometry.vertices[base + 1])
                .hypot(geometry.vertices[base + 2]);
            assert_original_close5(length, 1.0);
        }
    }

    #[test]
    fn case_081_calculates_flat_normals_for_a_primitive_with_no_normal_attribute() {
        let source = original_gltf_fixture("triangle");

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let floats_per_vertex = geometry.layout.read().unwrap().stride as usize / 4;
        for vertex in 0..get_mesh_geometry_vertex_count(&geometry) as usize {
            let base = vertex * floats_per_vertex + 3;
            assert_original_close5(geometry.vertices[base], 0.0);
            assert_original_close5(geometry.vertices[base + 1], 0.0);
            assert_original_close5(geometry.vertices[base + 2], 1.0);
        }
    }

    #[test]
    fn case_082_un_welds_shared_vertices_so_each_face_gets_its_own_normal() {
        let mut bytes: Vec<_> = [
            0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0,
        ]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
        bytes.extend(
            [0_u16, 1, 2, 0, 2, 3]
                .iter()
                .flat_map(|value| value.to_le_bytes()),
        );
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":4,"type":"VEC3"},{"bufferView":1,"componentType":5123,"count":6,"type":"SCALAR"}]),
            json!([{"buffer":0,"byteLength":48,"byteOffset":0},{"buffer":0,"byteLength":12,"byteOffset":48}]),
            &bytes,
            json!([{"attributes":{"POSITION":0},"indices":1}]),
        );

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 6);
        let stride = geometry.layout.read().unwrap().stride as usize / 4;
        for (vertex, expected) in [(0, [0.0, 0.0, 1.0]), (3, [1.0, 0.0, 0.0])] {
            for component in 0..3 {
                assert_original_close5(
                    geometry.vertices[vertex * stride + 3 + component],
                    expected[component],
                );
            }
        }
    }

    #[test]
    fn case_083_leaves_the_un_welded_geometry_indexed() {
        let source = original_gltf_fixture("triangle");

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert!(!matches!(geometry.indices, IndexBuffer::None));
        assert_eq!(get_mesh_geometry_index_count(&geometry), 3);
    }

    #[test]
    fn case_084_leaves_a_non_triangle_primitive_entirely_untouched() {
        let mut bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        bytes.extend(
            [0_u16, 1, 2, 1]
                .iter()
                .flat_map(|value| value.to_le_bytes()),
        );
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"},{"bufferView":1,"componentType":5123,"count":4,"type":"SCALAR"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0},{"buffer":0,"byteLength":8,"byteOffset":36}]),
            &bytes,
            json!([{"attributes":{"POSITION":0},"indices":1,"mode":0}]),
        );

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        assert_eq!(&geometry.vertices[3..6], &[0.0, 0.0, 0.0]);
    }

    #[test]
    fn case_085_calculates_a_tangent_basis_when_a_normal_map_is_bound_without_tangent() {
        let mut source = original_gltf_fixture("uvTriangle");
        source["materials"] = json!([{"normalTexture":{"index":0}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let stride = geometry.layout.read().unwrap().stride as usize / 4;
        for vertex in 0..get_mesh_geometry_vertex_count(&geometry) as usize {
            let base = vertex * stride + 6;
            assert_original_close5(geometry.vertices[base], 1.0);
            assert_original_close5(geometry.vertices[base + 1], 0.0);
            assert_original_close5(geometry.vertices[base + 2], 0.0);
            assert_original_close5(geometry.vertices[base + 3].abs(), 1.0);
        }
    }

    #[test]
    fn case_086_leaves_the_tangent_slot_alone_when_nothing_reads_tangent_space() {
        let source = original_gltf_fixture("uvTriangle");

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(&geometry.vertices[6..10], &[0.0, 0.0, 0.0, 0.0]);
    }

    #[test]
    fn case_087_calculates_a_tangent_basis_for_a_material_extension_with_no_normal_map() {
        let mut source = original_gltf_fixture("uvTriangle");
        source["materials"] =
            json!([{"extensions":{"KHR_materials_anisotropy":{"anisotropyStrength":0.5}}}]);
        source["meshes"][0]["primitives"][0]["material"] = json!(0);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let stride = geometry.layout.read().unwrap().stride as usize / 4;
        for vertex in 0..get_mesh_geometry_vertex_count(&geometry) as usize {
            let base = vertex * stride + 6;
            assert_original_close5(geometry.vertices[base], 1.0);
            assert_original_close5(geometry.vertices[base + 1], 0.0);
            assert_original_close5(geometry.vertices[base + 2], 0.0);
            assert_original_close5(geometry.vertices[base + 3].abs(), 1.0);
        }
    }

    #[test]
    fn case_088_does_not_un_weld_a_morphed_primitive_so_its_blend_shape_deltas_stay_aligned() {
        let mut bytes: Vec<_> = [
            0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0,
        ]
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect();
        bytes.extend(
            [
                0.0_f32, 10.0, 0.0, 0.0, 10.0, 0.0, 0.0, 10.0, 0.0, 0.0, 10.0, 0.0,
            ]
            .iter()
            .flat_map(|value| value.to_le_bytes()),
        );
        bytes.extend(
            [0_u16, 1, 2, 1, 3, 2]
                .iter()
                .flat_map(|value| value.to_le_bytes()),
        );
        let mut source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":4,"type":"VEC3"},{"bufferView":1,"componentType":5126,"count":4,"type":"VEC3"},{"bufferView":2,"componentType":5123,"count":6,"type":"SCALAR"}]),
            json!([{"buffer":0,"byteLength":48,"byteOffset":0},{"buffer":0,"byteLength":48,"byteOffset":48},{"buffer":0,"byteLength":12,"byteOffset":96}]),
            &bytes,
            json!([{"attributes":{"POSITION":0},"indices":2,"targets":[{"POSITION":1}]}]),
        );
        source["meshes"][0]["weights"] = json!([0]);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 4);
        let children = original_children(&scene);
        let mesh = children[0].read().unwrap();
        let mesh = mesh.as_any().downcast_ref::<Mesh>().unwrap();
        assert_eq!(
            mesh.morph.as_ref().unwrap().read().unwrap().targets[0]
                .position_deltas
                .len(),
            12
        );
        assert_original_close5(
            geometry.vertices[3]
                .hypot(geometry.vertices[4])
                .hypot(geometry.vertices[5]),
            1.0,
        );
    }

    #[test]
    fn case_089_drops_the_primitive_when_the_indices_accessor_is_unreadable() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["indices"] = json!(99);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.accessor-not-found",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstAccessor", ImportDiagnosticDetailValue::Number(99.0))],
        );
        let children = original_children(&scene);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(!is_mesh(&node));
    }

    #[test]
    fn case_090_drops_the_mesh_entirely_for_a_primitive_with_no_position_attribute() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["attributes"] = json!({});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.primitive-no-position",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[],
        );
        let children = original_children(&scene);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(!is_mesh(&node));
    }

    #[test]
    fn case_091_imports_every_primitive_of_a_multi_primitive_mesh_as_its_own_sub_mesh() {
        let bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0}]),
            &bytes,
            json!([{"attributes":{"POSITION":0},"material":0},{"attributes":{"POSITION":0},"material":1}]),
        );
        let scene = original_scene(&source, None);
        let roots = original_children(&scene);
        let node: Unknown = Some(Arc::new(roots[0].clone()));
        assert!(!is_mesh(&node));
        let mut children = Vec::new();
        get_node_children(&mut children, &roots[0]);
        assert_eq!(children.len(), 2);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(is_mesh(&node));
        let mesh = children[1].read().unwrap();
        let mesh = mesh.as_any().downcast_ref::<Mesh>().unwrap();
        assert_eq!(
            get_mesh_geometry_vertex_count(&mesh.geometry.read().unwrap()),
            3
        );
    }

    #[test]
    fn case_092_imports_the_tangent_attribute_into_the_canonical_tangent_slot_when_present() {
        let mut bytes: Vec<_> = [0.0_f32, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        bytes.extend(
            [
                1.0_f32, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, -1.0, 0.0, 0.0, 1.0, 1.0,
            ]
            .iter()
            .flat_map(|value| value.to_le_bytes()),
        );
        let source = original_geometry_gltf(
            json!([{"bufferView":0,"componentType":5126,"count":3,"type":"VEC3"},{"bufferView":1,"componentType":5126,"count":3,"type":"VEC4"}]),
            json!([{"buffer":0,"byteLength":36,"byteOffset":0},{"buffer":0,"byteLength":48,"byteOffset":36}]),
            &bytes,
            json!([{"attributes":{"POSITION":0,"TANGENT":1}}]),
        );

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let mut tangent = create_vector4(0.0, 0.0, 0.0, 0.0);
        get_mesh_geometry_vertex_tangent(&mut tangent, &geometry, 1);
        assert_eq!(
            [tangent.x, tangent.y, tangent.z, tangent.w],
            [0.0, 1.0, 0.0, -1.0]
        );
    }

    #[test]
    fn case_093_zero_fills_the_tangent_slot_when_a_primitive_has_no_tangent_attribute() {
        let source = original_gltf_fixture("triangle");

        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        let mut tangent = create_vector4(0.0, 0.0, 0.0, 0.0);
        get_mesh_geometry_vertex_tangent(&mut tangent, &geometry, 0);
        assert_eq!(
            [tangent.x, tangent.y, tangent.z, tangent.w],
            [0.0, 0.0, 0.0, 0.0]
        );
    }

    #[test]
    fn case_094_returns_an_empty_scene_and_warns_on_malformed_json_instead_of_throwing() {
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = create_scene3d_from_gltf(
            &GltfSource::Json(GltfJsonSource {
                source: "{ this is not valid json",
            }),
            Some(&diagnostics),
            None,
        );
        assert!(original_children(&scene).is_empty());
        assert!(!diagnostics.read().unwrap().is_empty());
    }

    #[test]
    fn case_095_warns_when_asset_version_has_an_unsupported_major_version() {
        let mut source = original_gltf_fixture("triangle");
        source["asset"] = json!({"version":"3.0"});
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.unsupported-version",
            ImportDiagnosticSeverity::Recover,
            "buildGltfDocument",
            &[(
                "version",
                ImportDiagnosticDetailValue::String("3.0".to_string()),
            )],
        );
    }

    #[test]
    fn case_096_maps_primitive_mode_0_to_point_list() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["mode"] = json!(0);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(geometry.topology, PrimitiveTopology::PointList);
    }

    #[test]
    fn case_096_maps_primitive_mode_1_to_line_list() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["mode"] = json!(1);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(geometry.topology, PrimitiveTopology::LineList);
    }

    #[test]
    fn case_096_maps_primitive_mode_3_to_line_strip() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["mode"] = json!(3);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(geometry.topology, PrimitiveTopology::LineStrip);
    }

    #[test]
    fn case_096_maps_primitive_mode_4_to_triangle_list() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["mode"] = json!(4);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(geometry.topology, PrimitiveTopology::TriangleList);
    }

    #[test]
    fn case_096_maps_primitive_mode_5_to_triangle_strip() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["mode"] = json!(5);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(geometry.topology, PrimitiveTopology::TriangleStrip);
    }

    #[test]
    fn case_097_converts_gltf_line_loops_into_closed_line_list_indices() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["mode"] = json!(2);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(geometry.topology, PrimitiveTopology::LineList);
        assert_eq!(original_geometry_indices(&geometry), [0, 1, 1, 2, 2, 0]);
    }

    #[test]
    fn case_098_converts_gltf_triangle_fans_into_triangle_list_indices() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["mode"] = json!(6);
        let scene = original_scene(&source, None);
        let geometry = original_first_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(geometry.topology, PrimitiveTopology::TriangleList);
        assert_eq!(original_geometry_indices(&geometry), [0, 1, 2]);
    }

    #[test]
    fn case_099_drops_the_primitive_for_an_unknown_mode_instead_of_keeping_undrawable_geometry() {
        let mut source = original_gltf_fixture("triangle");
        source["meshes"][0]["primitives"][0]["mode"] = json!(7);
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let scene = original_scene(&source, Some(&diagnostics));
        assert_original_diagnostic(
            &diagnostics,
            "gltf.primitive-unsupported-mode",
            ImportDiagnosticSeverity::Drop,
            "buildGltfDocument",
            &[("firstMode", ImportDiagnosticDetailValue::Number(7.0))],
        );
        let children = original_children(&scene);
        let node: Unknown = Some(Arc::new(children[0].clone()));
        assert!(!is_mesh(&node));
    }
}
