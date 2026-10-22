use super::awd2_test_helper::{block, empty_document, file, scene_header};
use flight_entity::Ref;
use flight_geometry::create_transform3d;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_meshgeometry::{MeshGeometry, MeshGeometryOptions, create_mesh_geometry};
use flight_scene3d::{MESH_KIND, NODE3D_KIND, Scene3DDocument};
use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

const IDENTITY: [f64; 12] = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0];

fn create_state() -> Awd2ParseState {
    let mut state = create_awd2_parse_state();
    state.document = empty_document();
    state.diagnostics = Some(Arc::new(RwLock::new(Vec::new())));
    return state;
}

fn geometry() -> Ref<MeshGeometry> {
    return Arc::new(RwLock::new(create_mesh_geometry(MeshGeometryOptions {
        vertices: vec![0.0; 36].into_boxed_slice(),
        layout: CANONICAL_LAYOUT.clone(),
        indices: None,
        subsets: None,
        topology: None,
    })));
}

fn invoke_build(handler: &Ref<Awd2BlockHandler>, state: &mut Awd2ParseState) {
    let build = handler.read().unwrap().build.clone().unwrap();
    build(state);
}

fn invoke_parse(
    handler: &Ref<Awd2BlockHandler>,
    state: &mut Awd2ParseState,
    id: u32,
    body: &[u8],
    wide: bool,
) {
    let bytes = Arc::new(RwLock::new(body.to_vec().into_boxed_slice()));
    let block = Awd2Block {
        block_id: id,
        block_type: handler.read().unwrap().block_types[0],
        data_start: 0,
        data_end: body.len(),
        geometry_wide: false,
        matrix_wide: wide,
        source: bytes.clone(),
        view: bytes,
    };
    let parse = handler.read().unwrap().parse.clone();
    parse(state, &block);
}

fn mesh_body(
    name: &str,
    parent: u32,
    geometry_id: u32,
    material_ids: &[u32],
    wide: bool,
) -> Vec<u8> {
    let mut bytes = scene_header(name, parent, &IDENTITY, wide);
    bytes.extend_from_slice(&geometry_id.to_le_bytes());
    bytes.extend_from_slice(&(material_ids.len() as u16).to_le_bytes());
    for id in material_ids {
        bytes.extend_from_slice(&id.to_le_bytes());
    }
    bytes.extend_from_slice(&[0; 8]);
    return bytes;
}

fn parse_structure(
    blocks: &[Vec<u8>],
) -> (
    Ref<Scene3DDocument>,
    Vec<flight_importdiagnostics::ImportDiagnostic>,
) {
    let source = Arc::new(RwLock::new(file(blocks).into_boxed_slice()));
    let diagnostics = Arc::new(RwLock::new(Vec::new()));
    let document = parse_awd2(
        &source,
        &Awd2ParseOptions {
            blocks: vec![
                AWD2_CONTAINER_HANDLER.clone(),
                AWD2_MESH_INSTANCE_HANDLER.clone(),
            ],
            deflate: None,
            lzma: None,
        },
        Some(&diagnostics),
    );
    let diagnostics = diagnostics.read().unwrap().clone();
    return (document, diagnostics);
}

mod awd2_container_handler {
    use super::*;

    #[test]
    fn claims_containers_and_implements_the_scene_structure_parse_and_build_phase() {
        let handler = AWD2_CONTAINER_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_CONTAINER]);
        assert_eq!(
            handler.build_phase,
            Some(AWD2_BUILD_PHASE_SCENE_STRUCTURE as f32)
        );
        assert!(handler.build.is_some());
        assert_ne!(handler.deferred, Some(true));
    }

    #[test]
    fn reads_both_transform_widths_replaces_duplicate_ids_in_place_and_preserves_authored_hierarchy_order()
     {
        for wide in [false, true] {
            let mut state = create_state();
            let mut transform = IDENTITY;
            transform[9..].copy_from_slice(&[10.0, 20.0, 30.0]);
            let first = scene_header("old", 0, &transform, wide);
            invoke_parse(&AWD2_CONTAINER_HANDLER, &mut state, 9, &first, wide);
            invoke_parse(
                &AWD2_CONTAINER_HANDLER,
                &mut state,
                2,
                &scene_header("child", 9, &IDENTITY, wide),
                wide,
            );
            invoke_parse(
                &AWD2_CONTAINER_HANDLER,
                &mut state,
                9,
                &scene_header("Group", 0, &transform, wide),
                wide,
            );
            assert_eq!(
                state
                    .containers
                    .iter()
                    .map(|entry| entry.key)
                    .collect::<Vec<_>>(),
                [9, 2]
            );
            assert_eq!(state.containers[0].value.name, "Group");
            invoke_build(&AWD2_CONTAINER_HANDLER, &mut state);
            invoke_build(&AWD2_MESH_INSTANCE_HANDLER, &mut state);
            let document = state.document.read().unwrap();
            assert_eq!(document.nodes[0].kind, NODE3D_KIND);
            assert_eq!(document.nodes[0].name.as_deref(), Some("Group"));
            assert_eq!(document.nodes[0].children, [1]);
            assert_eq!(document.scenes[0].root_nodes, [0]);
            assert_eq!(
                [
                    document.nodes[0].transform.position.x,
                    document.nodes[0].transform.position.y,
                    document.nodes[0].transform.position.z
                ],
                [10.0, 20.0, -30.0]
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
        }
    }

    #[test]
    fn reports_all_three_source_container_truncation_rows_on_the_scene_document_path() {
        let full = scene_header("", 0, &IDENTITY, false);
        for (cut, field) in [(0, "parentId"), (4, "transform"), (52, "name")] {
            let (document, diagnostics) =
                parse_structure(&[block(AWD2_BLOCK_CONTAINER, 0, 1, &full[..cut])]);
            assert!(document.read().unwrap().nodes.is_empty());
            assert_eq!(diagnostics.len(), 1);
            let crumb = &diagnostics[0];
            assert_eq!(crumb.kind, "awd2.container-truncated");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "parseContainerBlock");
            let detail = crumb.detail.as_ref().unwrap();
            assert_eq!(
                detail["field"],
                ImportDiagnosticDetailValue::String(field.to_string())
            );
            assert!(!detail.contains_key("bytes"));
            assert!(!detail.contains_key("lights"));
        }
    }
}

mod awd2_mesh_instance_handler {
    use super::*;

    #[test]
    fn claims_mesh_instances_and_implements_the_scene_structure_parse_and_build_phase() {
        let handler = AWD2_MESH_INSTANCE_HANDLER.read().unwrap();
        assert_eq!(handler.block_types, [AWD2_BLOCK_MESH_INSTANCE]);
        assert_eq!(
            handler.build_phase,
            Some(AWD2_BUILD_PHASE_SCENE_STRUCTURE as f32)
        );
        assert!(handler.build.is_some());
        assert_ne!(handler.deferred, Some(true));
    }

    #[test]
    fn builds_meshes_under_containers_using_original_geometry_and_material_resolvers_outside_document_locks()
     {
        let mut state = create_state();
        let original = geometry();
        state.geometries.push(Awd2GeometryEntry {
            key: 1,
            value: vec![Awd2ParsedGeometry {
                geometry: original.clone(),
                skinned: true,
            }],
        });
        state.skin_index = Some(4);
        let retained = state.document.clone();
        let calls = Arc::new(RwLock::new(Vec::new()));
        let retained_calls = calls.clone();
        state.resolve_material = Some(Arc::new(move |id| {
            assert!(
                retained.try_write().is_ok(),
                "material resolution must release document locks"
            );
            retained_calls.write().unwrap().push(id);
            return 7;
        }));
        invoke_parse(
            &AWD2_CONTAINER_HANDLER,
            &mut state,
            2,
            &scene_header("Group", 0, &IDENTITY, false),
            false,
        );
        let mut body = mesh_body("ChildMesh", 2, 1, &[11], false);
        let mut authored = IDENTITY;
        authored[9..].copy_from_slice(&[10.0, 20.0, 30.0]);
        let header = scene_header("ChildMesh", 2, &authored, false);
        body[..header.len()].copy_from_slice(&header);
        invoke_parse(&AWD2_MESH_INSTANCE_HANDLER, &mut state, 3, &body, false);
        invoke_build(&AWD2_CONTAINER_HANDLER, &mut state);
        invoke_build(&AWD2_MESH_INSTANCE_HANDLER, &mut state);
        let document = state.document.read().unwrap();
        assert_eq!(document.nodes.len(), 2);
        assert_eq!(document.scenes[0].root_nodes, [0]);
        assert_eq!(document.nodes[0].children, [1]);
        assert_eq!(document.nodes[1].kind, MESH_KIND);
        assert_eq!(document.nodes[1].name.as_deref(), Some("ChildMesh"));
        assert_eq!(document.nodes[1].mesh, Some(0));
        assert_eq!(
            [
                document.nodes[1].transform.position.x,
                document.nodes[1].transform.position.y,
                document.nodes[1].transform.position.z
            ],
            [10.0, 20.0, -30.0]
        );
        assert!(Arc::ptr_eq(&document.meshes[0].geometry, &original));
        assert_eq!(document.meshes[0].materials, [7]);
        assert_eq!(document.meshes[0].skin, Some(4));
        assert_eq!(*calls.read().unwrap(), [11]);
        assert!(
            state
                .diagnostics
                .as_ref()
                .unwrap()
                .read()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn emits_multiple_geometry_parts_as_anonymous_identity_children_with_positional_materials_and_skin_flags()
     {
        let mut state = create_state();
        let first = geometry();
        let second = geometry();
        state.geometries.push(Awd2GeometryEntry {
            key: 1,
            value: vec![
                Awd2ParsedGeometry {
                    geometry: first.clone(),
                    skinned: true,
                },
                Awd2ParsedGeometry {
                    geometry: second.clone(),
                    skinned: false,
                },
            ],
        });
        state.skin_index = Some(9);
        let calls = Arc::new(RwLock::new(Vec::new()));
        let retained = calls.clone();
        state.resolve_material = Some(Arc::new(move |id| {
            retained.write().unwrap().push(id);
            return if id == 0 { -1 } else { id as i32 };
        }));
        invoke_parse(
            &AWD2_MESH_INSTANCE_HANDLER,
            &mut state,
            10,
            &mesh_body("Body", 0, 1, &[3], true),
            true,
        );
        invoke_build(&AWD2_MESH_INSTANCE_HANDLER, &mut state);
        let document = state.document.read().unwrap();
        assert_eq!(document.scenes[0].root_nodes, [0]);
        assert_eq!(document.nodes[0].kind, NODE3D_KIND);
        assert_eq!(document.nodes[0].name.as_deref(), Some("Body"));
        assert_eq!(document.nodes[0].children, [1, 2]);
        assert_eq!(*calls.read().unwrap(), [3, 0]);
        for (index, original, skin, materials) in
            [(0, &first, Some(9), vec![3]), (1, &second, None, vec![])]
        {
            assert!(Arc::ptr_eq(&document.meshes[index].geometry, original));
            assert_eq!(document.meshes[index].skin, skin);
            assert_eq!(document.meshes[index].materials, materials);
            let node = &document.nodes[index + 1];
            assert_eq!(node.name, None);
            assert_eq!(node.mesh, Some(index as i32));
            let identity = create_transform3d();
            assert_eq!(node.transform.position.x, identity.position.x);
            assert_eq!(node.transform.rotation.w, identity.rotation.w);
            assert_eq!(node.transform.scale.x, identity.scale.x);
        }
    }

    #[test]
    fn retains_bare_nodes_for_missing_geometry_and_parents_containers_to_instances_after_both_build_passes()
     {
        let (document, diagnostics) = parse_structure(&[
            block(
                AWD2_BLOCK_CONTAINER,
                0,
                2,
                &scene_header("Child", 3, &IDENTITY, false),
            ),
            block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                3,
                &mesh_body("Parent", 0, 99, &[], false),
            ),
            block(
                AWD2_BLOCK_MESH_INSTANCE,
                0,
                4,
                &mesh_body("", 999, 0, &[], false),
            ),
        ]);
        let document = document.read().unwrap();
        assert!(document.meshes.is_empty());
        assert_eq!(document.nodes[1].children, [0]);
        assert_eq!(document.scenes[0].root_nodes, [1, 2]);
        assert_eq!(document.nodes[2].kind, NODE3D_KIND);
        assert!(document.nodes[2].name.is_none());
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "awd2.mesh-instance-missing-geometry");
        assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Recover);
        assert_eq!(diagnostics[0].origin, "parseAwd2");
        let detail = diagnostics[0].detail.as_ref().unwrap();
        assert_eq!(detail["block"], ImportDiagnosticDetailValue::Number(3.0));
        assert_eq!(
            detail["geometry"],
            ImportDiagnosticDetailValue::Number(99.0)
        );
    }

    #[test]
    fn reports_all_four_source_mesh_instance_truncation_rows_and_accepts_optional_material_tails() {
        let full = mesh_body("", 0, 0, &[], false);
        for (cut, field) in [
            (0, "parentId"),
            (4, "transform"),
            (52, "name"),
            (54, "geometryId"),
        ] {
            let (document, diagnostics) =
                parse_structure(&[block(AWD2_BLOCK_MESH_INSTANCE, 0, 1, &full[..cut])]);
            assert!(document.read().unwrap().nodes.is_empty());
            assert_eq!(diagnostics.len(), 1);
            let crumb = &diagnostics[0];
            assert_eq!(crumb.kind, "awd2.mesh-instance-truncated");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "parseMeshInstanceBlock");
            let detail = crumb.detail.as_ref().unwrap();
            assert_eq!(
                detail["field"],
                ImportDiagnosticDetailValue::String(field.to_string())
            );
            assert!(!detail.contains_key("bytes"));
            assert!(!detail.contains_key("lights"));
        }
        for length in [58, 59, 60] {
            let (document, diagnostics) =
                parse_structure(&[block(AWD2_BLOCK_MESH_INSTANCE, 0, 1, &full[..length])]);
            assert_eq!(document.read().unwrap().nodes.len(), 1);
            assert!(diagnostics.is_empty());
        }
        let mut partial = full[..58].to_vec();
        partial.extend_from_slice(&2_u16.to_le_bytes());
        partial.extend_from_slice(&6_u32.to_le_bytes());
        let mut state = create_state();
        invoke_parse(&AWD2_MESH_INSTANCE_HANDLER, &mut state, 1, &partial, false);
        assert_eq!(state.mesh_instances[0].value.material_ids, [6]);
    }
}
