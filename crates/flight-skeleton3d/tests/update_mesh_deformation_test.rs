use crate::support::*;
use flight_meshgeometry::{MeshMorph, MeshMorphTarget};
use flight_node::{NodeRef, invalidate_node_local_transform};
use flight_skeleton3d::*;
use std::sync::{Arc, RwLock};
fn morph() -> flight_entity::Ref<MeshMorph> {
    return Arc::new(RwLock::new(MeshMorph {
        targets: Arc::new(vec![MeshMorphTarget {
            position_deltas: vec![2.0, 0.0, 0.0].into_boxed_slice(),
            normal_deltas: None,
            tangent_deltas: None,
        }]),
        weights: vec![1.0].into_boxed_slice(),
    }));
}
mod update_mesh_deformation {
    use super::*;
    #[test]
    fn unchanged_morph_weights_with_a_moving_joint_reuse_morph_input_instead_of_accumulating_skinning()
     {
        let mesh = skinned_mesh();
        mesh.write().unwrap().morph = Some(morph());
        let joint = joint(0.0, 0.0, 0.0);
        bind(&mesh, joint.clone());
        joint.write().unwrap().position.y = 5.0;
        let joint_ref: NodeRef = joint.clone();
        invalidate_node_local_transform(&joint_ref);
        let geometry = mesh.read().unwrap().geometry.clone();
        let node: NodeRef = mesh.clone();
        let initial_version = geometry.read().unwrap().version;
        update_mesh_deformation(&node);
        assert_eq!(&geometry.read().unwrap().vertices[..3], &[3.0, 5.0, 0.0]);
        assert_eq!(geometry.read().unwrap().version, initial_version + 2);
        let pose = flight_meshgeometry::get_mesh_geometry_skin_bind_pose(&geometry.read().unwrap())
            .unwrap()
            .clone();
        let input_pointer = pose.read().unwrap().positions.as_ptr();
        joint.write().unwrap().position.y = 2.0;
        invalidate_node_local_transform(&joint_ref);
        let version = geometry.read().unwrap().version;
        update_mesh_deformation(&node);
        assert_eq!(&geometry.read().unwrap().vertices[..3], &[3.0, 2.0, 0.0]);
        assert_eq!(geometry.read().unwrap().version, version + 1);
        assert!(Arc::ptr_eq(
            &pose,
            flight_meshgeometry::get_mesh_geometry_skin_bind_pose(&geometry.read().unwrap())
                .unwrap()
        ));
        assert_eq!(pose.read().unwrap().positions.as_ptr(), input_pointer);
        assert_eq!(pose.read().unwrap().positions.as_ref(), &[3.0, 0.0, 0.0]);
        update_mesh_deformation(&node);
        assert_eq!(&geometry.read().unwrap().vertices[..3], &[3.0, 2.0, 0.0]);
    }
    #[test]
    fn recomposes_changed_morph_weights_before_skinning_on_every_changed_frame() {
        let mesh = skinned_mesh();
        let morph = morph();
        mesh.write().unwrap().morph = Some(morph.clone());
        let joint = joint(0.0, 0.0, 0.0);
        bind(&mesh, joint.clone());
        joint.write().unwrap().position.y = 5.0;
        let joint: NodeRef = joint;
        invalidate_node_local_transform(&joint);
        let geometry = mesh.read().unwrap().geometry.clone();
        let node: NodeRef = mesh;
        update_mesh_deformation(&node);
        assert_eq!(&geometry.read().unwrap().vertices[..3], &[3.0, 5.0, 0.0]);
        morph.write().unwrap().weights[0] = 3.0;
        update_mesh_deformation(&node);
        assert_eq!(&geometry.read().unwrap().vertices[..3], &[7.0, 5.0, 0.0]);
    }
    #[test]
    fn preserves_standalone_morph_only_and_skin_only_composition() {
        let mesh = skinned_mesh();
        mesh.write().unwrap().geometry.write().unwrap().vertices[0] = 0.0;
        mesh.write().unwrap().morph = Some(morph());
        let geometry = mesh.read().unwrap().geometry.clone();
        let node: NodeRef = mesh;
        update_mesh_deformation(&node);
        assert_eq!(geometry.read().unwrap().vertices[0], 2.0);
        let mesh = skinned_mesh();
        let joint = joint(0.0, 0.0, 0.0);
        bind(&mesh, joint.clone());
        joint.write().unwrap().position.y = 2.0;
        let joint: NodeRef = joint;
        invalidate_node_local_transform(&joint);
        let geometry = mesh.read().unwrap().geometry.clone();
        let node: NodeRef = mesh;
        update_mesh_deformation(&node);
        assert_eq!(geometry.read().unwrap().vertices[1], 2.0);
    }
}
