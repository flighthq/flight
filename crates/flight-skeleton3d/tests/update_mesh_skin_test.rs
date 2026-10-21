use crate::support::*;
use flight_meshgeometry::contract::{
    ensure_mesh_geometry_bounds, get_mesh_geometry_skin_bind_pose,
};
use flight_node::{NodeRef, invalidate_node_local_transform};
use flight_skeleton3d::*;
use std::sync::Arc;
mod update_mesh_skin {
    use super::*;
    #[test]
    fn standalone_skin_update_still_refreshes_from_freshly_written_morph_geometry() {
        let mesh = skinned_mesh();
        let morph = Arc::new(std::sync::RwLock::new(flight_meshgeometry::MeshMorph {
            targets: Arc::new(vec![flight_meshgeometry::MeshMorphTarget {
                position_deltas: vec![2.0, 0.0, 0.0].into_boxed_slice(),
                normal_deltas: None,
                tangent_deltas: None,
            }]),
            weights: vec![1.0].into_boxed_slice(),
        }));
        mesh.write().unwrap().morph = Some(morph.clone());
        let joint = joint(0.0, 0.0, 0.0);
        bind(&mesh, joint.clone());
        joint.write().unwrap().position.y = 5.0;
        let joint: NodeRef = joint;
        invalidate_node_local_transform(&joint);
        let geometry = mesh.read().unwrap().geometry.clone();
        let node: NodeRef = mesh.clone();
        flight_scene3d::update_mesh_morph(&mesh.read().unwrap());
        update_mesh_skin(&node, &mut revisions());
        assert_eq!(&geometry.read().unwrap().vertices[..3], &[3.0, 5.0, 0.0]);
        morph.write().unwrap().weights[0] = 3.0;
        flight_scene3d::update_mesh_morph(&mesh.read().unwrap());
        update_mesh_skin(&node, &mut revisions());
        assert_eq!(&geometry.read().unwrap().vertices[..3], &[7.0, 5.0, 0.0]);
    }
    #[test]
    fn lazily_captures_bind_pose_and_deforms_versions_and_dirty_bounds() {
        let mesh = skinned_mesh();
        let joint = joint(0.0, 0.0, 0.0);
        bind(&mesh, joint.clone());
        joint.write().unwrap().position.y = 5.0;
        let joint: NodeRef = joint;
        invalidate_node_local_transform(&joint);
        let geometry = mesh.read().unwrap().geometry.clone();
        let version = geometry.read().unwrap().version;
        assert!(get_mesh_geometry_skin_bind_pose(&geometry.read().unwrap()).is_none());
        let node: NodeRef = mesh;
        update_mesh_skin(&node, &mut revisions());
        let mut geometry = geometry.write().unwrap();
        close(geometry.vertices[1], 5.0);
        assert_eq!(geometry.version, version + 1);
        let bounds = ensure_mesh_geometry_bounds(&mut geometry).unwrap();
        close(bounds.min.y, 5.0);
        close(bounds.max.y, 5.0);
        assert!(get_mesh_geometry_skin_bind_pose(&geometry).is_some());
    }
    #[test]
    fn reuses_the_actual_captured_bind_pose_across_frames_without_accumulating_skin_only_pose() {
        let mesh = skinned_mesh();
        let joint = joint(0.0, 0.0, 0.0);
        bind(&mesh, joint.clone());
        joint.write().unwrap().position.y = 5.0;
        let joint: NodeRef = joint;
        invalidate_node_local_transform(&joint);
        let geometry = mesh.read().unwrap().geometry.clone();
        let node: NodeRef = mesh;
        update_mesh_skin(&node, &mut revisions());
        let first = get_mesh_geometry_skin_bind_pose(&geometry.read().unwrap())
            .unwrap()
            .clone();
        update_mesh_skin(&node, &mut revisions());
        assert!(Arc::ptr_eq(
            &first,
            get_mesh_geometry_skin_bind_pose(&geometry.read().unwrap()).unwrap()
        ));
        assert_eq!(geometry.read().unwrap().vertices[1], 5.0);
    }
    #[test]
    fn leaves_unskinned_geometry_version_and_cache_untouched() {
        let mesh = skinned_mesh();
        let geometry = mesh.read().unwrap().geometry.clone();
        let before = geometry.read().unwrap().version;
        let node: NodeRef = mesh;
        update_mesh_skin(&node, &mut revisions());
        assert_eq!(geometry.read().unwrap().version, before);
        assert!(get_mesh_geometry_skin_bind_pose(&geometry.read().unwrap()).is_none());
    }
}
