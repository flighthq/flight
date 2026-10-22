use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::{Ref, UnknownValue};
use flight_materials::material3d::create_material3d;
use flight_materials::{Material3D, STANDARD_MATERIAL_KIND};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_node::{NodeRef, add_node_child};
use flight_registry::KindMap;
use flight_render::*;
use flight_scene3d::{INSTANCED_MESH_KIND, MESH_KIND, MeshMaterials, NODE3D_KIND, create_mesh};

use crate::support::NOOP_RENDERER;

fn material_table(kinds: &[&str]) -> KindMap<UnknownValue> {
    return KindMap {
        entries: kinds
            .iter()
            .map(|kind| ((*kind).to_string(), Arc::new(()) as UnknownValue))
            .collect::<HashMap<_, _>>(),
        key_order: kinds.iter().map(|kind| (*kind).to_string()).collect(),
    };
}

fn material(kind: &str) -> Ref<dyn Material3D> {
    return Arc::new(RwLock::new(create_material3d(kind.to_string())));
}

fn mesh(materials: Vec<Option<Ref<dyn Material3D>>>) -> NodeRef {
    let geometry = Arc::new(RwLock::new(create_box_mesh_geometry(None, None, None)));
    let materials: MeshMaterials = Arc::new(RwLock::new(materials));
    return create_mesh(geometry, materials, None, None);
}

fn node3d_root() -> NodeRef {
    return flight_scene3d::create_scene3d(None).root;
}

mod explain_scene_3d_pipeline_coverage {
    use super::*;

    #[test]
    fn scene3d_coverage_uses_standard_material_for_null_slot() {
        let mut state = create_render_state();
        register_node_renderer(&mut state, MESH_KIND.to_string(), &NOOP_RENDERER);
        let table = material_table(&[STANDARD_MATERIAL_KIND]);
        let result = explain_scene_3d_pipeline_coverage(&state, &mesh(vec![None]), Some(&table));
        assert_eq!(result.used_material_kinds, vec![STANDARD_MATERIAL_KIND]);
        assert_eq!(
            result.registered_material_kinds,
            vec![STANDARD_MATERIAL_KIND]
        );
        assert!(result.uncovered_material_kinds.is_empty());
    }

    #[test]
    fn scene3d_coverage_reports_uncovered_custom_material() {
        let mut state = create_render_state();
        register_node_renderer(&mut state, MESH_KIND.to_string(), &NOOP_RENDERER);
        let table = material_table(&[STANDARD_MATERIAL_KIND]);
        let result = explain_scene_3d_pipeline_coverage(
            &state,
            &mesh(vec![Some(material("PhongMaterial"))]),
            Some(&table),
        );
        assert_eq!(result.used_material_kinds, vec!["PhongMaterial"]);
        assert_eq!(result.uncovered_material_kinds, vec!["PhongMaterial"]);
        assert_eq!(
            result.unused_material_registrations,
            vec![STANDARD_MATERIAL_KIND]
        );
    }

    #[test]
    fn scene3d_coverage_handles_absent_material_renderer_table() {
        let state = create_render_state();
        let result =
            explain_scene_3d_pipeline_coverage::<_, UnknownValue>(&state, &mesh(vec![None]), None);
        assert_eq!(result.used_material_kinds, vec![STANDARD_MATERIAL_KIND]);
        assert!(result.registered_material_kinds.is_empty());
        assert_eq!(
            result.uncovered_material_kinds,
            vec![STANDARD_MATERIAL_KIND]
        );
    }

    #[test]
    fn scene3d_coverage_reports_unused_node_registrations() {
        let mut state = create_render_state();
        register_node_renderer(&mut state, MESH_KIND.to_string(), &NOOP_RENDERER);
        register_node_renderer(&mut state, INSTANCED_MESH_KIND.to_string(), &NOOP_RENDERER);
        let table = material_table(&[STANDARD_MATERIAL_KIND]);
        let result = explain_scene_3d_pipeline_coverage(&state, &node3d_root(), Some(&table));
        assert_eq!(result.used_kinds, vec![NODE3D_KIND]);
        assert_eq!(result.uncovered_kinds, vec![NODE3D_KIND]);
        assert_eq!(
            result.unused_registrations,
            vec![INSTANCED_MESH_KIND, MESH_KIND]
        );
        assert!(result.used_material_kinds.is_empty());
    }

    #[test]
    fn scene3d_coverage_collects_mixed_tree_dimensions() {
        let mut state = create_render_state();
        register_node_renderer(&mut state, MESH_KIND.to_string(), &NOOP_RENDERER);
        register_node_renderer(&mut state, NODE3D_KIND.to_string(), &NOOP_RENDERER);
        let table = material_table(&[STANDARD_MATERIAL_KIND, "PhongMaterial"]);
        let root = node3d_root();
        add_node_child(&root, &mesh(vec![None]));
        add_node_child(&root, &mesh(vec![Some(material("PhongMaterial"))]));
        let result = explain_scene_3d_pipeline_coverage(&state, &root, Some(&table));
        assert_eq!(result.used_kinds, vec![MESH_KIND, NODE3D_KIND]);
        assert_eq!(
            result.used_material_kinds,
            vec!["PhongMaterial", STANDARD_MATERIAL_KIND]
        );
        assert!(result.uncovered_kinds.is_empty());
        assert!(result.uncovered_material_kinds.is_empty());
    }

    #[test]
    fn scene3d_coverage_returns_sorted_stable_arrays() {
        let mut state = create_render_state();
        for kind in [MESH_KIND, INSTANCED_MESH_KIND, NODE3D_KIND] {
            register_node_renderer(&mut state, kind.to_string(), &NOOP_RENDERER);
        }
        let table = material_table(&["ZebraMaterial", "AlphaMaterial", STANDARD_MATERIAL_KIND]);
        let root = node3d_root();
        add_node_child(&root, &mesh(vec![Some(material("ZebraMaterial")), None]));
        let result = explain_scene_3d_pipeline_coverage(&state, &root, Some(&table));
        assert_eq!(
            result.registered_kinds,
            vec![INSTANCED_MESH_KIND, MESH_KIND, NODE3D_KIND]
        );
        assert_eq!(
            result.registered_material_kinds,
            vec!["AlphaMaterial", STANDARD_MATERIAL_KIND, "ZebraMaterial"]
        );
        assert_eq!(
            result.used_material_kinds,
            vec![STANDARD_MATERIAL_KIND, "ZebraMaterial"]
        );
        assert_eq!(result.unused_registrations, vec![INSTANCED_MESH_KIND]);
        assert_eq!(result.unused_material_registrations, vec!["AlphaMaterial"]);
    }
}
