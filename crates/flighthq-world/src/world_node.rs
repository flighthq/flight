//! WorldNode: 3D hierarchy node with a local 4×4 transform matrix.
//!
//! A `WorldNode` combines scene graph hierarchy with a full 4×4 local
//! transform (`local_matrix`) and a lazily computed world matrix
//! (`world_matrix`). The world matrix is recomputed on demand by walking up
//! the hierarchy, analogous to the 2D transform pipeline in `flighthq-node`.
//!
//! `WorldNode` is identified by [`get_world_node_kind()`], which returns a
//! stable `KindId` for renderer registration and hierarchy enforcement.
//!
//! Signal support is opt-in: call [`enable_world_node_signals`] on a node
//! to attach a [`NodeSignals`] instance and start receiving child-change
//! notifications.

use flighthq_geometry::multiply_matrix4;
use flighthq_node::{NodeArena, NodeId, get_node_parent};
use flighthq_types::{KindId, Matrix4, Matrix4Like, NodeSignals};

// ---------------------------------------------------------------------------
// WorldNode
// ---------------------------------------------------------------------------

/// A 3D scene graph node carrying a local 4×4 transform and an optional
/// cached world matrix.
#[derive(Debug)]
pub struct WorldNode {
    /// Whether this node is active (disabled nodes skip update/render).
    pub enabled: bool,
    /// The local 4×4 transform relative to the parent.
    pub local_matrix: Matrix4,
    /// Optional debug name.
    pub name: Option<String>,
    /// Lazily computed accumulated world matrix. `None` until first computed.
    pub(crate) world_matrix: Option<Matrix4>,
    /// Signals emitted on child-list changes. `None` until
    /// [`enable_world_node_signals`] is called.
    pub(crate) signals: Option<Box<NodeSignals>>,
}

impl Default for WorldNode {
    fn default() -> Self {
        Self {
            enabled: true,
            local_matrix: Matrix4::default(),
            name: None,
            world_matrix: None,
            signals: None,
        }
    }
}

/// Arena of `WorldNode` values keyed by [`NodeId`].
pub type WorldArena = NodeArena<WorldNode>;

// ---------------------------------------------------------------------------
// Kind
// ---------------------------------------------------------------------------

/// Returns the stable [`KindId`] that identifies `WorldNode` nodes.
///
/// Delegates to the canonical [`flighthq_types::world_node_kind`] so a single
/// kind identifies `WorldNode` across the whole SDK (the kind must be defined
/// exactly once). The id is allocated once and cached.
pub fn get_world_node_kind() -> KindId {
    flighthq_types::world_node_kind()
}

// ---------------------------------------------------------------------------
// Public functions (alphabetical)
// ---------------------------------------------------------------------------

/// Creates a new `WorldNode` entry in `arena` and returns its `NodeId`.
///
/// The node starts enabled, with an identity local matrix and no signals.
/// `name` sets the optional debug label.
pub fn create_world_node(arena: &mut WorldArena, name: Option<String>) -> NodeId {
    arena.insert(WorldNode {
        enabled: true,
        local_matrix: Matrix4::default(),
        name,
        world_matrix: None,
        signals: None,
    })
}

/// Enables child-change signal delivery for `source`, allocating a
/// [`NodeSignals`] instance on the node if not already present.
///
/// Returns a mutable reference to the signals so callers can connect slots.
/// Repeated calls on the same node are safe and idempotent.
pub fn enable_world_node_signals(arena: &mut WorldArena, source: NodeId) -> &mut NodeSignals {
    let node = &mut arena[source];
    node.signals
        .get_or_insert_with(|| Box::new(NodeSignals::default()))
}

/// Returns the lazily computed world matrix for `source`.
///
/// Walks up the parent chain (using `hierarchy`) to accumulate transforms.
/// The result is cached on the node and is valid until the world data is
/// next recomputed.
///
/// Note: a separate `HierarchyArena` is required because `WorldArena` stores
/// world data only; hierarchy links live in `flighthq-node`.
pub fn get_world_node_world_matrix<'a>(
    arena: &'a mut WorldArena,
    hierarchy: &flighthq_node::NodeArena<flighthq_node::HierarchyNode>,
    source: NodeId,
) -> &'a Matrix4 {
    let parent = get_node_parent(hierarchy, source);
    let world = match parent {
        Some(p) => {
            // Recompute the parent chain first, then read its world matrix.
            let parent_world = get_world_node_world_matrix(arena, hierarchy, p).clone();
            let parent_like = Matrix4Like { m: parent_world.m };
            let local_like = Matrix4Like {
                m: arena[source].local_matrix.m,
            };
            let mut out = Matrix4Like::default();
            multiply_matrix4(&mut out, &parent_like, &local_like);
            Matrix4 { m: out.m }
        }
        None => arena[source].local_matrix.clone(),
    };

    let node = &mut arena[source];
    node.world_matrix = Some(world);
    node.world_matrix.as_ref().unwrap()
}

/// Returns a reference to the `NodeSignals` for `source`, or `None` when
/// [`enable_world_node_signals`] has not been called.
pub fn get_world_node_signals(arena: &WorldArena, source: NodeId) -> Option<&NodeSignals> {
    arena[source].signals.as_deref()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_node::{HierarchyArena, HierarchyNode, add_node_child};

    fn new_arena() -> WorldArena {
        WorldArena::new()
    }

    // Inserts a paired hierarchy node so its NodeId aligns with the world node.
    fn new_hierarchy() -> HierarchyArena {
        HierarchyArena::new()
    }

    // create_world_node

    #[test]
    fn create_world_node_is_enabled_by_default() {
        let mut arena = new_arena();
        let node = create_world_node(&mut arena, None);
        assert!(arena[node].enabled);
    }

    #[test]
    fn create_world_node_identity_local_matrix() {
        let mut arena = new_arena();
        let node = create_world_node(&mut arena, None);
        let m = &arena[node].local_matrix.m;
        assert_eq!(m[0], 1.0);
        assert_eq!(m[5], 1.0);
        assert_eq!(m[10], 1.0);
        assert_eq!(m[15], 1.0);
        assert_eq!(m[12], 0.0);
        assert_eq!(m[13], 0.0);
        assert_eq!(m[14], 0.0);
    }

    #[test]
    fn create_world_node_stores_name() {
        let mut arena = new_arena();
        let node = create_world_node(&mut arena, Some("root".to_string()));
        assert_eq!(arena[node].name.as_deref(), Some("root"));
        let unnamed = create_world_node(&mut arena, None);
        assert_eq!(arena[unnamed].name, None);
    }

    // enable_world_node_signals

    #[test]
    fn enable_world_node_signals_allocates_signals() {
        let mut arena = new_arena();
        let node = create_world_node(&mut arena, None);
        enable_world_node_signals(&mut arena, node);
        assert!(get_world_node_signals(&arena, node).is_some());
    }

    #[test]
    fn enable_world_node_signals_idempotent() {
        let mut arena = new_arena();
        let node = create_world_node(&mut arena, None);
        let first = enable_world_node_signals(&mut arena, node) as *const NodeSignals;
        let second = enable_world_node_signals(&mut arena, node) as *const NodeSignals;
        assert_eq!(first, second);
    }

    // get_world_node_kind

    #[test]
    fn get_world_node_kind_is_stable() {
        let a = get_world_node_kind();
        let b = get_world_node_kind();
        assert_eq!(a, b);
    }

    // get_world_node_signals

    #[test]
    fn get_world_node_signals_none_before_enable() {
        let mut arena = new_arena();
        let node = create_world_node(&mut arena, None);
        assert!(get_world_node_signals(&arena, node).is_none());
    }

    #[test]
    fn get_world_node_signals_some_after_enable() {
        let mut arena = new_arena();
        let node = create_world_node(&mut arena, None);
        enable_world_node_signals(&mut arena, node);
        assert!(get_world_node_signals(&arena, node).is_some());
    }

    // get_world_node_world_matrix

    #[test]
    fn get_world_node_world_matrix_identity_for_root() {
        let mut arena = new_arena();
        let mut hierarchy = new_hierarchy();
        let node = create_world_node(&mut arena, None);
        let _ = hierarchy.insert(HierarchyNode::default());

        arena[node].local_matrix.m[12] = 10.0;
        arena[node].local_matrix.m[13] = 20.0;
        arena[node].local_matrix.m[14] = 30.0;

        let world = get_world_node_world_matrix(&mut arena, &hierarchy, node);
        assert_eq!(world.m[12], 10.0);
        assert_eq!(world.m[13], 20.0);
        assert_eq!(world.m[14], 30.0);
    }

    #[test]
    fn get_world_node_world_matrix_parent_times_local_for_child() {
        let mut arena = new_arena();
        let mut hierarchy = new_hierarchy();

        let parent_w = create_world_node(&mut arena, None);
        let parent_h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(parent_w, parent_h, "key alignment required");

        let child_w = create_world_node(&mut arena, None);
        let child_h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(child_w, child_h, "key alignment required");

        add_node_child(&mut hierarchy, parent_h, child_h);

        arena[parent_w].local_matrix.m[12] = 5.0;
        arena[child_w].local_matrix.m[12] = 3.0;

        let world = get_world_node_world_matrix(&mut arena, &hierarchy, child_w);
        assert!((world.m[12] - 8.0).abs() < 1e-5, "tx={}", world.m[12]);
    }

    #[test]
    fn get_world_node_world_matrix_updates_when_parent_changes() {
        let mut arena = new_arena();
        let mut hierarchy = new_hierarchy();

        let parent_w = create_world_node(&mut arena, None);
        let parent_h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(parent_w, parent_h);

        let child_w = create_world_node(&mut arena, None);
        let child_h = hierarchy.insert(HierarchyNode::default());
        assert_eq!(child_w, child_h);

        add_node_child(&mut hierarchy, parent_h, child_h);

        // First read with identity parent: child tx == 0.
        let first = get_world_node_world_matrix(&mut arena, &hierarchy, child_w).m[12];
        assert_eq!(first, 0.0);

        // Move parent, re-read: child world reflects the new parent translation.
        arena[parent_w].local_matrix.m[12] = 7.0;
        let world = get_world_node_world_matrix(&mut arena, &hierarchy, child_w);
        assert!((world.m[12] - 7.0).abs() < 1e-5, "tx={}", world.m[12]);
    }
}
