use crate::support::*;
use flight_entity::Ref;
use flight_materials::{Material3D, create_standard_pbr_material};
use flight_node::{add_node_child, get_node_child_count, get_node_children};
use flight_scene3d::contract::*;
use std::sync::{Arc, Mutex, RwLock};
mod clone_node3d_subtree {
    use super::*;
    #[test]
    fn clones_plain_nodes_fields_and_children_in_original_order() {
        let root = node3d();
        {
            let mut n = root.write().unwrap();
            n.name = Some("root".to_string());
            n.position.x = 5.0;
            n.position.y = 10.0;
            n.position.z = 15.0;
            n.alpha = 0.5;
            n.visible = false;
        }
        let a = node3d();
        a.write().unwrap().name = Some("a".to_string());
        let b = test_mesh();
        b.write().unwrap().name = Some("b".to_string());
        let grandchild = node3d();
        grandchild.write().unwrap().name = Some("grandchild".to_string());
        add_node_child(&as_node_ref(&a), &as_node_ref(&grandchild));
        add_node_child(&as_node_ref(&root), &as_node_ref(&a));
        add_node_child(&as_node_ref(&root), &as_node_ref(&b));
        let clone = clone_node3d_subtree(&as_node_ref(&root), None);
        assert!(!Arc::ptr_eq(&clone, &as_node_ref(&root)));
        let guard = clone.read().unwrap();
        let f = guard.as_any().downcast_ref::<Node3DFields>().unwrap();
        assert_eq!(f.name.as_deref(), Some("root"));
        assert_eq!(
            (f.position.x, f.position.y, f.position.z),
            (5.0, 10.0, 15.0)
        );
        assert_eq!(f.alpha, 0.5);
        assert!(!f.visible);
        drop(guard);
        assert_eq!(get_node_child_count(&clone), 2);
        let children = get_node_children(&clone);
        assert_eq!(
            children[0].read().unwrap().node_fields().name.as_deref(),
            Some("a")
        );
        assert_eq!(
            children[1].read().unwrap().node_fields().name.as_deref(),
            Some("b")
        );
        assert!(is_mesh(&Some(Arc::new(children[1].clone()))));
        assert_eq!(get_node_child_count(&children[0]), 1);
        assert_eq!(
            get_node_children(&children[0])[0]
                .read()
                .unwrap()
                .node_fields()
                .name
                .as_deref(),
            Some("grandchild")
        );
    }
    #[test]
    fn shares_rigid_mesh_geometry_and_passes_original_materials_to_capturable_override() {
        let first: Ref<dyn Material3D> = Arc::new(RwLock::new(create_standard_pbr_material(None)));
        let second: Ref<dyn Material3D> = Arc::new(RwLock::new(create_standard_pbr_material(None)));
        let replacement: Ref<dyn Material3D> =
            Arc::new(RwLock::new(create_standard_pbr_material(None)));
        let mesh = create_mesh(
            test_geometry(),
            Arc::new(RwLock::new(vec![
                Some(first.clone()),
                Some(second.clone()),
                None,
            ])),
            None,
            None,
        );
        mesh.write().unwrap().name = Some("box".to_string());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let expected = replacement.clone();
        let clone = clone_node3d_subtree(
            &as_node_ref(&mesh),
            Some(Arc::new(move |m| {
                sink.lock().unwrap().push(m);
                return Some(expected.clone());
            })),
        );
        assert!(is_mesh(&Some(Arc::new(clone.clone()))));
        let c = clone.read().unwrap();
        let c = c.as_any().downcast_ref::<Mesh>().unwrap();
        assert_eq!(c.name.as_deref(), Some("box"));
        assert!(Arc::ptr_eq(&c.geometry, &mesh.read().unwrap().geometry));
        for m in c.materials.read().unwrap().iter() {
            assert!(Arc::ptr_eq(m.as_ref().unwrap(), &replacement));
        }
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 3);
        assert!(Arc::ptr_eq(seen[0].as_ref().unwrap(), &first));
        assert!(Arc::ptr_eq(seen[1].as_ref().unwrap(), &second));
        assert!(seen[2].is_none());
    }
}
