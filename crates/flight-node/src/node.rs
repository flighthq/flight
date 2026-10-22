//! Node allocation, runtime, signals and disposal (TS `node.ts`).

// flight-lint: allow-file(contract-vocabulary) D16 open node trait objects and the caller-owned revision state are contract dispatch, not vocabulary types

use std::any::Any;
use std::sync::{Arc, RwLock};

use flight_entity::{Kind, Ref, allocate_entity};
use flight_signals::{clear_signal, create_signal};

use crate::revision::invalidate_node;
use crate::types::*;

/// Options a kind constructor may set on the common node fields (TS `PartialNode` for the base node).
/// The canonical `create_node` takes none (D23 B); kind constructors such as `create_scene3d` accept
/// these and assign them after the base initializer.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PartialNode {
    pub enabled: Option<bool>,
    pub name: Option<String>,
}

/// Caller-supplied runtime methods (TS `Partial<MethodsOf<NodeRuntime>>`).
#[derive(Clone, Default)]
pub struct NodeRuntimeMethods {
    pub can_add_child: Option<NodeCanAddChild>,
}

/// Allocates a node of any kind and initializes the common fields (TS `createNode`): enabled, no
/// name. Assign `name` / `enabled` after create (D23 B). Kind data is owned by the kind's own typed
/// struct (D16) and is initialized by the kind constructor.
// flight-lint: allow(conform-params) D16: kind data and kind runtime tiers are kind-owned typed structs, so the base constructor has no data/runtime factory; `kind` matches after the approved *Traits -> *Fields naming; D23 (B) the enabled/name options are assigned after create (foreman-2a72bf0b), `kind` pending Principal
pub fn create_node<T: Node + Default>(kind: Kind) -> T {
    let mut out: T = allocate_entity();
    initialize_node(&mut out, kind);
    return out;
}

/// Allocates the private base runtime tier with the source defaults (TS `createNodeRuntime`).

pub fn create_node_runtime(methods: Option<&NodeRuntimeMethods>) -> NodeRuntime {
    return create_node_runtime_internal(methods);
}

/// Allocates the five-signal registry (TS `createNodeSignals`); shared identity is preserved.

pub fn create_node_signals() -> Ref<NodeSignals> {
    let out: NodeSignals = allocate_entity();
    return Ref::new(std::sync::RwLock::new(out));
}

/// The source's default child gate: any child may be added (TS `defaultNodeRuntimeCanAddChild`).

// flight-lint: allow(conform-params) D16: kind data and kind runtime tiers are kind-owned typed structs, so the base initializer has no data/runtime factory; D23 (B) enabled/name are assigned after create (foreman-2a72bf0b), `kind` pending Principal
pub fn initialize_node<T: Node>(out: &mut T, kind: Kind) {
    let fields = out.node_fields_mut();
    *fields.state_mut() = create_node_runtime_internal(None);
    fields.enabled = true;
    fields.kind = kind;
    fields.name = None;
}

/// Initializes an allocated signal registry with five fresh signals (TS `initializeNodeSignals`).

pub fn initialize_node_signals(out: &mut NodeSignals) {
    out.on_child_added = create_signal();
    out.on_child_removed = create_signal();
    out.on_children_changed = create_signal();
    out.on_children_order_changed = create_signal();
    out.on_parent_changed = create_signal();
}

/// Sets the enabled gate and invalidates the node (TS `setNodeEnabled`).

pub fn default_node_runtime_can_add_child(_target: &dyn Node, _child: &dyn Node) -> bool {
    return true;
}

/// Detaches `target`, recursively disposes its descendants and drops its signal registries
/// (TS `disposeNode`). After disposal the node must not be added to a graph again.

pub fn dispose_node(target: &NodeRef) {
    let parent = target.read().unwrap().node_runtime().parent.clone();
    if let Some(parent) = parent.and_then(|parent| parent.upgrade()) {
        crate::hierarchy::remove_node_child(&parent, target);
    }

    let children = target
        .read()
        .unwrap()
        .node_runtime()
        .children
        .clone()
        .unwrap_or_default();
    for child in children {
        dispose_node(&child);
    }
    target.write().unwrap().node_runtime_mut().children = None;

    let node_signals = target.read().unwrap().node_runtime().node_signals.clone();
    if let Some(node_signals) = node_signals {
        let signals = node_signals.read().unwrap();
        clear_signal(&signals.on_child_added);
        clear_signal(&signals.on_child_removed);
        clear_signal(&signals.on_children_changed);
        clear_signal(&signals.on_children_order_changed);
        clear_signal(&signals.on_parent_changed);
        drop(signals);
        target.write().unwrap().node_runtime_mut().node_signals = None;
    }

    // Interaction owns the typed values behind these slots; node only drops its references.
    let mut guard = target.write().unwrap();
    let runtime = guard.node_runtime_mut();
    runtime.interaction_signals = None;
    runtime.interaction_state = None;
}

/// Recovers the concrete shared handle of an erased node (TS reads the same object through its kind
/// type): the same `Arc` the node was published as, or `None` when the node is of another kind or
/// was never published through `publish_node`. Built on the node's weak self-handle, so it needs no
/// unsafe and never keeps the node alive.
// flight-lint: allow(conform-extra) typed handle recovery (ir-vocabulary): Rust-only projection of an erased NodeRef to its concrete Ref<T>; TS reads the same object through its kind type
pub fn downcast_node_ref<T: Node>(node: &NodeRef) -> Option<Ref<T>> {
    let handle = {
        let guard = node.read().unwrap();
        guard.node_fields().self_handle().get()?.upgrade()?
    };
    let out = handle.downcast::<RwLock<T>>().ok()?;
    if !std::ptr::addr_eq(Arc::as_ptr(&out), Arc::as_ptr(node)) {
        return None;
    }
    return Some(out);
}

/// Creates the node's signal registry on first use and returns the shared instance
/// (TS `enableNodeSignals`).

pub fn enable_node_signals(source: &NodeRef) -> Ref<NodeSignals> {
    let existing = source.read().unwrap().node_runtime().node_signals.clone();
    if let Some(existing) = existing {
        return existing;
    }
    let signals = create_node_signals();
    source.write().unwrap().node_runtime_mut().node_signals = Some(signals.clone());
    return signals;
}

/// The node's private base runtime tier (TS `getNodeRuntime`).

pub fn get_node_runtime(source: &dyn Node) -> &NodeRuntime {
    return source.node_runtime();
}

/// The node's signal registry, or `null` until enabled (TS `getNodeSignals`).

pub fn get_node_signals(source: &dyn Node) -> Option<Ref<NodeSignals>> {
    return source.node_runtime().node_signals.clone();
}

/// Publishes a constructed node as its shared handle and binds the node's type-erased weak
/// self-handle, so `downcast_node_ref` recovers this same `Arc` from an erased `NodeRef`. Family
/// publishers (`publish_node2d`, `publish_node3d`) publish through it.
// flight-lint: allow(conform-extra) typed handle recovery (ir-vocabulary): Rust-only publication of the concrete Ref<T>, where TS needs no handle projection
pub fn publish_node<T: Node>(node: T) -> Ref<T> {
    let out = Arc::new(RwLock::new(node));
    let erased: Arc<dyn Any + Send + Sync> = out.clone();
    let _ = out
        .read()
        .unwrap()
        .node_fields()
        .self_handle()
        .set(Arc::downgrade(&erased));
    return out;
}

/// The construction initializer of `create_node` (TS `initializeNode`).

pub fn set_node_enabled(target: &NodeRef, value: bool) {
    target.write().unwrap().node_fields_mut().enabled = value;
    invalidate_node(target);
}
