use crate::support::*;
use flight_node::{add_node_child, invalidate_node_local_transform};
use flight_scene3d::contract::*;
mod get_node3d_world_bounds {
    use super::*;
    #[test]
    fn writes_an_empty_box_for_bare_nodes_and_group_only_subtrees() {
        let root = as_node_ref(&node3d());
        let mut out = empty_bounds();
        get_node3d_world_bounds(&mut out, &root, &mut revision_state());
        assert_eq!(out.min.x, f32::INFINITY);
        assert_eq!(out.max.x, f32::NEG_INFINITY);
        add_node_child(&root, &as_node_ref(&node3d()));
        add_node_child(&root, &as_node_ref(&node3d()));
        get_node3d_world_bounds(&mut out, &root, &mut revision_state());
        assert_eq!(out.min.x, f32::INFINITY);
    }
    #[test]
    fn transforms_a_single_box_and_reuses_an_existing_out_box() {
        let mesh = test_mesh();
        let node = as_node_ref(&mesh);
        let mut out = empty_bounds();
        let mut state = revision_state();
        get_node3d_world_bounds(&mut out, &node, &mut state);
        for v in [out.min.x, out.min.y, out.min.z] {
            close(v, -0.5);
        }
        for v in [out.max.x, out.max.y, out.max.z] {
            close(v, 0.5);
        }
        mesh.write().unwrap().position.x = 10.0;
        invalidate_node_local_transform(&node);
        get_node3d_world_bounds(&mut out, &node, &mut state);
        close(out.min.x, 9.5);
        close(out.max.x, 10.5);
    }
    #[test]
    fn accumulates_children_recursively_and_includes_disabled_nodes() {
        let root = as_node_ref(&node3d());
        let a = test_mesh();
        let b = test_mesh();
        let group = as_node_ref(&node3d());
        a.write().unwrap().position.x = -5.0;
        b.write().unwrap().position.x = 5.0;
        b.write().unwrap().enabled = false;
        let ar = as_node_ref(&a);
        let br = as_node_ref(&b);
        invalidate_node_local_transform(&ar);
        invalidate_node_local_transform(&br);
        add_node_child(&root, &ar);
        add_node_child(&group, &br);
        add_node_child(&root, &group);
        let mut out = empty_bounds();
        get_node3d_world_bounds(&mut out, &root, &mut revision_state());
        close(out.min.x, -5.5);
        close(out.max.x, 5.5);
        b.write().unwrap().position.x = 3.0;
        invalidate_node_local_transform(&br);
        get_node3d_world_bounds(&mut out, &group, &mut revision_state());
        close(out.min.x, 2.5);
        close(out.max.x, 3.5);
    }
}
