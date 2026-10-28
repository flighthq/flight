use flight_entity::Ref;
use flight_meshgeometry::{MeshGeometryOptions, create_mesh_geometry};
use flight_node::{NodeRef, add_node_child};
use flight_scene3d::{
    Mesh, Node3DFields, Node3DRef, Skeleton3D, Skin, create_mesh, create_node3d, create_scene3d,
    publish_node3d,
};
use flight_scene3d_formats::*;
use flight_skeleton3d::{Skeleton3DGuardState, create_skeleton3d, dispose_skeleton3d};
use std::sync::{Arc, RwLock};

fn create_test_joint() -> Node3DRef {
    return publish_node3d(create_node3d::<Node3DFields>(None));
}

fn create_test_mesh(skeleton: Option<Ref<Skeleton3D>>) -> Ref<Mesh> {
    let geometry = create_mesh_geometry(MeshGeometryOptions {
        vertices: Vec::new().into_boxed_slice(),
        layout: CANONICAL_LAYOUT.clone(),
        indices: None,
        subsets: None,
        topology: None,
    });
    let mesh = create_mesh(
        Arc::new(RwLock::new(geometry)),
        Arc::new(RwLock::new(Vec::new())),
    );
    mesh.write().unwrap().skin = skeleton.map(|skeleton| {
        Arc::new(RwLock::new(Skin {
            skeleton,
            skeleton_root: None,
        }))
    });
    return mesh;
}

fn create_test_skeleton(joints: Ref<Vec<Node3DRef>>) -> Ref<Skeleton3D> {
    let count = joints.read().unwrap().len();
    return Arc::new(RwLock::new(create_skeleton3d(
        joints,
        Some(Arc::new(RwLock::new(
            vec![0.0; count * 16].into_boxed_slice(),
        ))),
        &Arc::new(RwLock::new(Skeleton3DGuardState {
            enabled: false,
            bind_pose_guard: None,
        })),
    )));
}

mod find_scene3d_skeleton_joints {
    use super::*;

    #[test]
    fn returns_the_skin_joint_array_itself_and_shares_mutation_and_disposal() {
        let scene = create_scene3d();
        let joint0 = create_test_joint();
        let joint1 = create_test_joint();
        let joints = Arc::new(RwLock::new(vec![joint0.clone(), joint1.clone()]));
        let skeleton = create_test_skeleton(joints.clone());
        let mesh = create_test_mesh(Some(skeleton.clone()));
        add_node_child(&(scene.root.clone() as NodeRef), &(mesh as NodeRef));
        let found = find_scene3d_skeleton_joints(&scene.root).unwrap();
        assert!(Arc::ptr_eq(&found, &skeleton.read().unwrap().joints));
        assert!(Arc::ptr_eq(&found, &joints));
        assert!(Arc::ptr_eq(&found.read().unwrap()[0], &joint0));
        assert!(Arc::ptr_eq(&found.read().unwrap()[1], &joint1));
        found.write().unwrap().remove(0);
        assert!(Arc::ptr_eq(&joints.read().unwrap()[0], &joint1));
        joints.write().unwrap().push(joint0.clone());
        assert!(Arc::ptr_eq(&found.read().unwrap()[1], &joint0));
        dispose_skeleton3d(&mut skeleton.write().unwrap());
        assert!(found.read().unwrap().is_empty());
        assert!(joints.read().unwrap().is_empty());
    }

    #[test]
    fn returns_none_when_the_scene_has_no_skinned_mesh() {
        let scene = create_scene3d();
        let mesh = create_test_mesh(None);
        add_node_child(&(scene.root.clone() as NodeRef), &(mesh as NodeRef));
        assert!(find_scene3d_skeleton_joints(&scene.root).is_none());
        assert!(find_scene3d_skeleton_joints(&create_test_joint()).is_none());
    }

    #[test]
    fn traverses_children_lifo_depth_first_and_excludes_the_root_itself() {
        let root_joints = Arc::new(RwLock::new(vec![create_test_joint()]));
        let first_joints = Arc::new(RwLock::new(Vec::new()));
        let last_joints = Arc::new(RwLock::new(vec![create_test_joint()]));
        let root: Node3DRef = create_test_mesh(Some(create_test_skeleton(root_joints)));
        assert!(find_scene3d_skeleton_joints(&root).is_none());
        let first = create_test_mesh(Some(create_test_skeleton(first_joints.clone())));
        let last = create_test_joint();
        let nested = create_test_mesh(Some(create_test_skeleton(last_joints.clone())));
        add_node_child(&(root.clone() as NodeRef), &(first as NodeRef));
        add_node_child(&(root.clone() as NodeRef), &(last.clone() as NodeRef));
        add_node_child(&(last as NodeRef), &(nested.clone() as NodeRef));
        assert!(Arc::ptr_eq(
            &find_scene3d_skeleton_joints(&root).unwrap(),
            &last_joints
        ));
        nested.write().unwrap().skin = None;
        assert!(Arc::ptr_eq(
            &find_scene3d_skeleton_joints(&root).unwrap(),
            &first_joints
        ));
    }
}
