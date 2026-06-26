//! Skeleton: inverse-bind matrices, skin palette, and joint [`NodeId`]s.
//!
//! A skin is an ordered set of joint (bone) nodes plus their inverse-bind matrices, and the
//! computed skin palette the renderer (or a CPU skinner) consumes. Joints are ordinary world
//! nodes in the scene hierarchy — they are animated like any node — so the skeleton itself owns
//! only the skinning math, not a second hierarchy.
//!
//! `inverse_bind_matrices` and `joint_matrices` are flat column-major 4×4 blocks, 16 f32 per
//! joint, in joint order. `joint_matrices` is filled by [`compute_skeleton_joint_matrices`] each
//! frame (`world_matrix(j) * inverse_bind_matrices[j]` per joint) and uploaded as the bone
//! uniform; a vertex is deformed by the weighted sum of its joints' palette matrices.

use flighthq_geometry::{inverse_matrix4, multiply_matrix4};
use flighthq_node::{HierarchyArena, NodeId};
use flighthq_scene::{SceneArena, get_scene_node_world_matrix};
use flighthq_types::Matrix4Like;

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

/// A skin: an ordered set of joint (bone) nodes, their inverse-bind matrices, and the computed
/// skin palette the renderer consumes.
///
/// `inverse_bind_matrices` and `joint_matrices` are flat column-major 4×4 blocks, 16 f32 per
/// joint, in joint order.
pub struct Skeleton {
    /// Flat column-major inverse-bind matrices, 16 f32 per joint. Set by
    /// [`set_skeleton_bind_pose`].
    pub inverse_bind_matrices: Vec<f32>,
    /// Flat column-major joint (skin palette) matrices, 16 f32 per joint. Output of
    /// [`compute_skeleton_joint_matrices`].
    pub joint_matrices: Vec<f32>,
    /// Joint node IDs (bone nodes in the scene hierarchy), in joint order.
    pub joints: Vec<NodeId>,
}

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Recomputes the skin palette from the joints' current world transforms:
/// `joint_matrices[j] = world_matrix(j) * inverse_bind_matrices[j]`.
///
/// Call once per frame, after the joint nodes' transforms are up to date (for example after the
/// scene prepare walk), then upload `joint_matrices` as the bone uniform.
pub fn compute_skeleton_joint_matrices(
    skeleton: &mut Skeleton,
    world_arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
) {
    for j in 0..skeleton.joints.len() {
        let joint_id = skeleton.joints[j];
        let base = j * 16;

        // Clone the world matrix so the arena borrow ends before writing to skeleton.
        let world = {
            let w = get_scene_node_world_matrix(world_arena, hierarchy, joint_id);
            Matrix4Like { m: w.m }
        };

        // Read inverse-bind into scratch to avoid aliasing if out == source.
        let mut inv_bind = Matrix4Like::default();
        inv_bind
            .m
            .copy_from_slice(&skeleton.inverse_bind_matrices[base..base + 16]);

        let mut result = Matrix4Like::default();
        multiply_matrix4(&mut result, &world, &inv_bind);
        skeleton.joint_matrices[base..base + 16].copy_from_slice(&result.m);
    }
}

/// Allocates a [`Skeleton`] over `joints`.
///
/// `inverse_bind_matrices` (flat, 16 column-major f32 per joint, e.g. from a glTF accessor) may
/// be supplied; when `None`, the inverse-bind matrices are captured from the joints' current world
/// matrices via [`set_skeleton_bind_pose`] (the current pose becomes the rest pose).
/// `joint_matrices` is allocated as an all-zero palette buffer.
pub fn create_skeleton(
    joints: Vec<NodeId>,
    inverse_bind_matrices: Option<Vec<f32>>,
    world_arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
) -> Skeleton {
    let count = joints.len();
    let bind_given = inverse_bind_matrices.is_some();
    let mut skeleton = Skeleton {
        inverse_bind_matrices: inverse_bind_matrices.unwrap_or_else(|| vec![0.0_f32; count * 16]),
        joint_matrices: vec![0.0_f32; count * 16],
        joints,
    };
    if !bind_given {
        set_skeleton_bind_pose(&mut skeleton, world_arena, hierarchy);
    }
    skeleton
}

/// Captures the joints' current world matrices as the bind pose by storing each one's inverse
/// into `inverse_bind_matrices`. After this, [`compute_skeleton_joint_matrices`] yields identity
/// until a joint moves.
pub fn set_skeleton_bind_pose(
    skeleton: &mut Skeleton,
    world_arena: &mut SceneArena,
    hierarchy: &HierarchyArena,
) {
    for j in 0..skeleton.joints.len() {
        let joint_id = skeleton.joints[j];

        // Clone the world matrix so the arena borrow ends before writing to skeleton.
        let world = {
            let w = get_scene_node_world_matrix(world_arena, hierarchy, joint_id);
            Matrix4Like { m: w.m }
        };

        let mut result = Matrix4Like::default();
        inverse_matrix4(&mut result, &world);

        let base = j * 16;
        skeleton.inverse_bind_matrices[base..base + 16].copy_from_slice(&result.m);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_node::{HierarchyNode, add_node_child};
    use flighthq_scene::{SceneArena, create_scene_node};

    fn new_arenas() -> (HierarchyArena, SceneArena) {
        (HierarchyArena::new(), SceneArena::new())
    }

    // Insert aligned nodes into both arenas so their NodeIds match.
    fn create_test_node(hierarchy: &mut HierarchyArena, world_arena: &mut SceneArena) -> NodeId {
        let h = hierarchy.insert(HierarchyNode::default());
        let w = create_scene_node(world_arena, None);
        assert_eq!(h, w, "key alignment required");
        h
    }

    // create_skeleton

    #[test]
    fn create_skeleton_with_none_captures_bind_pose() {
        let (mut hierarchy, mut world_arena) = new_arenas();
        let joint = create_test_node(&mut hierarchy, &mut world_arena);

        // Identity local matrix — bind pose is identity, so inverse-bind should be identity.
        let skeleton = create_skeleton(vec![joint], None, &mut world_arena, &hierarchy);

        // inverse_bind_matrices[0] (m00) should be 1.0 (identity diagonal).
        assert!(
            (skeleton.inverse_bind_matrices[0] - 1.0).abs() < 1e-5,
            "m00 should be ~1.0, got {}",
            skeleton.inverse_bind_matrices[0]
        );
        assert_eq!(skeleton.joints.len(), 1);
        assert_eq!(skeleton.joint_matrices.len(), 16);
        assert_eq!(skeleton.inverse_bind_matrices.len(), 16);
    }

    // set_skeleton_bind_pose

    #[test]
    fn set_skeleton_bind_pose_identity_when_joint_has_identity_local_matrix() {
        let (mut hierarchy, mut world_arena) = new_arenas();
        let joint = create_test_node(&mut hierarchy, &mut world_arena);

        // Start with explicit zero bind matrices; then capture the (identity) bind pose.
        let mut skeleton = Skeleton {
            inverse_bind_matrices: vec![0.0_f32; 16],
            joint_matrices: vec![0.0_f32; 16],
            joints: vec![joint],
        };
        set_skeleton_bind_pose(&mut skeleton, &mut world_arena, &hierarchy);

        // Inverse of identity is identity: diagonal = 1, off-diagonal = 0.
        let m = &skeleton.inverse_bind_matrices;
        assert!((m[0] - 1.0).abs() < 1e-5, "m00={}", m[0]);
        assert!((m[5] - 1.0).abs() < 1e-5, "m11={}", m[5]);
        assert!((m[10] - 1.0).abs() < 1e-5, "m22={}", m[10]);
        assert!((m[15] - 1.0).abs() < 1e-5, "m33={}", m[15]);
        assert!(m[12].abs() < 1e-5, "tx={}", m[12]);
        assert!(m[13].abs() < 1e-5, "ty={}", m[13]);
        assert!(m[14].abs() < 1e-5, "tz={}", m[14]);
    }

    // compute_skeleton_joint_matrices

    #[test]
    fn compute_skeleton_joint_matrices_identity_matrices_yields_identity() {
        let (mut hierarchy, mut world_arena) = new_arenas();
        let joint = create_test_node(&mut hierarchy, &mut world_arena);

        // Joint at identity; bind pose captured from identity world matrix.
        let mut skeleton = create_skeleton(vec![joint], None, &mut world_arena, &hierarchy);

        compute_skeleton_joint_matrices(&mut skeleton, &mut world_arena, &hierarchy);

        // joint_matrices should be identity.
        let m = &skeleton.joint_matrices;
        assert!((m[0] - 1.0).abs() < 1e-5, "m00={}", m[0]);
        assert!((m[5] - 1.0).abs() < 1e-5, "m11={}", m[5]);
        assert!((m[10] - 1.0).abs() < 1e-5, "m22={}", m[10]);
        assert!((m[15] - 1.0).abs() < 1e-5, "m33={}", m[15]);
        assert!(m[12].abs() < 1e-5, "tx={}", m[12]);
        assert!(m[13].abs() < 1e-5, "ty={}", m[13]);
        assert!(m[14].abs() < 1e-5, "tz={}", m[14]);
    }

    #[test]
    fn compute_skeleton_joint_matrices_encodes_delta_from_bind_pose() {
        let (mut hierarchy, mut world_arena) = new_arenas();

        // Two aligned nodes: parent and child.
        let parent_h = hierarchy.insert(HierarchyNode::default());
        let parent_w = create_scene_node(&mut world_arena, None);
        assert_eq!(parent_h, parent_w, "key alignment required");

        let child_h = hierarchy.insert(HierarchyNode::default());
        let child_w = create_scene_node(&mut world_arena, None);
        assert_eq!(child_h, child_w, "key alignment required");

        add_node_child(&mut hierarchy, parent_h, child_h);

        // Bind pose: parent at tx=5, child inherits that world position.
        world_arena[parent_w].local_matrix.m[12] = 5.0;
        let mut skeleton = create_skeleton(vec![child_w], None, &mut world_arena, &hierarchy);

        // Move child +3 in y relative to parent (parent unchanged).
        // get_scene_node_world_matrix always recomputes from local_matrix, so no cache
        // invalidation is needed.
        world_arena[child_w].local_matrix.m[13] = 3.0;

        compute_skeleton_joint_matrices(&mut skeleton, &mut world_arena, &hierarchy);

        // x delta should be ~0 (no change along x from bind), y delta ~3.
        assert!(
            skeleton.joint_matrices[12].abs() < 1e-5,
            "x delta should be ~0.0, got {}",
            skeleton.joint_matrices[12]
        );
        assert!(
            (skeleton.joint_matrices[13] - 3.0).abs() < 1e-5,
            "y delta should be ~3.0, got {}",
            skeleton.joint_matrices[13]
        );
    }
}
