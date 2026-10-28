use crate::support::*;
use flight_meshgeometry::get_mesh_geometry_skin_bind_pose;
use flight_node::{NodeRef, add_node_child, invalidate_node_local_transform};
use flight_scene3d::contract::get_mesh_runtime;
use flight_skeleton3d::*;
mod prepare_mesh_skinning {
    use super::*;
    #[test]
    fn captures_read_only_bind_pose_and_poses_bounds_without_rewriting_or_versioning_vertices() {
        let mesh = skinned_mesh();
        let joint = joint(0.0, 0.0, 0.0);
        bind(&mesh, joint.clone());
        joint.write().unwrap().position.y = 5.0;
        let joint: NodeRef = joint;
        invalidate_node_local_transform(&joint);
        let geometry = mesh.read().unwrap().geometry.clone();
        let before = geometry.read().unwrap().version;
        let node: NodeRef = mesh.clone();
        prepare_mesh_skinning(&node);
        assert!(get_mesh_geometry_skin_bind_pose(&geometry.read().unwrap()).is_some());
        assert_eq!(geometry.read().unwrap().vertices[0], 1.0);
        assert_eq!(geometry.read().unwrap().vertices[1], 0.0);
        assert_eq!(geometry.read().unwrap().version, before);
        assert!(
            get_mesh_runtime(&mesh.read().unwrap())
                .deformed_local_bounds
                .as_ref()
                .unwrap()
                .max
                .y
                >= 5.0 - 0.000001
        );
    }
    #[test]
    fn leaves_rigid_mesh_runtime_empty_and_reuses_the_original_cached_bounds_storage() {
        let mesh = skinned_mesh();
        let node: NodeRef = mesh.clone();
        prepare_mesh_skinning(&node);
        assert!(
            get_mesh_runtime(&mesh.read().unwrap())
                .deformed_local_bounds
                .is_none()
        );
        bind(&mesh, joint(0.0, 0.0, 0.0));
        prepare_mesh_skinning(&node);
        let first = get_mesh_runtime(&mesh.read().unwrap())
            .deformed_local_bounds
            .as_ref()
            .unwrap() as *const _;
        prepare_mesh_skinning(&node);
        let second = get_mesh_runtime(&mesh.read().unwrap())
            .deformed_local_bounds
            .as_ref()
            .unwrap() as *const _;
        assert_eq!(first, second);
    }
    #[test]
    fn releases_the_original_mesh_lock_before_resolving_a_joint_that_is_the_mesh_itself() {
        let mesh = skinned_mesh();
        bind(&mesh, mesh.clone());
        let node: NodeRef = mesh.clone();
        prepare_mesh_skinning(&node);
        assert!(
            get_mesh_runtime(&mesh.read().unwrap())
                .deformed_local_bounds
                .is_some()
        );
    }
}
mod prepare_scene3d_skinning {
    use super::*;
    #[test]
    fn visits_custom_mesh_kinds_and_skips_disabled_subtrees_entirely() {
        let root: NodeRef = joint(0.0, 0.0, 0.0);
        let mesh = skinned_mesh();
        mesh.write().unwrap().kind = "customMesh".to_string();
        bind(&mesh, joint(0.0, 0.0, 0.0));
        let mesh_ref: NodeRef = mesh.clone();
        add_node_child(&root, &mesh_ref);
        let disabled = joint(0.0, 0.0, 0.0);
        disabled.write().unwrap().enabled = false;
        let disabled: NodeRef = disabled;
        let hidden = skinned_mesh();
        bind(&hidden, joint(0.0, 0.0, 0.0));
        let hidden_ref: NodeRef = hidden.clone();
        add_node_child(&disabled, &hidden_ref);
        add_node_child(&root, &disabled);
        prepare_scene3d_skinning(&root);
        assert!(
            get_mesh_runtime(&mesh.read().unwrap())
                .deformed_local_bounds
                .is_some()
        );
        assert!(
            get_mesh_runtime(&hidden.read().unwrap())
                .deformed_local_bounds
                .is_none()
        );
        assert!(
            get_mesh_geometry_skin_bind_pose(&hidden.read().unwrap().geometry.read().unwrap())
                .is_none()
        );
    }
}
