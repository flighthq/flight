use crate::support::*;
use flight_geometry::{Matrix4, create_frustum, create_matrix4};
use flight_node::{add_node_child, invalidate_node_local_transform};
use flight_scene3d::contract::*;
use std::sync::Arc;
fn view_projection() -> Matrix4 {
    let mut m = create_matrix4();
    let near = 0.1;
    let far = 100.0;
    m.m[0] = 1.0;
    m.m[5] = 1.0;
    m.m[10] = (far + near) / (near - far);
    m.m[11] = -1.0;
    m.m[14] = (2.0 * far * near) / (near - far);
    m.m[15] = 0.0;
    return m;
}
mod build_scene3d_frustum {
    use super::*;
    #[test]
    fn writes_six_nonzero_camera_frustum_planes() {
        let mut f = create_frustum();
        build_scene3d_frustum(&mut f, &view_projection());
        for p in [&f.near, &f.far, &f.left, &f.right, &f.top, &f.bottom] {
            assert!((p.a * p.a + p.b * p.b + p.c * p.c).sqrt() > 0.0);
        }
    }
}
mod cull_node3d_by_frustum {
    use super::*;
    #[test]
    fn leaves_empty_roots_empty_and_appends_only_in_frustum_meshes() {
        let root = as_node_ref(&node3d());
        let mut f = create_frustum();
        build_scene3d_frustum(&mut f, &view_projection());
        let mut out = Vec::new();
        let mut state = revision_state();
        cull_node3d_by_frustum(&mut out, &root, &f, &mut state);
        assert!(out.is_empty());
        let visible = test_mesh();
        visible.write().unwrap().position.z = -5.0;
        let v = as_node_ref(&visible);
        invalidate_node_local_transform(&v);
        add_node_child(&root, &v);
        let behind = test_mesh();
        behind.write().unwrap().position.z = 50.0;
        let b = as_node_ref(&behind);
        invalidate_node_local_transform(&b);
        add_node_child(&root, &b);
        let existing = as_node_ref(&node3d());
        out.push(existing.clone());
        cull_node3d_by_frustum(&mut out, &root, &f, &mut state);
        assert_eq!(out.len(), 2);
        assert!(Arc::ptr_eq(&out[0], &existing));
        assert!(Arc::ptr_eq(&out[1], &v));
        assert!(!out.iter().any(|n| Arc::ptr_eq(n, &b)));
    }
    #[test]
    fn skips_disabled_nodes_and_their_whole_subtrees() {
        let root = as_node_ref(&node3d());
        let parent = node3d();
        parent.write().unwrap().enabled = false;
        let p = as_node_ref(&parent);
        let mesh = test_mesh();
        mesh.write().unwrap().position.z = -5.0;
        let m = as_node_ref(&mesh);
        invalidate_node_local_transform(&m);
        add_node_child(&p, &m);
        add_node_child(&root, &p);
        let mut f = create_frustum();
        build_scene3d_frustum(&mut f, &view_projection());
        let mut out = Vec::new();
        cull_node3d_by_frustum(&mut out, &root, &f, &mut revision_state());
        assert!(out.is_empty());
    }
}
