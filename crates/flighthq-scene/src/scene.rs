//! The 3D scene-graph root.
//!
//! A `Scene` is just a [`SceneNode`](crate::SceneNode) at the top of the
//! hierarchy — "what exists" — with no observer state of its own (the camera
//! and lights are draw-arguments, not scene members). It is a transform-only
//! group node; Mesh and bare `SceneNode` children attach to it with
//! `add_node_child`.
//!
//! Ports the TS `@flighthq/scene` `scene.ts`. (Distinct from `flighthq-node`'s
//! 2D `Scene` align/scale-mode descriptor; this is the 3D node family's root.)

use flighthq_node::NodeId;

use crate::scene_node::{SceneArena, create_scene_node};

/// Allocates a Scene root node in `arena` and returns its [`NodeId`]. The node
/// is enabled, has an identity local matrix, and no children. `name` sets the
/// optional debug label.
///
/// The returned node uses the canonical scene-node kind
/// ([`get_scene_node_kind`](crate::get_scene_node_kind)) so it participates in
/// the `SceneNode` hierarchy family.
pub fn create_scene(arena: &mut SceneArena, name: Option<String>) -> NodeId {
    create_scene_node(arena, name)
}

#[cfg(test)]
mod tests {
    use super::*;

    // create_scene

    #[test]
    fn create_scene_is_enabled_by_default() {
        let mut arena = SceneArena::new();
        let scene = create_scene(&mut arena, None);
        assert!(arena[scene].enabled);
    }

    #[test]
    fn create_scene_has_identity_local_matrix_and_no_world_matrix() {
        let mut arena = SceneArena::new();
        let scene = create_scene(&mut arena, None);
        let m = &arena[scene].local_matrix.m;
        assert_eq!(m[0], 1.0);
        assert_eq!(m[5], 1.0);
        assert_eq!(m[10], 1.0);
        assert_eq!(m[15], 1.0);
        assert!(arena[scene].world_matrix.is_none());
    }

    #[test]
    fn create_scene_stores_name() {
        let mut arena = SceneArena::new();
        let scene = create_scene(&mut arena, Some("world".to_string()));
        assert_eq!(arena[scene].name.as_deref(), Some("world"));
    }

    #[test]
    fn create_scene_is_not_a_mesh() {
        let mut arena = SceneArena::new();
        let scene = create_scene(&mut arena, None);
        assert!(arena[scene].mesh.is_none());
    }
}
