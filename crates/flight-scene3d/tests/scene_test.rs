use crate::support::*;
use flight_node::contract::*;
use flight_scene3d::contract::*;
use std::sync::Arc;
mod create_scene3d {
    use super::*;
    #[test]
    fn owns_a_fresh_identity_root_and_empty_document_sidecars() {
        let scene = create_scene3d(None);
        let root = as_node_ref(&scene.root);
        let n = scene.root.read().unwrap();
        assert_eq!(n.kind, NODE3D_KIND);
        assert!(n.enabled);
        assert!(n.name.is_none());
        assert!(get_node3d_runtime(&*n).transform3d.world_matrix4.is_none());
        drop(n);
        assert!(scene.animations.is_empty());
        assert!(scene.metadata.is_none());
        assert!(scene.resources.is_empty());
        assert_eq!(get_node_child_count(&root), 0);
        let m = get_node_local_matrix4(&root);
        for i in [0, 5, 10, 15] {
            assert_eq!(m.m[i], 1.0);
        }
        let child = as_node_ref(&node3d());
        add_node_child(&root, &child);
        assert!(Arc::ptr_eq(&get_node_root(&child), &root));
        assert_eq!(get_node_child_count(&root), 1);
    }
    #[test]
    fn passes_partial_initial_values_to_the_root() {
        let scene = create_scene3d(Some(&PartialNode {
            enabled: Some(false),
            name: Some("world".to_string()),
        }));
        assert!(!scene.root.read().unwrap().enabled);
        assert_eq!(scene.root.read().unwrap().name.as_deref(), Some("world"));
    }
}
mod initialize_scene3d {
    use super::*;
    #[test]
    fn resets_sidecars_and_replaces_root_while_preserving_scene_entity_uid() {
        let mut scene = create_scene3d(None);
        let old = scene.root.clone();
        flight_entity::set_entity_uid(&mut scene, "kept".to_string());
        initialize_scene3d(&mut scene, None);
        assert_eq!(flight_entity::get_entity_uid(&mut scene), "kept");
        assert!(!Arc::ptr_eq(&old, &scene.root));
        assert!(scene.animations.is_empty());
        assert!(scene.metadata.is_none());
        assert!(scene.resources.is_empty());
    }
}
