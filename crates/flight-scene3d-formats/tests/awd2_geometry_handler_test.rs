use super::awd2_test_helper::{awd_string, block, empty_document, file, scene_header};
use flight_entity::Ref;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_meshgeometry::{
    IndexBuffer, MeshGeometry, get_mesh_geometry_index_count, get_mesh_geometry_vertex_count,
};
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::{MESH_KIND, Mesh};
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

const POSITIONS: [f32; 9] = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0];
const IDENTITY: [f64; 12] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];

fn body(sub_meshes: &[Vec<Vec<u8>>]) -> Vec<u8> {
    return named_body("Geo", sub_meshes);
}

fn create_state() -> Awd2ParseState {
    let mut state = create_awd2_parse_state();
    state.document = empty_document();
    state.diagnostics = Some(Arc::new(RwLock::new(Vec::new())));
    return state;
}

fn float_stream(kind: u8, values: &[f32]) -> Vec<u8> {
    return stream(
        kind,
        AWD2_DATA_FLOAT32,
        &values
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect::<Vec<_>>(),
    );
}

fn index_stream(values: &[u16]) -> Vec<u8> {
    return stream(
        AWD2_STREAM_INDICES,
        AWD2_DATA_UINT16,
        &values
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect::<Vec<_>>(),
    );
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

fn invoke_parse(state: &mut Awd2ParseState, id: u32, body: &[u8]) {
    let bytes = Arc::new(RwLock::new(body.to_vec().into_boxed_slice()));
    let block = Awd2Block {
        block_id: id,
        block_type: AWD2_BLOCK_TRIANGLE_GEOMETRY,
        data_start: 0,
        data_end: body.len(),
        geometry_wide: true,
        matrix_wide: false,
        source: bytes.clone(),
        view: bytes,
    };
    let parse = AWD2_TRIANGLE_GEOMETRY_HANDLER.read().unwrap().parse.clone();
    parse(state, &block);
}

fn named_body(name: &str, sub_meshes: &[Vec<Vec<u8>>]) -> Vec<u8> {
    let mut bytes = awd_string(name);
    bytes.extend_from_slice(&(sub_meshes.len() as u16).to_le_bytes());
    bytes.extend_from_slice(&[0; 4]);
    for streams in sub_meshes {
        let length = 8 + streams.iter().map(Vec::len).sum::<usize>();
        bytes.extend_from_slice(&(length as u32).to_le_bytes());
        bytes.extend_from_slice(&[0; 4]);
        for stream in streams {
            bytes.extend_from_slice(stream);
        }
        bytes.extend_from_slice(&[0; 4]);
    }
    return bytes;
}

fn parse_scene(
    geometry_body: &[u8],
    mesh_name: &str,
) -> (flight_scene3d::Scene3D, Vec<ImportDiagnostic>) {
    let mut mesh = scene_header(mesh_name, 0, &IDENTITY, false);
    mesh.extend_from_slice(&1u32.to_le_bytes());
    mesh.extend_from_slice(&[0; 10]);
    let input = Arc::new(RwLock::new(
        file(&[
            block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, geometry_body),
            block(AWD2_BLOCK_MESH_INSTANCE, 0, 2, &mesh),
        ])
        .into_boxed_slice(),
    ));
    return parse_scene_input(input);
}

fn parse_scene_input(input: Ref<Box<[u8]>>) -> (flight_scene3d::Scene3D, Vec<ImportDiagnostic>) {
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let scene = create_scene3d_from_awd2(
        &input,
        &Awd2ParseOptions {
            blocks: vec![
                AWD2_TRIANGLE_GEOMETRY_HANDLER.clone(),
                AWD2_CONTAINER_HANDLER.clone(),
                AWD2_MESH_INSTANCE_HANDLER.clone(),
            ],
            deflate: None,
            lzma: None,
        },
        Some(&diagnostics),
    );
    let diagnostics = diagnostics.read().unwrap().clone();
    return (scene, diagnostics);
}

fn scene_geometry(scene: &flight_scene3d::Scene3D) -> Ref<MeshGeometry> {
    let mut children = Vec::new();
    let root: NodeRef = scene.root.clone();
    get_node_children(&mut children, &root);
    assert_eq!(children.len(), 1);
    let child = children[0].read().unwrap();
    assert_eq!(child.node_fields().kind, MESH_KIND);
    return child
        .as_any()
        .downcast_ref::<Mesh>()
        .unwrap()
        .geometry
        .clone();
}

fn stream(kind: u8, data_type: u8, payload: &[u8]) -> Vec<u8> {
    let mut bytes = vec![kind, data_type];
    bytes.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    bytes.extend_from_slice(payload);
    return bytes;
}

mod awd2_triangle_geometry_handler {
    use super::*;

    #[test]
    fn claims_triangle_geometry_with_a_real_parse_callback_and_no_build_phase() {
        let handler = AWD2_TRIANGLE_GEOMETRY_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_TRIANGLE_GEOMETRY]);
        assert_eq!(handler.build_phase, None);
        assert!(handler.build.is_none());
        assert_ne!(handler.deferred, Some(true));
    }

    #[test]
    fn imports_the_source_indexed_triangle_and_reflects_positions_and_index_winding() {
        let bytes = named_body(
            "Triangle",
            &[vec![
                float_stream(AWD2_STREAM_POSITIONS, &POSITIONS),
                index_stream(&[0, 1, 2]),
            ]],
        );
        let (scene, diagnostics) = parse_scene(&bytes, "TriMesh");
        assert!(diagnostics.is_empty());
        let mut children = Vec::new();
        get_node_children(&mut children, &(scene.root.clone() as NodeRef));
        assert_eq!(
            children[0].read().unwrap().node_fields().name.as_deref(),
            Some("TriMesh")
        );
        let geometry = scene_geometry(&scene);
        let geometry = geometry.read().unwrap();
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 3);
        assert_eq!(indices(&geometry), [0, 2, 1]);
        for (vertex, expected) in [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
            .iter()
            .enumerate()
        {
            assert_eq!(&geometry.vertices[vertex * 12..vertex * 12 + 3], expected);
        }
        let mut state = create_state();
        invoke_parse(
            &mut state,
            9,
            &body(&[vec![float_stream(AWD2_STREAM_POSITIONS, &[1.0, 2.0, 3.0])]]),
        );
        assert_eq!(
            &state.geometries[0].value[0]
                .geometry
                .read()
                .unwrap()
                .vertices[..3],
            &[1.0, 2.0, -3.0]
        );
    }

    #[test]
    fn reverses_complete_nonindexed_records_generates_normals_and_leaves_tangents_zero_without_uvs()
    {
        for (name, mesh_name) in [
            ("NoIndices", "NoIndicesMesh"),
            ("NoNormals", "NoNormalsMesh"),
            ("NoIdx", "Mesh"),
        ] {
            let (scene, diagnostics) = parse_scene(
                &named_body(
                    name,
                    &[vec![float_stream(AWD2_STREAM_POSITIONS, &POSITIONS)]],
                ),
                mesh_name,
            );
            assert!(diagnostics.is_empty());
            let geometry = scene_geometry(&scene);
            let geometry = geometry.read().unwrap();
            assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
            assert_eq!(get_mesh_geometry_index_count(&geometry), 0);
            assert_eq!(&geometry.vertices[12..15], &[0.0, 1.0, 0.0]);
            assert_eq!(&geometry.vertices[24..27], &[1.0, 0.0, 0.0]);
            for vertex in geometry.vertices.chunks_exact(12) {
                assert!(vertex[..3].iter().all(|value| value.is_finite()));
                let length = vertex[3].hypot(vertex[4]).hypot(vertex[5]);
                // D1 f32 bound (TS: 0.5e-5)
                assert!((length - 1.0).abs() <= 0.5e-5f32.max(4.0 * f32::EPSILON));
                assert_eq!(&vertex[6..10], &[0.0; 4]);
            }
        }
    }

    #[test]
    fn preserves_authored_normal_uv_and_tangent_streams_with_reflected_xyz_and_negative_handedness()
    {
        let normals = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0];
        let uv = [0.0, 0.0, 1.0, 0.0, 0.5, 1.0];
        for with_tangent in [false, true] {
            let mut streams = vec![
                float_stream(AWD2_STREAM_POSITIONS, &POSITIONS),
                float_stream(AWD2_STREAM_NORMALS, &normals),
                index_stream(&[0, 1, 2]),
            ];
            if with_tangent {
                streams.push(float_stream(AWD2_STREAM_TANGENTS, &normals));
            } else {
                streams.push(float_stream(AWD2_STREAM_UVS, &uv));
            }
            let (scene, diagnostics) = parse_scene(&named_body("Geom", &[streams]), "Mesh");
            assert!(diagnostics.is_empty());
            let geometry = scene_geometry(&scene);
            let geometry = geometry.read().unwrap();
            assert_eq!(&geometry.vertices[3..6], &[0.0, 0.0, -1.0]);
            if !with_tangent {
                assert_eq!(&geometry.vertices[22..24], &[1.0, 0.0]);
                assert_eq!(&geometry.vertices[34..36], &[0.5, 1.0]);
            }
            if with_tangent {
                assert_eq!(&geometry.vertices[6..9], &[0.0, 0.0, -1.0]);
                for vertex in geometry.vertices.chunks_exact(12) {
                    assert_eq!(vertex[9], -1.0);
                }
            }
        }
    }

    #[test]
    fn synthesizes_source_tangent_frames_for_both_indexed_and_nonindexed_uv_triangles() {
        for indexed in [false, true] {
            let mut streams = vec![
                float_stream(AWD2_STREAM_POSITIONS, &POSITIONS),
                float_stream(AWD2_STREAM_UVS, &[0.0, 0.0, 1.0, 0.0, 0.0, 1.0]),
            ];
            if indexed {
                streams.push(index_stream(&[0, 1, 2]));
                streams.push(float_stream(
                    AWD2_STREAM_NORMALS,
                    &[0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
                ));
            }
            let (scene, diagnostics) = parse_scene(
                &named_body(if indexed { "Geom" } else { "NoTangents" }, &[streams]),
                if indexed { "Mesh" } else { "NoTangentsMesh" },
            );
            assert!(diagnostics.is_empty());
            let geometry = scene_geometry(&scene);
            let geometry = geometry.read().unwrap();
            for vertex in geometry.vertices.chunks_exact(12) {
                let length = vertex[6].hypot(vertex[7]).hypot(vertex[8]);
                if indexed {
                    // D1 f32 bound (TS: 0.5e-3)
                    assert!((length - 1.0).abs() <= 0.5e-3f32.max(4.0 * f32::EPSILON));
                } else {
                    // D1 f32 bound (TS: 0.5e-5)
                    assert!((length - 1.0).abs() <= 0.5e-5f32.max(4.0 * f32::EPSILON));
                }
                assert_eq!(vertex[9].abs(), 1.0);
            }
            if indexed {
                assert_eq!(geometry.vertices[9], -1.0);
            }
        }
    }

    #[test]
    fn decodes_tight_uint16_joint_indices_ignoring_the_declared_type_and_packs_stable_top_four_weights()
     {
        let mut joints = Vec::new();
        let mut weights = Vec::new();
        for _ in 0..3 {
            joints.extend_from_slice(&[0u16, 1, 2, 3, 4, 5]);
            weights.extend_from_slice(&[0.1, 0.4, 0.2, 0.2, 0.1, -1.0]);
        }
        let joint_bytes = joints
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect::<Vec<_>>();
        let mut state = create_state();
        invoke_parse(
            &mut state,
            1,
            &body(&[vec![
                float_stream(AWD2_STREAM_POSITIONS, &POSITIONS),
                index_stream(&[0, 1, 2]),
                stream(AWD2_STREAM_JOINT_INDICES, AWD2_DATA_FLOAT32, &joint_bytes),
                float_stream(AWD2_STREAM_JOINT_WEIGHTS, &weights),
            ]]),
        );
        assert!(
            state
                .diagnostics
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .is_empty()
        );
        let parsed = &state.geometries[0].value[0];
        assert!(parsed.skinned);
        let geometry = parsed.geometry.read().unwrap();
        assert_eq!(geometry.layout.read().unwrap().stride, 80);
        for vertex in geometry.vertices.chunks_exact(20) {
            assert_eq!(&vertex[12..16], &[1.0, 2.0, 3.0, 0.0]);
            for (actual, expected) in
                vertex[16..20]
                    .iter()
                    .zip([4.0 / 9.0, 2.0 / 9.0, 2.0 / 9.0, 1.0 / 9.0])
            {
                // D1 f32 bound (TS: 0)
                assert!((*actual - expected).abs() <= 4.0 * f32::EPSILON);
            }
        }
    }

    #[test]
    fn preserves_exact_uint32_indices_and_source_float_to_uint32_projection_without_early_scalar_narrowing()
     {
        for (data_type, payload, expected) in [
            (
                AWD2_DATA_UINT32,
                [16777217u32, u32::MAX, 2]
                    .iter()
                    .flat_map(|value| value.to_le_bytes())
                    .collect::<Vec<_>>(),
                vec![16777217, 2, u32::MAX],
            ),
            (
                AWD2_DATA_FLOAT64,
                [
                    4294967297.0f64,
                    -1.75,
                    f64::NAN,
                    f64::INFINITY,
                    0.75,
                    8589934595.0,
                ]
                .iter()
                .flat_map(|value| value.to_le_bytes())
                .collect::<Vec<_>>(),
                vec![1, 0, u32::MAX, 0, 3, 0],
            ),
            (
                AWD2_DATA_FLOAT32,
                [-1.75f32, f32::INFINITY, 2.75]
                    .iter()
                    .flat_map(|value| value.to_le_bytes())
                    .collect::<Vec<_>>(),
                vec![u32::MAX, 2, 0],
            ),
        ] {
            let mut state = create_state();
            invoke_parse(
                &mut state,
                1,
                &body(&[vec![
                    float_stream(AWD2_STREAM_POSITIONS, &POSITIONS),
                    float_stream(AWD2_STREAM_NORMALS, &[0.0; 9]),
                    stream(AWD2_STREAM_INDICES, data_type, &payload),
                ]]),
            );
            assert_eq!(
                indices(&state.geometries[0].value[0].geometry.read().unwrap()),
                expected
            );
        }
    }

    #[test]
    fn replaces_duplicate_geometry_ids_in_order_even_with_an_empty_result_and_keeps_original_geometry_handles()
     {
        let mut state = create_state();
        let bytes = body(&[vec![float_stream(AWD2_STREAM_POSITIONS, &POSITIONS)]]);
        invoke_parse(&mut state, 9, &bytes);
        let original = state.geometries[0].value[0].geometry.clone();
        invoke_parse(&mut state, 3, &bytes);
        assert!(Arc::ptr_eq(
            &original,
            &state.geometries[0].value[0].geometry
        ));
        invoke_parse(&mut state, 9, &body(&[]));
        assert_eq!(
            state
                .geometries
                .iter()
                .map(|entry| entry.key)
                .collect::<Vec<_>>(),
            [9, 3]
        );
        assert!(state.geometries[0].value.is_empty());
        assert_eq!(get_mesh_geometry_vertex_count(&original.read().unwrap()), 3);
    }

    #[test]
    fn reports_all_source_geometry_truncation_and_recovery_crumbs_with_exact_counts_details_and_origin()
     {
        let mut count_only = awd_string("Geo");
        count_only.extend_from_slice(&1u16.to_le_bytes());
        count_only.extend_from_slice(&[0; 4]);
        let mut bad_stream = vec![AWD2_STREAM_UVS, AWD2_DATA_FLOAT32];
        bad_stream.extend_from_slice(&9999u32.to_le_bytes());
        bad_stream.extend_from_slice(&[0; 4]);
        let mismatch = named_body(
            "Skin",
            &[vec![
                float_stream(AWD2_STREAM_POSITIONS, &POSITIONS),
                index_stream(&[0, 1, 2]),
                stream(AWD2_STREAM_JOINT_INDICES, AWD2_DATA_FLOAT32, &[0, 0, 1, 0]),
                float_stream(AWD2_STREAM_JOINT_WEIGHTS, &[0.5; 6]),
            ]],
        );
        for (bytes, severity, kind, detail) in [
            (
                vec![0],
                ImportDiagnosticSeverity::Drop,
                "awd2.geometry-truncated",
                Some((
                    "field",
                    ImportDiagnosticDetailValue::String("name".to_string()),
                )),
            ),
            (
                vec![10, 0, 65],
                ImportDiagnosticSeverity::Drop,
                "awd2.geometry-truncated",
                Some((
                    "field",
                    ImportDiagnosticDetailValue::String("name".to_string()),
                )),
            ),
            (
                awd_string("Geo"),
                ImportDiagnosticSeverity::Drop,
                "awd2.geometry-truncated",
                Some((
                    "field",
                    ImportDiagnosticDetailValue::String("num-submeshes".to_string()),
                )),
            ),
            (
                count_only,
                ImportDiagnosticSeverity::Drop,
                "awd2.submesh-truncated",
                Some(("firstSubMesh", ImportDiagnosticDetailValue::Number(0.0))),
            ),
            (
                body(&[vec![index_stream(&[0, 1, 2])]]),
                ImportDiagnosticSeverity::Drop,
                "awd2.submesh-no-positions",
                None,
            ),
            (
                body(&[vec![
                    float_stream(AWD2_STREAM_POSITIONS, &POSITIONS),
                    bad_stream,
                ]]),
                ImportDiagnosticSeverity::Recover,
                "awd2.stream-data-past-end",
                None,
            ),
            (
                mismatch,
                ImportDiagnosticSeverity::Recover,
                "awd2.skin-streams-mismatch",
                None,
            ),
        ] {
            let input = Arc::new(RwLock::new(
                file(&[block(AWD2_BLOCK_TRIANGLE_GEOMETRY, 0, 1, &bytes)]).into_boxed_slice(),
            ));
            let (_, diagnostics) = parse_scene_input(input);
            assert_eq!(diagnostics.len(), 1, "{kind}");
            let diagnostic = &diagnostics[0];
            assert_eq!(diagnostic.kind, kind);
            assert_eq!(diagnostic.severity, severity);
            assert_eq!(diagnostic.origin, "parseTriangleGeometryBlock");
            if let Some((key, value)) = detail {
                assert_eq!(diagnostic.detail.as_ref().unwrap().len(), 1);
                assert_eq!(diagnostic.detail.as_ref().unwrap().get(key), Some(&value));
            } else {
                assert!(diagnostic.detail.is_none());
            }
            if kind == "awd2.skin-streams-mismatch" {
                let (scene, _) = parse_scene(&bytes, "Mesh");
                assert_eq!(
                    scene_geometry(&scene)
                        .read()
                        .unwrap()
                        .layout
                        .read()
                        .unwrap()
                        .stride,
                    48
                );
            }
        }
    }

    #[test]
    fn keeps_partial_authored_channels_zero_and_uses_the_last_stream_of_each_kind() {
        let mut state = create_state();
        invoke_parse(
            &mut state,
            1,
            &body(&[vec![
                float_stream(AWD2_STREAM_POSITIONS, &[9.0; 9]),
                float_stream(AWD2_STREAM_POSITIONS, &POSITIONS),
                float_stream(AWD2_STREAM_NORMALS, &[0.0, 0.0, 1.0]),
                float_stream(AWD2_STREAM_TANGENTS, &[1.0, 0.0, 0.0]),
                float_stream(AWD2_STREAM_UVS, &[0.25, 0.75]),
                index_stream(&[0, 1, 2]),
            ]]),
        );
        let geometry = state.geometries[0].value[0].geometry.read().unwrap();
        assert_eq!(&geometry.vertices[..3], &[0.0; 3]);
        assert_eq!(&geometry.vertices[3..6], &[0.0, 0.0, -1.0]);
        assert_eq!(
            &geometry.vertices[6..12],
            &[1.0, 0.0, 0.0, -1.0, 0.25, 0.75]
        );
        for vertex in geometry.vertices.chunks_exact(12).skip(1) {
            assert_eq!(&vertex[3..12], &[0.0; 9]);
        }
    }
}
