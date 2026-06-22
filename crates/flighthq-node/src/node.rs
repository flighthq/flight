//! Node entity, runtime, and signals — a faithful port of the TypeScript
//! `node.ts`.
//!
//! The arena modules (`hierarchy`, `transform2d`, …) are the high-performance
//! data-oriented core. This module ports the TS *entity/runtime* shape for
//! callers and tests that need the object-style API: a [`Node`] carries data,
//! a name, a kind, and an enabled flag, paired with a [`NodeRuntime`] that
//! holds the package-private revision counters, parent/child links, the
//! optional [`NodeSignals`], and the `can_add_child` policy hook.
//!
//! Defaults match the TS reference exactly, including the `-1`
//! ([`DIRTY_SENTINEL`]) "never computed" markers.

use flighthq_signals::Signal;
use flighthq_types::KindId;

use crate::invalidation::DIRTY_SENTINEL;
use crate::revision::invalidate_node;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Policy hook deciding whether `child` may be added under `target`.
pub type CanAddChild = fn(target: &NodeId, child: &NodeId) -> bool;

/// Stable identity for an entity-model node (the arena modules use
/// `slotmap::DefaultKey`; the entity model uses a monotonic id).
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub struct NodeId(u64);

/// The five hierarchy change signals a node can emit once enabled.
pub struct NodeSignals {
    pub on_child_added: Signal<NodeId>,
    pub on_child_removed: Signal<NodeId>,
    pub on_children_changed: Signal<()>,
    pub on_children_order_changed: Signal<()>,
    pub on_parent_changed: Signal<()>,
}

/// Package-private runtime state attached to a [`Node`].
pub struct NodeRuntime {
    pub appearance_id: u32,
    pub bounds_using_local_bounds_id: i64,
    pub bounds_using_local_transform_id: i64,
    pub can_add_child: CanAddChild,
    pub children: Option<Vec<NodeId>>,
    pub node_signals: Option<NodeSignals>,
    pub local_bounds_id: u32,
    pub local_bounds_using_local_bounds_id: i64,
    pub local_content_id: u32,
    pub local_transform_id: u32,
    pub local_transform_using_local_transform_id: i64,
    pub parent: Option<NodeId>,
    pub world_bounds_using_local_bounds_id: i64,
    pub world_bounds_using_world_transform_id: i64,
    pub world_transform_id: u32,
    pub world_transform_using_local_transform_id: i64,
    pub world_transform_using_parent_transform_id: i64,
}

/// An entity-model scene graph node.
pub struct Node<D = ()> {
    pub data: Option<D>,
    pub enabled: bool,
    pub kind: KindId,
    pub name: Option<String>,
    pub runtime: NodeRuntime,
}

/// Optional initial values for [`create_node`], mirroring the TS `PartialNode`.
#[derive(Default)]
pub struct PartialNode<D> {
    pub data: Option<D>,
    pub enabled: Option<bool>,
    pub name: Option<String>,
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Creates a node of `node_kind`, applying any provided overrides.
///
/// `enabled` defaults to `true`; `data` and `name` default to `None`; the
/// runtime is a fresh [`create_node_runtime`].
pub fn create_node<D>(node_kind: KindId, obj: Option<PartialNode<D>>) -> Node<D> {
    match obj {
        Some(obj) => Node {
            data: obj.data,
            enabled: obj.enabled.unwrap_or(true),
            kind: node_kind,
            name: obj.name,
            runtime: create_node_runtime(None),
        },
        None => Node {
            data: None,
            enabled: true,
            kind: node_kind,
            name: None,
            runtime: create_node_runtime(None),
        },
    }
}

/// Creates a runtime with TS-default values. Pass `Some(can_add_child)` to
/// override the child-acceptance policy.
pub fn create_node_runtime(can_add_child: Option<CanAddChild>) -> NodeRuntime {
    NodeRuntime {
        appearance_id: 0,
        bounds_using_local_bounds_id: -1,
        bounds_using_local_transform_id: -1,
        can_add_child: can_add_child.unwrap_or(default_node_runtime_can_add_child),
        children: None,
        node_signals: None,
        local_bounds_id: 0,
        local_bounds_using_local_bounds_id: -1,
        local_content_id: 0,
        local_transform_id: 0,
        local_transform_using_local_transform_id: -1,
        parent: None,
        world_bounds_using_local_bounds_id: -1,
        world_bounds_using_world_transform_id: -1,
        world_transform_id: 0,
        world_transform_using_local_transform_id: -1,
        world_transform_using_parent_transform_id: -1,
    }
}

/// Allocates a fresh set of node signals with all five signals connected to
/// nothing.
pub fn create_node_signals() -> NodeSignals {
    NodeSignals {
        on_child_added: Signal::new(),
        on_child_removed: Signal::new(),
        on_children_changed: Signal::new(),
        on_children_order_changed: Signal::new(),
        on_parent_changed: Signal::new(),
    }
}

/// The default `can_add_child` policy — always accepts.
pub fn default_node_runtime_can_add_child(_target: &NodeId, _child: &NodeId) -> bool {
    true
}

/// Lazily creates and returns the node's signals, reusing them on later calls.
pub fn enable_node_signals<D>(source: &mut Node<D>) -> &mut NodeSignals {
    if source.runtime.node_signals.is_none() {
        source.runtime.node_signals = Some(create_node_signals());
    }
    source.runtime.node_signals.as_mut().unwrap()
}

/// Returns a reference to the node's runtime.
pub fn get_node_runtime<D>(source: &Node<D>) -> &NodeRuntime {
    &source.runtime
}

/// Returns the node's signals, or `None` if they have not been enabled.
pub fn get_node_signals<D>(source: &Node<D>) -> Option<&NodeSignals> {
    source.runtime.node_signals.as_ref()
}

/// Sets the node's `enabled` flag and invalidates every revision aspect.
pub fn set_node_enabled<D>(target: &mut Node<D>, value: bool) {
    target.enabled = value;
    let _ = DIRTY_SENTINEL; // documents the sentinel convention shared below
    invalidate_runtime(&mut target.runtime);
}

// Bridge: invalidate the entity runtime's counters using the same rules as the
// arena revision module. The entity runtime stores `*_using_*` snapshots as
// `i64` so they can hold TS's `-1` sentinel; the bumped counters are `u32`.
fn invalidate_runtime(runtime: &mut NodeRuntime) {
    use crate::revision::NodeRevisions;
    let mut rev = NodeRevisions {
        appearance_id: runtime.appearance_id,
        local_bounds_id: runtime.local_bounds_id,
        local_content_id: runtime.local_content_id,
        local_transform_id: runtime.local_transform_id,
        ..NodeRevisions::default()
    };
    invalidate_node(&mut rev);
    runtime.appearance_id = rev.appearance_id;
    runtime.local_bounds_id = rev.local_bounds_id;
    runtime.local_content_id = rev.local_content_id;
    runtime.local_transform_id = rev.local_transform_id;
    runtime.world_transform_using_parent_transform_id = -1;
    runtime.world_bounds_using_world_transform_id = -1;
    runtime.world_bounds_using_local_bounds_id = -1;
}

// ---------------------------------------------------------------------------
// NodeId allocation
// ---------------------------------------------------------------------------

impl NodeId {
    /// Allocates a new unique node id.
    pub fn new() -> Self {
        use std::sync::atomic::{AtomicU64, Ordering};
        static COUNTER: AtomicU64 = AtomicU64::new(1);
        NodeId(COUNTER.fetch_add(1, Ordering::Relaxed))
    }
}

impl Default for NodeId {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    struct TestKind;
    struct TestData {
        test_data_field: String,
    }

    fn test_kind() -> KindId {
        KindId::of::<TestKind>()
    }

    // create_node

    #[test]
    fn create_node_initializes_defaults() {
        let node: Node<()> = create_node(test_kind(), None);
        assert!(node.enabled);
        assert!(node.data.is_none());
        assert_eq!(node.kind, test_kind());
    }

    #[test]
    fn create_node_allows_predefined_values() {
        let node: Node<()> = create_node(
            test_kind(),
            Some(PartialNode {
                data: None,
                enabled: Some(false),
                name: None,
            }),
        );
        assert!(!node.enabled);
    }

    #[test]
    fn create_node_allows_data_initializer() {
        let node: Node<TestData> = create_node(
            test_kind(),
            Some(PartialNode {
                data: Some(TestData {
                    test_data_field: "testDataField".to_string(),
                }),
                enabled: None,
                name: None,
            }),
        );
        assert_eq!(node.data.unwrap().test_data_field, "testDataField");
    }

    // create_node_runtime

    #[test]
    fn create_node_runtime_initializes_default_values() {
        let runtime = create_node_runtime(None);
        assert_eq!(runtime.appearance_id, 0);
        assert_eq!(runtime.bounds_using_local_bounds_id, -1);
        assert_eq!(runtime.bounds_using_local_transform_id, -1);
        assert!(runtime.children.is_none());
        assert!(runtime.node_signals.is_none());
        assert_eq!(runtime.local_bounds_id, 0);
        assert_eq!(runtime.local_bounds_using_local_bounds_id, -1);
        assert_eq!(runtime.local_transform_id, 0);
        assert_eq!(runtime.local_transform_using_local_transform_id, -1);
        assert!(runtime.parent.is_none());
        assert_eq!(runtime.world_bounds_using_local_bounds_id, -1);
        assert_eq!(runtime.world_bounds_using_world_transform_id, -1);
        assert_eq!(runtime.world_transform_id, 0);
        assert_eq!(runtime.world_transform_using_local_transform_id, -1);
        assert_eq!(runtime.world_transform_using_parent_transform_id, -1);
    }

    #[test]
    fn create_node_runtime_allows_custom_can_add_child() {
        fn always_false(_a: &NodeId, _b: &NodeId) -> bool {
            false
        }
        let runtime = create_node_runtime(Some(always_false));
        let a = NodeId::new();
        let b = NodeId::new();
        assert!(!(runtime.can_add_child)(&a, &b));
    }

    // create_node_signals

    #[test]
    fn create_node_signals_returns_all_signals() {
        let signals = create_node_signals();
        // The five signals exist and start with no connected listeners.
        assert!(!signals.on_child_added.has_listeners());
        assert!(!signals.on_child_removed.has_listeners());
        assert!(!signals.on_children_changed.has_listeners());
        assert!(!signals.on_children_order_changed.has_listeners());
        assert!(!signals.on_parent_changed.has_listeners());
    }

    // default_node_runtime_can_add_child

    #[test]
    fn default_node_runtime_can_add_child_always_true() {
        let a = NodeId::new();
        let b = NodeId::new();
        assert!(default_node_runtime_can_add_child(&a, &b));
    }

    // enable_node_signals

    #[test]
    fn enable_node_signals_creates_then_reuses() {
        let mut node: Node<()> = create_node(test_kind(), None);
        enable_node_signals(&mut node);
        assert!(node.runtime.node_signals.is_some());
        // Subsequent call keeps the same signals (still present, not replaced).
        enable_node_signals(&mut node);
        assert!(node.runtime.node_signals.is_some());
    }

    // get_node_runtime

    #[test]
    fn get_node_runtime_returns_runtime() {
        let node: Node<()> = create_node(test_kind(), None);
        let runtime = get_node_runtime(&node);
        assert_eq!(runtime.appearance_id, 0);
    }

    // get_node_signals

    #[test]
    fn get_node_signals_none_before_enable_then_some() {
        let mut node: Node<()> = create_node(test_kind(), None);
        assert!(get_node_signals(&node).is_none());
        enable_node_signals(&mut node);
        assert!(get_node_signals(&node).is_some());
    }

    // set_node_enabled

    #[test]
    fn set_node_enabled_toggles_and_invalidates() {
        let mut node: Node<()> = create_node(test_kind(), None);
        let before = node.runtime.local_transform_id;
        set_node_enabled(&mut node, false);
        assert!(!node.enabled);
        assert_ne!(node.runtime.local_transform_id, before);
        set_node_enabled(&mut node, true);
        assert!(node.enabled);
    }
}
