// flight-lint: allow-file(contract-vocabulary) D16 open Node3D dispatch retains the original node and flat fields
use crate::{
    NODE3D_KIND, NODE3D_TRAITS_KEY, Node3D, Node3DNarrow, Node3DRef, Node3DRuntime, PartialNode3D,
};
use flight_entity::{Kind, Ref, allocate_entity};
use flight_node::{
    Node, NodeRef, NodeSignals, NodeTraits, PartialNode, enable_node_signals, get_node_signals,
    init_appearance_runtime_trait, init_transform3d_runtime_trait, initialize_node,
};
use std::sync::{Arc, RwLock};

pub fn create_node3d<T: Node3D + Default>(kind: Option<Kind>, obj: Option<&PartialNode3D>) -> T {
    let mut out: T = allocate_entity();
    initialize_node(
        &mut out,
        kind.unwrap_or_else(|| NODE3D_KIND.to_string()),
        Some(&PartialNode {
            enabled: obj.and_then(|o| o.enabled),
            name: obj.and_then(|o| o.name.clone()),
        }),
    );
    out.node_runtime_mut().traits = Some(NodeTraits {
        key: NODE3D_TRAITS_KEY.clone(),
        narrow: Arc::new(Node3DNarrow {
            as_node3d: narrow_node3d::<T>,
            as_node3d_mut: narrow_node3d_mut::<T>,
            self_handle: None,
        }),
    });
    let f = out.node3d_fields_mut();
    *f.node3d_runtime_mut() = create_node3d_runtime();
    f.position = flight_geometry::create_vector3(0.0, 0.0, 0.0);
    f.rotation = flight_geometry::create_quaternion(0.0, 0.0, 0.0, 1.0);
    f.scale = flight_geometry::create_vector3(1.0, 1.0, 1.0);
    f.alpha = obj.and_then(|o| o.alpha).unwrap_or(1.0);
    f.visible = obj.and_then(|o| o.visible).unwrap_or(true);
    return out;
}

pub fn create_node3d_runtime() -> Node3DRuntime {
    let mut out = Node3DRuntime::default();
    init_appearance_runtime_trait(&mut out.appearance);
    init_transform3d_runtime_trait(&mut out.transform3d);
    return out;
}

pub(crate) fn as_node3d(node: &dyn Node) -> Option<&dyn Node3D> {
    let t = node.node_runtime().traits.as_ref()?;
    if !Arc::ptr_eq(&t.key, &NODE3D_TRAITS_KEY) {
        return None;
    }
    return (t.narrow.downcast_ref::<Node3DNarrow>()?.as_node3d)(node);
}

pub(crate) fn as_node3d_mut(node: &mut dyn Node) -> Option<&mut dyn Node3D> {
    let t = node.node_runtime().traits.as_ref()?;
    if !Arc::ptr_eq(&t.key, &NODE3D_TRAITS_KEY) {
        return None;
    }
    let narrow = t.narrow.downcast_ref::<Node3DNarrow>()?.as_node3d_mut;
    return narrow(node);
}

// flight-lint: allow(conform-extra) Principal68e645eb C1/D16 native retained-handle bridge; target-language nodes already retain their original family identity
pub fn as_node3d_ref(node: &NodeRef) -> Option<Node3DRef> {
    let weak = {
        let node = node.read().unwrap();
        let traits = node.node_runtime().traits.as_ref()?;
        if !Arc::ptr_eq(&traits.key, &NODE3D_TRAITS_KEY) {
            return None;
        }
        traits
            .narrow
            .downcast_ref::<Node3DNarrow>()?
            .self_handle
            .as_ref()?
            .clone()
    };
    let handle = weak.upgrade()?;
    if !std::ptr::addr_eq(Arc::as_ptr(&handle), Arc::as_ptr(node)) {
        return None;
    }
    return Some(handle);
}

pub fn enable_node3d_signals(source: &NodeRef) -> Ref<NodeSignals> {
    return enable_node_signals(source);
}
pub fn get_node3d_runtime(source: &dyn Node3D) -> &Node3DRuntime {
    return source.node3d_fields().node3d_runtime();
}
pub fn get_node3d_signals(source: &dyn Node3D) -> Option<Ref<NodeSignals>> {
    return get_node_signals(source);
}
pub fn is_node3d(node: &dyn Node) -> bool {
    return node
        .node_runtime()
        .traits
        .as_ref()
        .is_some_and(|t| Arc::ptr_eq(&t.key, &NODE3D_TRAITS_KEY));
}
fn narrow_node3d<T: Node3D>(node: &dyn Node) -> Option<&dyn Node3D> {
    return node.as_any().downcast_ref::<T>().map(|n| n as &dyn Node3D);
}
fn narrow_node3d_mut<T: Node3D>(node: &mut dyn Node) -> Option<&mut dyn Node3D> {
    return node
        .as_any_mut()
        .downcast_mut::<T>()
        .map(|n| n as &mut dyn Node3D);
}

/// Publishes a fresh owned concrete leaf once, before erasing its original shared handle.
/// Custom constructors finish their own fields first, then use this function or `into_node3d_ref`.
// flight-lint: allow(conform-extra) Principal68e645eb C1/D16 native publication adapter binds the original concrete Ref before family erasure without copying an Entity or allocating another UID
pub fn publish_node3d<T: Node3D>(value: T) -> Ref<T> {
    let published = Arc::new(RwLock::new(value));
    let weak = Arc::downgrade(&published);
    let weak: crate::Node3DWeak = weak;
    {
        let mut node = published.write().unwrap();
        let mut bound = false;
        if let Some(traits) = node.node_runtime_mut().traits.as_mut() {
            if Arc::ptr_eq(&traits.key, &NODE3D_TRAITS_KEY) {
                if let Some(narrow) = Arc::get_mut(&mut traits.narrow)
                    .and_then(|value| value.downcast_mut::<Node3DNarrow>())
                {
                    narrow.as_node3d = narrow_node3d::<T>;
                    narrow.as_node3d_mut = narrow_node3d_mut::<T>;
                    narrow.self_handle = Some(weak.clone());
                    bound = true;
                }
            }
        }
        if !bound {
            node.node_runtime_mut().traits = Some(NodeTraits {
                key: NODE3D_TRAITS_KEY.clone(),
                narrow: Arc::new(Node3DNarrow {
                    as_node3d: narrow_node3d::<T>,
                    as_node3d_mut: narrow_node3d_mut::<T>,
                    self_handle: Some(weak),
                }),
            });
        }
    }
    return published;
}
