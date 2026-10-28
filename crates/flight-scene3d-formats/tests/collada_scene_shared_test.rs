use flight_entity::Ref;
use flight_geometry::contract::create_transform3d;
use flight_meshgeometry::{MeshGeometryOptions, create_mesh_geometry};
use flight_scene3d::{
    NODE3D_KIND, Scene3DDocument, Scene3DDocumentMesh, Scene3DDocumentNode, Scene3DMetadata,
};
use flight_scene3d_formats::contract::*;
use flight_xml::{XmlElement, parse_xml_document};
use std::sync::{Arc, RwLock};

fn document_with_mesh(materials: Vec<i32>) -> Scene3DDocument {
    let geometry = Arc::new(RwLock::new(create_mesh_geometry(MeshGeometryOptions {
        vertices: vec![].into_boxed_slice(),
        layout: CANONICAL_LAYOUT.clone(),
        indices: None,
        subsets: None,
        topology: None,
    })));
    return Scene3DDocument {
        animations: Vec::new(),
        cameras: Vec::new(),
        lights: Vec::new(),
        materials: Vec::new(),
        meshes: vec![Scene3DDocumentMesh {
            geometry,
            materials,
            name: None,
            skin: None,
            morph: None,
        }],
        metadata: Some(Arc::new(RwLock::new(Scene3DMetadata {
            copyright: None,
            generator: None,
            version: None,
        }))),
        nodes: Vec::new(),
        resources: Vec::new(),
        scenes: Vec::new(),
        skins: Vec::new(),
    };
}

fn element(xml: &str) -> Ref<XmlElement> {
    return Arc::new(RwLock::new(parse_xml_document(xml).unwrap()));
}

fn indices(rows: &[(&str, i32)]) -> Vec<ColladaIndexEntry> {
    return rows
        .iter()
        .map(|(key, value)| ColladaIndexEntry {
            key: key.to_string(),
            value: *value,
        })
        .collect();
}

fn node(position: [f32; 3], children: Vec<i32>) -> Scene3DDocumentNode {
    let mut transform = create_transform3d();
    transform.position.x = position[0];
    transform.position.y = position[1];
    transform.position.z = position[2];
    return Scene3DDocumentNode {
        children,
        kind: NODE3D_KIND.to_string(),
        mesh: None,
        name: None,
        transform,
    };
}

mod apply_collada_bind_material {
    use super::*;

    #[test]
    fn reads_the_original_instance_bindings_and_applies_them_to_an_unassigned_mesh_in_one_step() {
        let mut document = document_with_mesh(vec![]);
        let instance = element(
            "<instance_geometry url=\"#g\"><bind_material><technique_common><instance_material symbol=\"red\" target=\"#m0\"/></technique_common></bind_material></instance_geometry>",
        );
        assert_eq!(
            apply_collada_bind_material(
                &mut document,
                0,
                &instance,
                Some(&["red".to_string()]),
                &indices(&[("m0", 7)])
            ),
            0
        );
        assert_eq!(document.meshes[0].materials, [7]);
    }
}

mod apply_collada_material_overrides {
    use super::*;

    #[test]
    fn fills_unassigned_meshes_reuses_matching_assignments_and_clones_disagreeing_materials_with_the_same_geometry()
     {
        let mut document = document_with_mesh(vec![]);
        assert_eq!(
            apply_collada_material_overrides(
                &mut document,
                0,
                Some(&["red".to_string()]),
                &indices(&[("red", 3)])
            ),
            0
        );
        assert_eq!(document.meshes[0].materials, [3]);
        assert_eq!(document.meshes.len(), 1);
        let original_material_pointer = document.meshes[0].materials.as_ptr();
        assert_eq!(
            apply_collada_material_overrides(
                &mut document,
                0,
                Some(&["red".to_string()]),
                &indices(&[("red", 3)])
            ),
            0
        );
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(
            document.meshes[0].materials.as_ptr(),
            original_material_pointer
        );
        assert_eq!(
            apply_collada_material_overrides(
                &mut document,
                0,
                Some(&["red".to_string()]),
                &indices(&[("red", 9)])
            ),
            1
        );
        assert_eq!(document.meshes.len(), 2);
        assert_eq!(document.meshes[0].materials, [3]);
        assert_eq!(document.meshes[1].materials, [9]);
        assert!(Arc::ptr_eq(
            &document.meshes[0].geometry,
            &document.meshes[1].geometry
        ));
    }

    #[test]
    fn leaves_the_original_mesh_alone_when_no_primitive_symbol_resolves() {
        let mut document = document_with_mesh(vec![3]);
        assert_eq!(
            apply_collada_material_overrides(
                &mut document,
                0,
                Some(&["blue".to_string()]),
                &indices(&[("red", 9)])
            ),
            0
        );
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.meshes[0].materials, [3]);
    }
}

mod build_collada_node_world_matrices {
    use super::*;

    #[test]
    fn composes_parent_and_child_transforms_keeps_unreached_holes_and_reuses_output_without_mutating_retained_matrices()
     {
        let nodes = vec![
            node([10.0, 0.0, 0.0], vec![1]),
            node([0.0, 5.0, 0.0], vec![]),
            node([0.0; 3], vec![]),
        ];
        let mut out = Vec::with_capacity(8);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        build_collada_node_world_matrices(&mut out, &nodes, &[0]);
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].as_ref().unwrap().read().unwrap().m[12], 10.0);
        assert_eq!(out[1].as_ref().unwrap().read().unwrap().m[12], 10.0);
        assert_eq!(out[1].as_ref().unwrap().read().unwrap().m[13], 5.0);
        assert!(out[2].is_none());
        let retained = out[0].as_ref().unwrap().clone();
        build_collada_node_world_matrices(&mut out, &nodes, &[2, 99, -1]);
        assert!(out[0].is_none());
        assert!(out[1].is_none());
        assert!(out[2].is_some());
        assert_eq!(retained.read().unwrap().m[12], 10.0);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        build_collada_node_world_matrices(&mut out, &[], &[]);
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}

mod parse_collada_bind_material {
    use super::*;

    #[test]
    fn maps_bound_symbols_to_the_original_material_indices_and_replaces_duplicates_in_first_discovery_order()
     {
        let instance = element(
            "<instance_geometry><bind_material><technique_common><instance_material symbol=\"red\" target=\"#m0\"/><instance_material symbol=\"blue\" target=\"#m1\"/></technique_common></bind_material></instance_geometry>",
        );
        let found = parse_collada_bind_material(&instance, &indices(&[("m0", 0), ("m1", 4)]));
        assert_eq!(found, indices(&[("red", 0), ("blue", 4)]));
        let duplicate = element(
            "<instance_geometry><bind_material><technique_common><instance_material symbol=\"red\" target=\"#m0\"/><instance_material symbol=\"blue\" target=\"#m1\"/><instance_material symbol=\"red\" target=\"m1\"/></technique_common></bind_material></instance_geometry>",
        );
        assert_eq!(
            parse_collada_bind_material(&duplicate, &indices(&[("m0", 0), ("m1", 4)])),
            indices(&[("red", 4), ("blue", 4)])
        );
    }

    #[test]
    fn returns_an_empty_map_for_absent_bind_material_technique_or_unknown_targets() {
        assert!(parse_collada_bind_material(&element("<instance_geometry/>"), &[]).is_empty());
        assert!(
            parse_collada_bind_material(
                &element("<instance_geometry><bind_material/></instance_geometry>"),
                &[]
            )
            .is_empty()
        );
        let unknown = element(
            "<instance_geometry><bind_material><technique_common><instance_material symbol=\"red\" target=\"#nope\"/></technique_common></bind_material></instance_geometry>",
        );
        assert!(parse_collada_bind_material(&unknown, &indices(&[("m0", 0)])).is_empty());
    }
}

mod resolve_collada_primitive_symbols {
    use super::*;

    #[test]
    fn preserves_primitive_order_drops_unbound_symbols_and_clears_reused_outputs_for_absent_symbols_or_bindings()
     {
        let symbols = vec!["a".to_string(), "x".to_string(), "b".to_string()];
        let map = indices(&[("a", 1), ("b", 2)]);
        let mut out = Vec::with_capacity(8);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        resolve_collada_primitive_symbols(&mut out, Some(&symbols), &map);
        assert_eq!(out, [1, 2]);
        resolve_collada_primitive_symbols(&mut out, None, &indices(&[("a", 1)]));
        assert!(out.is_empty());
        resolve_collada_primitive_symbols(&mut out, Some(&["a".to_string()]), &[]);
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}
