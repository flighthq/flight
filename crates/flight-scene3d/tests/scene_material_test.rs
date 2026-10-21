use crate::support::*;
use flight_entity::Ref;
use flight_materials::contract::{
    Material3D, create_blinn_phong_material, create_standard_pbr_material,
};
use flight_node::add_node_child;
use flight_scene3d::contract::*;
use std::sync::{Arc, RwLock};
fn phong(name: Option<&str>) -> Ref<dyn Material3D> {
    let mut m = create_blinn_phong_material(None);
    m.name = name.map(str::to_string);
    return Arc::new(RwLock::new(m));
}
mod find_scene3d_material_by_name {
    use super::*;
    #[test]
    fn finds_original_named_descendant_and_skips_null_and_anonymous_materials() {
        let material = phong(Some("canopy"));
        let root = as_node_ref(&node3d());
        let mesh = create_mesh(
            test_geometry(),
            Arc::new(RwLock::new(vec![
                None,
                Some(phong(None)),
                Some(material.clone()),
            ])),
            None,
            None,
        );
        add_node_child(&root, &as_node_ref(&mesh));
        assert!(Arc::ptr_eq(
            &find_scene3d_material_by_name(&root, "canopy").unwrap(),
            &material
        ));
        assert!(find_scene3d_material_by_name(&root, "fuselage").is_none());
        let anonymous = as_node_ref(&create_mesh(
            test_geometry(),
            Arc::new(RwLock::new(vec![Some(phong(None))])),
            None,
            None,
        ));
        assert!(find_scene3d_material_by_name(&anonymous, "canopy").is_none());
    }
    #[test]
    fn searches_nested_descendants_and_includes_root_before_later_matches() {
        let first = phong(Some("shared"));
        let second = phong(Some("shared"));
        let root = create_mesh(
            test_geometry(),
            Arc::new(RwLock::new(vec![Some(first.clone())])),
            None,
            None,
        );
        let group = as_node_ref(&node3d());
        let other = create_mesh(
            test_geometry(),
            Arc::new(RwLock::new(vec![Some(second)])),
            None,
            None,
        );
        add_node_child(&group, &as_node_ref(&other));
        add_node_child(&as_node_ref(&root), &group);
        assert!(Arc::ptr_eq(
            &find_scene3d_material_by_name(&as_node_ref(&root), "shared").unwrap(),
            &first
        ));
        let deep: Ref<dyn Material3D> = Arc::new(RwLock::new(create_standard_pbr_material(None)));
        deep.write().unwrap().material3d_fields_mut().name = Some("deep".to_string());
        other
            .write()
            .unwrap()
            .materials
            .write()
            .unwrap()
            .push(Some(deep.clone()));
        assert!(Arc::ptr_eq(
            &find_scene3d_material_by_name(&as_node_ref(&root), "deep").unwrap(),
            &deep
        ));
    }
}
mod get_scene3d_materials {
    use super::*;
    #[test]
    fn collects_original_heterogeneous_refs_in_preorder_and_deduplicates_against_existing_out() {
        let shared = phong(None);
        let other: Ref<dyn Material3D> = Arc::new(RwLock::new(create_standard_pbr_material(None)));
        let root = create_mesh(
            test_geometry(),
            Arc::new(RwLock::new(vec![Some(shared.clone())])),
            None,
            None,
        );
        let group = as_node_ref(&node3d());
        let child = create_mesh(
            test_geometry(),
            Arc::new(RwLock::new(vec![
                None,
                Some(shared.clone()),
                Some(other.clone()),
            ])),
            None,
            None,
        );
        add_node_child(&group, &as_node_ref(&child));
        add_node_child(&as_node_ref(&root), &group);
        let mut out = Vec::new();
        get_scene3d_materials(&mut out, &as_node_ref(&root));
        assert_eq!(out.len(), 2);
        assert!(Arc::ptr_eq(&out[0], &shared));
        assert!(Arc::ptr_eq(&out[1], &other));
        assert!(
            out[1]
                .read()
                .unwrap()
                .as_any()
                .is::<flight_materials::StandardPbrMaterial>()
        );
        get_scene3d_materials(&mut out, &as_node_ref(&root));
        assert_eq!(out.len(), 2);
    }
    #[test]
    fn skips_null_slots_and_mesh_free_subtrees() {
        let root = as_node_ref(&node3d());
        let mut out = Vec::new();
        get_scene3d_materials(&mut out, &root);
        assert!(out.is_empty());
        let child = create_mesh(
            test_geometry(),
            Arc::new(RwLock::new(vec![None])),
            None,
            None,
        );
        add_node_child(&root, &as_node_ref(&child));
        get_scene3d_materials(&mut out, &root);
        assert!(out.is_empty());
    }
}
