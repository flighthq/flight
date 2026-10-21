use crate::skin_vertices::{read_array, write_array};
use crate::{
    Skeleton3DBindPoseGuard, Skeleton3DGuardStateRef, Skeleton3DJointCloner,
    Skeleton3DValidationDiagnostic,
};
use flight_entity::{Float32Array, Ref, allocate_entity};
use flight_geometry::{
    Matrix4, copy_matrix4, create_matrix3, create_matrix4, inverse_matrix4, multiply_matrix4,
    set_matrix3_normal_from_matrix4,
};
use flight_node::contract::{NodeRevisionState, get_node_world_matrix4};
use flight_node::{NodeRef, add_node_child, get_node_parent};
use flight_scene3d::{Node3DRef, Skeleton3D};
use std::sync::{Arc, RwLock};

// flight-lint: allow(conform-params) D5 caller-owned canonical transform revisions and bind-pose guard replace TS module state
pub fn create_skeleton3d(
    joints: Vec<Node3DRef>,
    inverse_bind_matrices: Option<Ref<Box<Float32Array>>>,
    names: Option<Vec<String>>,
    revisions: &mut NodeRevisionState,
    guard_state: &Skeleton3DGuardStateRef,
) -> Skeleton3D {
    let count = joints.len();
    let capture = inverse_bind_matrices.is_none();
    let mut out: Skeleton3D = allocate_entity();
    initialize_skeleton3d(
        &mut out,
        inverse_bind_matrices
            .unwrap_or_else(|| Arc::new(RwLock::new(vec![0.0; count * 16].into_boxed_slice()))),
        Arc::new(RwLock::new(vec![0.0; count * 16].into_boxed_slice())),
        joints,
        names,
        Arc::new(RwLock::new(vec![0.0; count * 12].into_boxed_slice())),
    );
    if capture {
        set_skeleton3d_bind_pose(&mut out, revisions, guard_state);
    }
    return out;
}
pub fn initialize_skeleton3d(
    out: &mut Skeleton3D,
    inverse_bind_matrices: Ref<Box<Float32Array>>,
    joint_matrices: Ref<Box<Float32Array>>,
    joints: Vec<Node3DRef>,
    names: Option<Vec<String>>,
    normal_matrices: Ref<Box<Float32Array>>,
) {
    out.inverse_bind_matrices = inverse_bind_matrices;
    out.joint_matrices = joint_matrices;
    out.joints = joints;
    out.names = names;
    out.normal_matrices = normal_matrices;
}
pub fn clone_skeleton3d(skeleton: &Skeleton3D) -> Skeleton3D {
    let mut out: Skeleton3D = allocate_entity();
    initialize_skeleton3d(
        &mut out,
        Arc::new(RwLock::new(
            skeleton.inverse_bind_matrices.read().unwrap().clone(),
        )),
        Arc::new(RwLock::new(skeleton.joint_matrices.read().unwrap().clone())),
        skeleton.joints.clone(),
        skeleton.names.clone(),
        Arc::new(RwLock::new(
            skeleton.normal_matrices.read().unwrap().clone(),
        )),
    );
    return out;
}
pub fn clone_skeleton3d_joint_hierarchy(
    skeleton: &Skeleton3D,
    clone_joint: Skeleton3DJointCloner,
) -> Skeleton3D {
    let joints: Vec<Node3DRef> = skeleton
        .joints
        .iter()
        .enumerate()
        .map(|(index, joint)| clone_joint(joint, index))
        .collect();
    for (index, joint) in skeleton.joints.iter().enumerate() {
        let node: NodeRef = joint.clone();
        if let Some(parent) = get_node_parent(&node) {
            if let Some(parent_index) = skeleton.joints.iter().rposition(|candidate| {
                let candidate: NodeRef = candidate.clone();
                Arc::ptr_eq(&candidate, &parent)
            }) {
                let parent: NodeRef = joints[parent_index].clone();
                let child: NodeRef = joints[index].clone();
                add_node_child(&parent, &child);
            }
        }
    }
    let mut out: Skeleton3D = allocate_entity();
    initialize_skeleton3d(
        &mut out,
        Arc::new(RwLock::new(
            skeleton.inverse_bind_matrices.read().unwrap().clone(),
        )),
        Arc::new(RwLock::new(skeleton.joint_matrices.read().unwrap().clone())),
        joints,
        skeleton.names.clone(),
        Arc::new(RwLock::new(
            skeleton.normal_matrices.read().unwrap().clone(),
        )),
    );
    return out;
}
// flight-lint: allow(conform-params) D5 caller-owned canonical node revision source replaces TS semantic transform state
pub fn compute_skeleton3d_joint_matrices(
    skeleton: &mut Skeleton3D,
    revisions: &mut NodeRevisionState,
) {
    let mut inverse = create_matrix4();
    let mut result = create_matrix4();
    let mut normal = create_matrix3();
    for (j, joint) in skeleton.joints.iter().enumerate() {
        {
            let inverse_bind = skeleton.inverse_bind_matrices.read().unwrap();
            for i in 0..16 {
                inverse.m[i] = read_array(&inverse_bind, j * 16 + i);
            }
        }
        let node: NodeRef = joint.clone();
        multiply_matrix4(
            &mut result,
            &get_node_world_matrix4(&node, revisions),
            &inverse,
        );
        set_array_from(&skeleton.joint_matrices, &result.m, j * 16);
        set_matrix3_normal_from_matrix4(&mut normal, &result);
        let mut normal_palette = skeleton.normal_matrices.write().unwrap();
        for column in 0..3 {
            for row in 0..3 {
                write_array(
                    &mut normal_palette,
                    j * 12 + column * 4 + row,
                    normal.m[column * 3 + row],
                );
            }
            write_array(&mut normal_palette, j * 12 + column * 4 + 3, 0.0);
        }
    }
}
pub fn dispose_skeleton3d(skeleton: &mut Skeleton3D) {
    skeleton.joints.clear();
    skeleton.names = None;
}
pub fn equals_skeleton3d(a: &Skeleton3D, b: &Skeleton3D) -> bool {
    if std::ptr::eq(a, b) {
        return true;
    }
    if a.joints.len() != b.joints.len() {
        return false;
    }
    let a_inverse = a.inverse_bind_matrices.read().unwrap();
    let b_inverse = b.inverse_bind_matrices.read().unwrap();
    if a_inverse.len() != b_inverse.len() {
        return false;
    }
    for (a, b) in a_inverse.iter().zip(b_inverse.iter()) {
        if a != b {
            return false;
        }
    }
    return a.names == b.names;
}
pub fn get_skeleton3d_joint_index_by_name(skeleton: &Skeleton3D, name: &str) -> i32 {
    return skeleton
        .names
        .as_ref()
        .and_then(|names| names.iter().position(|value| value == name))
        .map(|index| index as i32)
        .unwrap_or(-1);
}
// flight-lint: allow(conform-params) D5 caller-owned canonical node transform revision source
pub fn get_skeleton3d_joint_world_matrix(
    out: &mut Matrix4,
    skeleton: &Skeleton3D,
    joint_index: i32,
    revisions: &mut NodeRevisionState,
) -> bool {
    if joint_index < 0 {
        return false;
    }
    let Some(joint) = skeleton.joints.get(joint_index as usize) else {
        return false;
    };
    let node: NodeRef = joint.clone();
    copy_matrix4(out, &get_node_world_matrix4(&node, revisions));
    return true;
}
// flight-lint: allow(conform-params) D5 caller-owned canonical node transform revision source
pub fn get_skeleton3d_joint_world_matrix_by_name(
    out: &mut Matrix4,
    skeleton: &Skeleton3D,
    name: &str,
    revisions: &mut NodeRevisionState,
) -> bool {
    return get_skeleton3d_joint_world_matrix(
        out,
        skeleton,
        get_skeleton3d_joint_index_by_name(skeleton, name),
        revisions,
    );
}
fn set_array_from(out: &Ref<Box<Float32Array>>, source: &[f32], offset: usize) {
    let length = out.read().unwrap().len();
    if offset > length || source.len() > length - offset {
        flight_entity::throw_range_error("offset is out of bounds");
    }
    out.write().unwrap()[offset..offset + source.len()].copy_from_slice(source);
}
// flight-lint: allow(conform-params) D5 caller-owned canonical node revisions and guard slot replace TS module state
pub fn set_skeleton3d_bind_pose(
    skeleton: &mut Skeleton3D,
    revisions: &mut NodeRevisionState,
    guard_state: &Skeleton3DGuardStateRef,
) {
    let mut result = create_matrix4();
    for j in 0..skeleton.joints.len() {
        let node: NodeRef = skeleton.joints[j].clone();
        if inverse_matrix4(&mut result, &get_node_world_matrix4(&node, revisions)) {
            set_array_from(&skeleton.inverse_bind_matrices, &result.m, j * 16);
        } else {
            result = create_matrix4();
            set_array_from(&skeleton.inverse_bind_matrices, &result.m, j * 16);
            let guard = guard_state.read().unwrap().bind_pose_guard.clone();
            if let Some(guard) = guard {
                guard(skeleton, j);
            }
        }
    }
}
// flight-lint: allow(conform-params) D5 caller-owned guard state replaces the TS module callback slot
pub fn set_skeleton3d_bind_pose_guard(
    guard_state: &Skeleton3DGuardStateRef,
    guard: Option<Skeleton3DBindPoseGuard>,
) {
    guard_state.write().unwrap().bind_pose_guard = guard;
}
pub fn validate_skeleton3d(skeleton: &Skeleton3D) -> Option<Skeleton3DValidationDiagnostic> {
    let joint_count = skeleton.joints.len();
    let actual = skeleton.inverse_bind_matrices.read().unwrap().len();
    let expected = joint_count * 16;
    if actual == expected {
        return None;
    }
    return Some(Skeleton3DValidationDiagnostic {
        joint_count,
        inverse_bind_matrices_length: actual,
        expected_inverse_bind_matrices_length: expected,
        message: format!(
            "Skeleton3D inverseBindMatrices length {actual} does not match jointCount {joint_count} * 16 = {expected}."
        ),
    });
}
