//! Native receiver conveniences; only the public export lane receives sugar.
use crate::contract::*;
use flight_entity::{Float32Array, Ref};
use flight_geometry::{Aabb, Matrix4};
use flight_log::LogStateRef;
use flight_meshgeometry::{MeshGeometry, MeshSkinBindPose};
use flight_node::{NodeRef, contract::NodeRevisionState};
use flight_scene3d::{Node3DRef, Skeleton3D};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_geometry::{create_aabb, create_matrix4};
    use flight_meshgeometry::{
        CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, MeshGeometryOptions, create_mesh_geometry,
    };
    use flight_scene3d::{Node3DFields, Skin, create_mesh, create_node3d};
    use std::sync::{Arc, RwLock};
    fn revisions() -> NodeRevisionState {
        return NodeRevisionState {
            world_transform_revision: 0,
        };
    }
    fn guards() -> Skeleton3DGuardStateRef {
        return Arc::new(RwLock::new(Skeleton3DGuardState {
            enabled: false,
            bind_pose_guard: None,
        }));
    }
    fn node() -> Node3DRef {
        return Arc::new(RwLock::new(create_node3d::<Node3DFields>(None, None)));
    }
    fn geometry() -> MeshGeometry {
        let mut vertices = vec![0.0; 20].into_boxed_slice();
        vertices[0] = 1.0;
        vertices[4] = 1.0;
        vertices[6] = 1.0;
        vertices[9] = -1.0;
        vertices[16] = 1.0;
        return create_mesh_geometry(MeshGeometryOptions {
            vertices,
            layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone(),
            indices: None,
            subsets: None,
            topology: None,
        });
    }
    fn same_palettes(a: &Skeleton3D, b: &Skeleton3D) {
        assert_eq!(
            *a.inverse_bind_matrices.read().unwrap(),
            *b.inverse_bind_matrices.read().unwrap()
        );
        assert_eq!(
            *a.joint_matrices.read().unwrap(),
            *b.joint_matrices.read().unwrap()
        );
        assert_eq!(
            *a.normal_matrices.read().unwrap(),
            *b.normal_matrices.read().unwrap()
        );
        assert_eq!(a.names, b.names);
    }
    #[test]
    fn skeleton_receivers_match_free_construction_clone_palette_bind_lookup_validation_and_disposal()
     {
        let joint = node();
        let mut a = Skeleton3D::new(
            Arc::new(RwLock::new(vec![joint.clone()])),
            None,
            &mut revisions(),
            &guards(),
        );
        a.names = Some(vec!["root".to_string()]);
        let mut b = create_skeleton3d(
            Arc::new(RwLock::new(vec![joint.clone()])),
            None,
            &mut revisions(),
            &guards(),
        );
        b.names = Some(vec!["root".to_string()]);
        same_palettes(&a, &b);
        joint.write().unwrap().node3d_fields_mut().position.x = 3.0;
        let erased: NodeRef = joint;
        flight_node::invalidate_node_local_transform(&erased);
        a.compute_joint_matrices(&mut revisions());
        compute_skeleton3d_joint_matrices(&mut b, &mut revisions());
        same_palettes(&a, &b);
        same_palettes(&a.clone_skeleton(), &clone_skeleton3d(&b));
        assert_eq!(a.equals(&b), equals_skeleton3d(&a, &b));
        assert_eq!(
            a.joint_index_by_name("root"),
            get_skeleton3d_joint_index_by_name(&b, "root")
        );
        let mut ma = create_matrix4();
        let mut mb = create_matrix4();
        assert_eq!(
            a.joint_world_matrix(&mut ma, 0, &mut revisions()),
            get_skeleton3d_joint_world_matrix(&mut mb, &b, 0, &mut revisions())
        );
        assert_eq!(ma.m, mb.m);
        assert_eq!(
            a.joint_world_matrix_by_name(&mut ma, "root", &mut revisions()),
            get_skeleton3d_joint_world_matrix_by_name(&mut mb, &b, "root", &mut revisions())
        );
        assert_eq!(ma.m, mb.m);
        a.set_bind_pose(&mut revisions(), &guards());
        set_skeleton3d_bind_pose(&mut b, &mut revisions(), &guards());
        same_palettes(&a, &b);
        assert_eq!(a.validate(), validate_skeleton3d(&b));
        let ca = a.clone_joint_hierarchy(Arc::new(|_, _| node()));
        let cb = clone_skeleton3d_joint_hierarchy(&b, Arc::new(|_, _| node()));
        same_palettes(&ca, &cb);
        assert_eq!(
            ca.joints.read().unwrap().len(),
            cb.joints.read().unwrap().len()
        );
        a.dispose();
        dispose_skeleton3d(&mut b);
        assert!(a.joints.read().unwrap().is_empty());
        assert_eq!(
            a.joints.read().unwrap().len(),
            b.joints.read().unwrap().len()
        );
        assert_eq!(a.names, b.names);
    }
    #[test]
    fn geometry_and_bind_pose_receivers_match_free_skinning_and_deform_input_refresh() {
        let mut a = geometry();
        let mut b = geometry();
        let mut pa = a.capture_skin_bind_pose();
        let mut pb = capture_mesh_skin_bind_pose(&b);
        assert_eq!(pa.positions, pb.positions);
        let mut skeleton = create_skeleton3d(
            Arc::new(RwLock::new(vec![node()])),
            None,
            &mut revisions(),
            &guards(),
        );
        compute_skeleton3d_joint_matrices(&mut skeleton, &mut revisions());
        a.skin(&skeleton, &mut pa);
        skin_mesh_geometry(&mut b, &skeleton, &mut pb);
        assert_eq!(a.vertices, b.vertices);
        assert_eq!(a.version, b.version);
        a.vertices[0] = 5.0;
        b.vertices[0] = 5.0;
        pa.update_deform_input(&a);
        update_mesh_skin_bind_pose_deform_input(&mut pb, &b);
        assert_eq!(pa.positions, pb.positions);
        assert_eq!(pa.joints, pb.joints);
    }
    #[test]
    fn bounds_and_numeric_buffer_receivers_match_free_palette_operations() {
        let geometry = geometry();
        let mut pose = capture_mesh_skin_bind_pose(&geometry);
        let mut free = capture_mesh_skin_bind_pose(&geometry);
        let mut skeleton = create_skeleton3d(
            Arc::new(RwLock::new(vec![node()])),
            None,
            &mut revisions(),
            &guards(),
        );
        compute_skeleton3d_joint_matrices(&mut skeleton, &mut revisions());
        let mut a = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let mut b = create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        a.skin_conservative_bounds(&pose, &skeleton);
        get_mesh_skin_conservative_bounds(&mut b, &free, &skeleton);
        assert_eq!(a, b);
        a.skin_exact_bounds(&mut pose, &skeleton);
        get_mesh_skin_exact_bounds(&mut b, &mut free, &skeleton);
        assert_eq!(a, b);
        let mut ta = [0.0; 4];
        let mut tb = [0.0; 4];
        ta.skin_tangents(
            &pose.tangents,
            &pose.joints,
            &pose.weights,
            &skeleton.joint_matrices.read().unwrap(),
        );
        skin_tangents(
            &mut tb,
            &free.tangents,
            &free.joints,
            &free.weights,
            &skeleton.joint_matrices.read().unwrap(),
        );
        assert_eq!(ta, tb);
        let mut pa = [0.0; 3];
        let mut pb = [0.0; 3];
        let mut na = [0.0; 3];
        let mut nb = [0.0; 3];
        pa.skin_vertices(
            &mut na,
            &pose.positions,
            &pose.normals,
            &pose.joints,
            &pose.weights,
            &skeleton.joint_matrices.read().unwrap(),
            &skeleton.normal_matrices.read().unwrap(),
        );
        skin_vertices(
            &mut pb,
            &mut nb,
            &free.positions,
            &free.normals,
            &free.joints,
            &free.weights,
            &skeleton.joint_matrices.read().unwrap(),
            &skeleton.normal_matrices.read().unwrap(),
        );
        assert_eq!(pa, pb);
        assert_eq!(na, nb);
    }
    #[test]
    fn node_receivers_match_free_skin_deformation_and_read_only_preparation() {
        let a = create_mesh(
            Arc::new(RwLock::new(geometry())),
            Arc::new(RwLock::new(Vec::new())),
            None,
            None,
        );
        let b = create_mesh(
            Arc::new(RwLock::new(geometry())),
            Arc::new(RwLock::new(Vec::new())),
            None,
            None,
        );
        let joint = node();
        let skin = Arc::new(RwLock::new(Skin {
            skeleton: Arc::new(RwLock::new(create_skeleton3d(
                Arc::new(RwLock::new(vec![joint.clone()])),
                None,
                &mut revisions(),
                &guards(),
            ))),
            skeleton_root: None,
        }));
        a.write().unwrap().skin = Some(skin.clone());
        b.write().unwrap().skin = Some(skin);
        joint.write().unwrap().node3d_fields_mut().position.y = 5.0;
        let joint: NodeRef = joint;
        flight_node::invalidate_node_local_transform(&joint);
        let ar: NodeRef = a.clone();
        let br: NodeRef = b.clone();
        ar.update_skin(&mut revisions());
        update_mesh_skin(&br, &mut revisions());
        assert_eq!(
            a.read().unwrap().geometry.read().unwrap().vertices,
            b.read().unwrap().geometry.read().unwrap().vertices
        );
        ar.update_deformation(&mut revisions());
        update_mesh_deformation(&br, &mut revisions());
        assert_eq!(
            a.read().unwrap().geometry.read().unwrap().vertices,
            b.read().unwrap().geometry.read().unwrap().vertices
        );
        ar.prepare_skinning(&mut revisions());
        prepare_mesh_skinning(&br, &mut revisions());
        ar.prepare_scene_skinning(&mut revisions());
        prepare_scene3d_skinning(&br, &mut revisions());
        assert_eq!(
            flight_scene3d::contract::get_mesh_runtime(&a.read().unwrap()).deformed_local_bounds,
            flight_scene3d::contract::get_mesh_runtime(&b.read().unwrap()).deformed_local_bounds
        );
    }
    #[test]
    fn guard_receivers_match_free_flags_and_removal() {
        let a = guards();
        let b = guards();
        let log = Arc::new(RwLock::new(flight_log::create_log_state()));
        a.enable(&log, Arc::new(|| 0.0));
        enable_skeleton3d_guards(&b, &log, Arc::new(|| 0.0));
        assert_eq!(a.are_enabled(), are_skeleton3d_guards_enabled(&b));
        a.disable();
        disable_skeleton3d_guards(&b);
        assert_eq!(a.are_enabled(), are_skeleton3d_guards_enabled(&b));
        assert!(a.read().unwrap().bind_pose_guard.is_none());
        assert!(b.read().unwrap().bind_pose_guard.is_none());
    }
}

pub trait Skeleton3DMethods {
    fn new(
        joints: Ref<Vec<Node3DRef>>,
        inverse_bind_matrices: Option<Ref<Box<Float32Array>>>,
        revisions: &mut NodeRevisionState,
        guards: &Skeleton3DGuardStateRef,
    ) -> Self;
    fn clone_joint_hierarchy(&self, clone_joint: Skeleton3DJointCloner) -> Skeleton3D;
    fn clone_skeleton(&self) -> Skeleton3D;
    fn compute_joint_matrices(&mut self, revisions: &mut NodeRevisionState);
    fn dispose(&mut self);
    fn equals(&self, other: &Skeleton3D) -> bool;
    fn joint_index_by_name(&self, name: &str) -> i32;
    fn joint_world_matrix(
        &self,
        out: &mut Matrix4,
        index: i32,
        revisions: &mut NodeRevisionState,
    ) -> bool;
    fn joint_world_matrix_by_name(
        &self,
        out: &mut Matrix4,
        name: &str,
        revisions: &mut NodeRevisionState,
    ) -> bool;
    fn set_bind_pose(
        &mut self,
        revisions: &mut NodeRevisionState,
        guards: &Skeleton3DGuardStateRef,
    );
    fn validate(&self) -> Option<Skeleton3DValidationDiagnostic>;
}
pub trait Skeleton3DNodeMethods {
    fn prepare_scene_skinning(&self, revisions: &mut NodeRevisionState);
    fn prepare_skinning(&self, revisions: &mut NodeRevisionState);
    fn update_deformation(&self, revisions: &mut NodeRevisionState);
    fn update_skin(&self, revisions: &mut NodeRevisionState);
}
pub trait MeshGeometrySkinMethods {
    fn capture_skin_bind_pose(&self) -> MeshSkinBindPose;
    fn skin(&mut self, skeleton: &Skeleton3D, bind_pose: &mut MeshSkinBindPose);
}
pub trait MeshSkinBindPoseMethods {
    fn update_deform_input(&mut self, geometry: &MeshGeometry);
}
pub trait MeshSkinBoundsMethods {
    fn skin_conservative_bounds(&mut self, bind_pose: &MeshSkinBindPose, skeleton: &Skeleton3D);
    fn skin_exact_bounds(&mut self, bind_pose: &mut MeshSkinBindPose, skeleton: &Skeleton3D);
}
pub trait SkinBufferMethods {
    fn skin_tangents(
        &mut self,
        tangents: &Float32Array,
        joints: &[f32],
        weights: &Float32Array,
        joint_matrices: &Float32Array,
    );
    fn skin_vertices(
        &mut self,
        out_normals: &mut Float32Array,
        positions: &Float32Array,
        normals: &Float32Array,
        joints: &[f32],
        weights: &Float32Array,
        joint_matrices: &Float32Array,
        normal_matrices: &Float32Array,
    );
}
pub trait Skeleton3DGuardMethods {
    fn are_enabled(&self) -> bool;
    fn disable(&self);
    fn enable(&self, log: &LogStateRef, clock: Skeleton3DGuardClock);
}
impl Skeleton3DMethods for Skeleton3D {
    fn new(
        joints: Ref<Vec<Node3DRef>>,
        inverse_bind_matrices: Option<Ref<Box<Float32Array>>>,
        revisions: &mut NodeRevisionState,
        guards: &Skeleton3DGuardStateRef,
    ) -> Self {
        return create_skeleton3d(joints, inverse_bind_matrices, revisions, guards);
    }
    fn clone_joint_hierarchy(&self, clone_joint: Skeleton3DJointCloner) -> Skeleton3D {
        return clone_skeleton3d_joint_hierarchy(self, clone_joint);
    }
    fn clone_skeleton(&self) -> Skeleton3D {
        return clone_skeleton3d(self);
    }
    fn compute_joint_matrices(&mut self, revisions: &mut NodeRevisionState) {
        compute_skeleton3d_joint_matrices(self, revisions);
    }
    fn dispose(&mut self) {
        dispose_skeleton3d(self);
    }
    fn equals(&self, other: &Skeleton3D) -> bool {
        return equals_skeleton3d(self, other);
    }
    fn joint_index_by_name(&self, name: &str) -> i32 {
        return get_skeleton3d_joint_index_by_name(self, name);
    }
    fn joint_world_matrix(
        &self,
        out: &mut Matrix4,
        index: i32,
        revisions: &mut NodeRevisionState,
    ) -> bool {
        return get_skeleton3d_joint_world_matrix(out, self, index, revisions);
    }
    fn joint_world_matrix_by_name(
        &self,
        out: &mut Matrix4,
        name: &str,
        revisions: &mut NodeRevisionState,
    ) -> bool {
        return get_skeleton3d_joint_world_matrix_by_name(out, self, name, revisions);
    }
    fn set_bind_pose(
        &mut self,
        revisions: &mut NodeRevisionState,
        guards: &Skeleton3DGuardStateRef,
    ) {
        set_skeleton3d_bind_pose(self, revisions, guards);
    }
    fn validate(&self) -> Option<Skeleton3DValidationDiagnostic> {
        return validate_skeleton3d(self);
    }
}
impl Skeleton3DNodeMethods for NodeRef {
    fn prepare_scene_skinning(&self, revisions: &mut NodeRevisionState) {
        prepare_scene3d_skinning(self, revisions);
    }
    fn prepare_skinning(&self, revisions: &mut NodeRevisionState) {
        prepare_mesh_skinning(self, revisions);
    }
    fn update_deformation(&self, revisions: &mut NodeRevisionState) {
        update_mesh_deformation(self, revisions);
    }
    fn update_skin(&self, revisions: &mut NodeRevisionState) {
        update_mesh_skin(self, revisions);
    }
}
impl MeshGeometrySkinMethods for MeshGeometry {
    fn capture_skin_bind_pose(&self) -> MeshSkinBindPose {
        return capture_mesh_skin_bind_pose(self);
    }
    fn skin(&mut self, skeleton: &Skeleton3D, bind_pose: &mut MeshSkinBindPose) {
        skin_mesh_geometry(self, skeleton, bind_pose);
    }
}
impl MeshSkinBindPoseMethods for MeshSkinBindPose {
    fn update_deform_input(&mut self, geometry: &MeshGeometry) {
        update_mesh_skin_bind_pose_deform_input(self, geometry);
    }
}
impl MeshSkinBoundsMethods for Aabb {
    fn skin_conservative_bounds(&mut self, bind_pose: &MeshSkinBindPose, skeleton: &Skeleton3D) {
        get_mesh_skin_conservative_bounds(self, bind_pose, skeleton);
    }
    fn skin_exact_bounds(&mut self, bind_pose: &mut MeshSkinBindPose, skeleton: &Skeleton3D) {
        get_mesh_skin_exact_bounds(self, bind_pose, skeleton);
    }
}
impl SkinBufferMethods for [f32] {
    fn skin_tangents(
        &mut self,
        tangents: &Float32Array,
        joints: &[f32],
        weights: &Float32Array,
        joint_matrices: &Float32Array,
    ) {
        skin_tangents(self, tangents, joints, weights, joint_matrices);
    }
    fn skin_vertices(
        &mut self,
        out_normals: &mut Float32Array,
        positions: &Float32Array,
        normals: &Float32Array,
        joints: &[f32],
        weights: &Float32Array,
        joint_matrices: &Float32Array,
        normal_matrices: &Float32Array,
    ) {
        skin_vertices(
            self,
            out_normals,
            positions,
            normals,
            joints,
            weights,
            joint_matrices,
            normal_matrices,
        );
    }
}
impl Skeleton3DGuardMethods for Skeleton3DGuardStateRef {
    fn are_enabled(&self) -> bool {
        return are_skeleton3d_guards_enabled(self);
    }
    fn disable(&self) {
        disable_skeleton3d_guards(self);
    }
    fn enable(&self, log: &LogStateRef, clock: Skeleton3DGuardClock) {
        enable_skeleton3d_guards(self, log, clock);
    }
}
