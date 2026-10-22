use super::three_ds_test_helper::*;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::as_node3d_ref;
use flight_scene3d_formats::*;
use std::sync::Arc;

mod create_scene3d_from_3ds {
    use super::*;
    #[test]
    fn assembles_named_bare_meshes_with_original_material_resource_and_forwards_each_family() {
        let bytes = full_three_ds_file();
        let full = create_scene3d_from_3ds(&bytes, None, None);
        let children = {
            let mut output = Vec::new();
            get_node_children(&mut output, &(full.root.clone() as NodeRef));
            output
        };
        assert_eq!(children.len(), 1);
        let node = as_node3d_ref(&children[0]).unwrap();
        let guard = node.read().unwrap();
        assert_eq!(guard.node_fields().name.as_deref(), Some("box"));
        let mesh = guard.as_mesh().unwrap();
        assert_eq!(mesh.materials.read().unwrap().len(), 1);
        assert!(full.animations.is_empty());
        let no_mesh = ThreeDsImportOptions {
            handlers: Some(
                THREE_DS_ALL_CHUNK_HANDLERS
                    .iter()
                    .filter(|handler| !Arc::ptr_eq(handler, &THREE_DS_MESH_HANDLER))
                    .cloned()
                    .collect(),
            ),
        };
        let partial = create_scene3d_from_3ds(&bytes, None, Some(&no_mesh));
        assert!(
            {
                let mut output = Vec::new();
                get_node_children(&mut output, &(partial.root as NodeRef));
                output
            }
            .is_empty()
        );
        let empty = create_scene3d_from_3ds(
            &bytes,
            None,
            Some(&ThreeDsImportOptions {
                handlers: Some(Vec::new()),
            }),
        );
        assert!(
            {
                let mut output = Vec::new();
                get_node_children(&mut output, &(empty.root as NodeRef));
                output
            }
            .is_empty()
        );
    }

    #[test]
    fn multiple_named_meshes_and_unmaterialed_subsets_survive_the_live_scene_assembly() {
        let bytes = build_minimal_three_ds(&[
            write_mesh_object(
                "MeshA",
                &TRIANGLE_POSITIONS,
                &write_faces(&[0, 1, 2], &[]),
                None,
                None,
            ),
            write_mesh_object(
                "MeshB",
                &[2.0, 0.0, 0.0, 3.0, 0.0, 0.0, 2.0, 1.0, 0.0],
                &write_faces(&[0, 1, 2], &[]),
                None,
                None,
            ),
        ]);
        let scene = create_scene3d_from_3ds(&bytes, None, None);
        let children = {
            let mut output = Vec::new();
            get_node_children(&mut output, &(scene.root as NodeRef));
            output
        };
        assert_eq!(children.len(), 2);
        for (child, name) in children.iter().zip(["MeshA", "MeshB"]) {
            let node = as_node3d_ref(child).unwrap();
            let node = node.read().unwrap();
            assert_eq!(node.node_fields().name.as_deref(), Some(name));
            let mesh = node.as_mesh().unwrap();
            let materials = mesh.materials.read().unwrap();
            assert_eq!(materials.len(), 1);
            assert!(materials[0].is_none());
            assert_eq!(mesh.geometry.read().unwrap().vertices.len(), 36);
        }
    }

    #[test]
    fn empty_invalid_and_truncated_inputs_return_empty_or_partial_scenes_with_source_diagnostics() {
        for bytes in [Vec::new(), vec![1, 2, 3], vec![0; 6]] {
            let mut diagnostics = Vec::new();
            let scene = create_scene3d_from_3ds(&bytes, Some(&mut diagnostics), None);
            assert!(
                {
                    let mut output = Vec::new();
                    get_node_children(&mut output, &(scene.root as NodeRef));
                    output
                }
                .is_empty()
            );
            assert_eq!(diagnostics.len(), 1);
            assert_eq!(diagnostics[0].severity, ImportDiagnosticSeverity::Reject);
            assert_eq!(diagnostics[0].origin, "parse3ds");
        }
        let full = full_three_ds_file();
        let mut diagnostics = Vec::new();
        create_scene3d_from_3ds(&full[..full.len() / 2], Some(&mut diagnostics), None);
        assert!(!diagnostics.is_empty());
        for crumb in diagnostics {
            assert_eq!(crumb.origin, "parse3ds");
        }
    }
}

mod parse3ds {
    use super::*;
    #[test]
    fn full_default_and_explicit_families_produce_identical_observable_document_values() {
        let bytes = full_three_ds_file();
        let mut implicit_diagnostics = Vec::new();
        let mut explicit_diagnostics = Vec::new();
        let implicit = parse3ds(&bytes, Some(&mut implicit_diagnostics), None);
        let explicit = parse3ds(
            &bytes,
            Some(&mut explicit_diagnostics),
            Some(&ThreeDsImportOptions {
                handlers: Some(THREE_DS_ALL_CHUNK_HANDLERS.clone()),
            }),
        );
        assert_eq!(implicit_diagnostics, explicit_diagnostics);
        assert!(implicit_diagnostics.is_empty());
        assert_eq!(
            (
                implicit.meshes.len(),
                implicit.materials.len(),
                implicit.cameras.len(),
                implicit.lights.len()
            ),
            (1, 1, 1, 1)
        );
        assert_eq!(implicit.nodes.len(), 1);
        assert_eq!(implicit.scenes[0].root_nodes, [0]);
        assert!(implicit.animations.is_empty());
        assert_eq!(
            implicit.meshes[0].geometry.read().unwrap().vertices,
            explicit.meshes[0].geometry.read().unwrap().vertices
        );
        assert_eq!(implicit.meshes[0].materials, explicit.meshes[0].materials);
        assert_eq!(implicit.nodes[0].transform, explicit.nodes[0].transform);
        assert_eq!(implicit.cameras[0].near, explicit.cameras[0].near);
        assert_eq!(implicit.cameras[0].far, explicit.cameras[0].far);
        assert_eq!(implicit.cameras[0].transform, explicit.cameras[0].transform);
    }

    #[test]
    fn source_table_omission_cases_preserve_other_features_and_the_mesh_material_dependency() {
        let bytes = full_three_ds_file();
        for (omitted, table) in [
            (THREE_DS_MATERIAL_HANDLER.clone(), "Material"),
            (THREE_DS_MESH_HANDLER.clone(), "Mesh"),
            (THREE_DS_CAMERA_HANDLER.clone(), "Camera"),
            (THREE_DS_LIGHT_HANDLER.clone(), "Light"),
        ] {
            let options = ThreeDsImportOptions {
                handlers: Some(
                    THREE_DS_ALL_CHUNK_HANDLERS
                        .iter()
                        .filter(|handler| !Arc::ptr_eq(handler, &omitted))
                        .cloned()
                        .collect(),
                ),
            };
            let partial = parse3ds(&bytes, None, Some(&options));
            assert_eq!(
                partial.meshes.len(),
                usize::from(table != "Mesh"),
                "{table}"
            );
            assert_eq!(
                partial.materials.len(),
                usize::from(table != "Mesh" && table != "Material"),
                "{table}"
            );
            assert_eq!(
                partial.cameras.len(),
                usize::from(table != "Camera"),
                "{table}"
            );
            assert_eq!(
                partial.lights.len(),
                usize::from(table != "Light"),
                "{table}"
            );
        }
        let full = parse3ds(&bytes, None, None);
        let no_keyframe = ThreeDsImportOptions {
            handlers: Some(
                THREE_DS_ALL_CHUNK_HANDLERS
                    .iter()
                    .filter(|handler| !Arc::ptr_eq(handler, &THREE_DS_KEYFRAME_HANDLER))
                    .cloned()
                    .collect(),
            ),
        };
        let partial = parse3ds(&bytes, None, Some(&no_keyframe));
        assert_eq!(
            (
                partial.meshes.len(),
                partial.materials.len(),
                partial.cameras.len(),
                partial.lights.len()
            ),
            (1, 1, 1, 1)
        );
        assert_ne!(
            full.meshes[0].geometry.read().unwrap().vertices,
            partial.meshes[0].geometry.read().unwrap().vertices
        );
        let camera_only = parse3ds(
            &bytes,
            None,
            Some(&ThreeDsImportOptions {
                handlers: Some(THREE_DS_CAMERA_FAMILY.clone()),
            }),
        );
        assert_eq!(camera_only.cameras.len(), 1);
        assert!(camera_only.meshes.is_empty());
        assert!(camera_only.materials.is_empty());
        assert!(camera_only.lights.is_empty());
    }

    #[test]
    fn empty_families_do_not_fall_back_and_all_families_retain_the_header_guards() {
        let bytes = full_three_ds_file();
        let empty = parse3ds(
            &bytes,
            None,
            Some(&ThreeDsImportOptions {
                handlers: Some(Vec::new()),
            }),
        );
        assert!(empty.meshes.is_empty());
        assert!(empty.materials.is_empty());
        assert!(empty.cameras.is_empty());
        assert!(empty.lights.is_empty());
        for handlers in [
            None,
            Some(THREE_DS_ALL_CHUNK_HANDLERS.clone()),
            Some(Vec::new()),
        ] {
            let mut diagnostics = Vec::new();
            parse3ds(
                &[0],
                Some(&mut diagnostics),
                Some(&ThreeDsImportOptions { handlers }),
            );
            assert_eq!(diagnostics[0].kind, "3ds.input-too-small");
        }
    }
}
