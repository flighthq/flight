use std::sync::{Arc, RwLock};

use flight_materials::contract::{
    create_blinn_phong_material, create_standard_pbr_material, create_unlit_material,
};
use flight_node::{NodeRef, add_node_child};
use flight_scene3d::create_scene3d;
use flight_scene3d_resources::contract::*;

use crate::support::{
    add_scene_mesh, attach_texture, create_shared_texture, embedded_reference, mesh_of,
    same_reference, same_textures, scene_with, unlit_mesh,
};

mod get_scene3d_resource_textures {
    use super::*;

    #[test]
    fn finds_pending_textures_on_the_root_mesh_and_descendants() {
        let root_reference = embedded_reference(Some("image/png"));
        let child_reference = embedded_reference(Some("image/png"));
        let root_map = attach_texture(&root_reference);
        let child_map = attach_texture(&child_reference);
        let root = unlit_mesh(&root_map);
        let child = unlit_mesh(&child_map);
        let root_node: NodeRef = root.clone();
        let child_node: NodeRef = child.clone();
        add_node_child(&root_node, &child_node);
        let scene = scene_with(vec![root_reference.clone(), child_reference]);
        add_scene_mesh(&scene, &root);

        let mut out = Vec::new();
        let scene = scene.read().unwrap();
        get_scene3d_resource_textures(&mut out, &scene);
        assert!(out.iter().any(|texture| Arc::ptr_eq(texture, &root_map)));
        assert!(out.iter().any(|texture| Arc::ptr_eq(texture, &child_map)));
        assert_eq!(out.len(), 2);
        let found = get_scene3d_texture_resource_reference(&scene, &root_map).unwrap();
        assert!(same_reference(&found, &root_reference));
    }

    #[test]
    fn dedupes_a_texture_shared_across_meshes_and_materials() {
        let reference = embedded_reference(Some("image/png"));
        let shared = attach_texture(&reference);
        let scene = scene_with(vec![reference]);
        let mut unlit = create_unlit_material();
        unlit.base_color_map = Some(shared.clone());
        let mut standard = create_standard_pbr_material();
        standard.base_color_map = Some(shared.clone());
        let a = mesh_of(vec![Arc::new(RwLock::new(unlit)), Arc::new(RwLock::new(standard))]);
        let b = unlit_mesh(&shared);
        add_scene_mesh(&scene, &a);
        add_scene_mesh(&scene, &b);

        let mut out = Vec::new();
        get_scene3d_resource_textures(&mut out, &scene.read().unwrap());
        assert!(same_textures(&out, &[&shared]));
    }

    #[test]
    fn ignores_a_texture_that_carries_no_resource_reference_since_nothing_needs_fetching_for_it() {
        let bound = create_shared_texture();
        let reference = embedded_reference(Some("image/png"));
        let pending = attach_texture(&reference);
        let mut material = create_standard_pbr_material();
        material.base_color_map = Some(bound);
        material.normal_map = Some(pending.clone());
        let scene = scene_with(vec![reference]);
        add_scene_mesh(&scene, &mesh_of(vec![Arc::new(RwLock::new(material))]));

        let mut out = Vec::new();
        get_scene3d_resource_textures(&mut out, &scene.read().unwrap());
        assert!(same_textures(&out, &[&pending]));
    }

    #[test]
    fn finds_a_texture_on_any_material_kind_with_nothing_registered() {
        // Discovery reads the resource's own back-edge, so a kind with no lister (BlinnPhongMaterial
        // here, and every custom kind) is still found.
        let reference = embedded_reference(Some("image/png"));
        let map = attach_texture(&reference);
        let scene = scene_with(vec![reference]);
        let mut material = create_blinn_phong_material();
        material.specular_map = Some(map.clone());
        add_scene_mesh(&scene, &mesh_of(vec![Arc::new(RwLock::new(material))]));

        let mut out = Vec::new();
        get_scene3d_resource_textures(&mut out, &scene.read().unwrap());
        assert!(same_textures(&out, &[&map]));
    }

    #[test]
    fn returns_a_texture_whose_material_hangs_off_no_mesh_which_is_the_cost_of_dropping_the_registry() {
        let attached_reference = embedded_reference(Some("image/png"));
        let orphan_reference = embedded_reference(Some("image/png"));
        let attached = attach_texture(&attached_reference);
        let orphan = attach_texture(&orphan_reference);
        let scene = scene_with(vec![attached_reference, orphan_reference]);
        add_scene_mesh(&scene, &unlit_mesh(&attached));

        let mut out = Vec::new();
        get_scene3d_resource_textures(&mut out, &scene.read().unwrap());
        assert!(same_textures(&out, &[&attached, &orphan]));
    }

    #[test]
    fn clears_out_before_filling_it() {
        let reference = embedded_reference(Some("image/png"));
        let map = attach_texture(&reference);
        let scene = scene_with(vec![reference]);
        add_scene_mesh(&scene, &unlit_mesh(&map));
        let mut out = vec![create_shared_texture(), create_shared_texture()];
        get_scene3d_resource_textures(&mut out, &scene.read().unwrap());
        assert!(same_textures(&out, &[&map]));
    }
}

mod get_scene3d_texture_resource_reference {
    use super::*;

    #[test]
    fn returns_none_for_a_texture_outside_the_scene_resource_sidecar() {
        let scene = create_scene3d();
        assert!(get_scene3d_texture_resource_reference(&scene, &create_shared_texture()).is_none());
    }
}
