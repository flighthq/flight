use crate::support::*;
use flight_meshgeometry::contract::*;
use flight_node::add_node_child;
use flight_scene3d::contract::*;
use std::sync::{Arc, RwLock};
fn morphed_mesh(delta: [f32; 3], weight: f32) -> flight_entity::Ref<Mesh> {
    let g = create_mesh_geometry(MeshGeometryOptions {
        vertices: vec![0.0; 12].into_boxed_slice(),
        layout: CANONICAL_MESH_GEOMETRY_LAYOUT.clone(),
        indices: None,
        subsets: None,
        topology: None,
    });
    let m = create_mesh(Arc::new(RwLock::new(g)), empty_materials(), None, None);
    m.write().unwrap().morph = Some(Arc::new(RwLock::new(MeshMorph {
        targets: Arc::new(vec![MeshMorphTarget {
            position_deltas: delta.to_vec().into_boxed_slice(),
            normal_deltas: None,
            tangent_deltas: None,
        }]),
        weights: vec![weight].into_boxed_slice(),
    })));
    return m;
}
mod prepare_scene3d_morph {
    use super::*;
    #[test]
    fn blends_every_morphed_mesh_recursively_and_dirty_gates_settled_weights() {
        let scene = as_node_ref(&node3d());
        let a = morphed_mesh([1.0, 0.0, 0.0], 1.0);
        let b = morphed_mesh([0.0, 2.0, 0.0], 1.0);
        let group = as_node_ref(&node3d());
        add_node_child(&group, &as_node_ref(&b));
        add_node_child(&scene, &as_node_ref(&a));
        add_node_child(&scene, &group);
        prepare_scene3d_morph(&scene);
        assert_eq!(a.read().unwrap().geometry.read().unwrap().vertices[0], 1.0);
        assert_eq!(b.read().unwrap().geometry.read().unwrap().vertices[1], 2.0);
        let v = a.read().unwrap().geometry.read().unwrap().version;
        prepare_scene3d_morph(&scene);
        assert_eq!(a.read().unwrap().geometry.read().unwrap().version, v);
    }
    #[test]
    fn skips_whole_disabled_subtrees_and_leaves_rigid_geometry_alone() {
        let scene = as_node_ref(&node3d());
        let disabled = node3d();
        disabled.write().unwrap().enabled = false;
        let mesh = morphed_mesh([5.0, 0.0, 0.0], 1.0);
        add_node_child(&as_node_ref(&disabled), &as_node_ref(&mesh));
        add_node_child(&scene, &as_node_ref(&disabled));
        let rigid = test_mesh();
        let version = rigid.read().unwrap().geometry.read().unwrap().version;
        add_node_child(&scene, &as_node_ref(&rigid));
        prepare_scene3d_morph(&scene);
        assert_eq!(
            mesh.read().unwrap().geometry.read().unwrap().vertices[0],
            0.0
        );
        assert_eq!(
            rigid.read().unwrap().geometry.read().unwrap().version,
            version
        );
    }
}
