//! The Node2D family constructor, its runtime tier and the plain display object (TS
//! `displayObject.ts`).

use std::sync::{Arc, LazyLock, RwLock};

use flight_clip::ClipRegion;
use flight_entity::{Kind, Ref, allocate_entity};
use flight_node::contract::BoundsRectangleRuntimeMethods;
use flight_node::{
    Node, NodeRef, NodeTraits, NodeTraitsKey, PartialNode, init_appearance_runtime_trait,
    init_bounds_rectangle_runtime_trait, init_transform2d_runtime_trait, initialize_node,
    invalidate_node_appearance,
};

use crate::types::*;

/// The single shared identity key for the Node2D family (TS `Node2DTraitsKey` symbol).
/// Every 2D kind clones this same `Arc`; identity is `Arc::ptr_eq`.
pub static NODE2D_TRAITS_KEY: LazyLock<Arc<NodeTraitsKey>> =
    LazyLock::new(|| Arc::new(NodeTraitsKey));

/// Allocates a plain display object (TS `createDisplayObject`).
pub fn create_display_object(obj: Option<&PartialNode2D>) -> Ref<DisplayObject> {
    let out: DisplayObject = create_node2d(
        DISPLAY_OBJECT_KIND.to_string(),
        obj,
        Some(create_display_object_runtime),
    );
    return Arc::new(RwLock::new(out));
}

/// The display object's runtime tier (TS `createDisplayObjectRuntime`).
pub fn create_display_object_runtime() -> DisplayObjectRuntime {
    return create_node2d_runtime(None);
}

/// Allocates any 2D kind and initializes the common node fields, the 2D field groups and the 2D
/// runtime tier from `create_node2d_runtime_factory` (default `create_node2d_runtime`), as TS
/// `createNode2D`. The kind's data is its own typed struct, initialized by the kind constructor.
// flight-lint: allow(conform-params) D16: kind data is the kind struct's own typed field, so there is no data factory; the runtime factory keeps its source position
pub fn create_node2d<T: Node2D + Default>(
    kind: Kind,
    obj: Option<&PartialNode2D>,
    create_node2d_runtime_factory: Option<Node2DRuntimeFactory>,
) -> T {
    let mut out: T = allocate_entity();
    let node_options = PartialNode {
        enabled: obj.and_then(|obj| obj.enabled),
        name: obj.and_then(|obj| obj.name.clone()),
    };
    initialize_node(&mut out, kind, Some(&node_options));
    let narrow = Node2DTraitsKey {
        narrow: narrow_node2d::<T>,
        narrow_mut: narrow_node2d_mut::<T>,
    };
    out.node_runtime_mut().traits = Some(NodeTraits {
        key: NODE2D_TRAITS_KEY.clone(),
        narrow: Arc::new(narrow),
    });
    let fields = out.node2d_fields_mut();
    *fields.node2d_runtime_mut() = match create_node2d_runtime_factory {
        Some(factory) => factory(),
        None => create_node2d_runtime(None),
    };
    fields.x = obj.and_then(|obj| obj.x).unwrap_or(0.0);
    fields.y = obj.and_then(|obj| obj.y).unwrap_or(0.0);
    fields.rotation = obj.and_then(|obj| obj.rotation).unwrap_or(0.0);
    fields.scale_x = obj.and_then(|obj| obj.scale_x).unwrap_or(1.0);
    fields.scale_y = obj.and_then(|obj| obj.scale_y).unwrap_or(1.0);
    fields.skew_x = obj.and_then(|obj| obj.skew_x).unwrap_or(0.0);
    fields.skew_y = obj.and_then(|obj| obj.skew_y).unwrap_or(0.0);
    fields.pivot_x = obj.and_then(|obj| obj.pivot_x).unwrap_or(0.0);
    fields.pivot_y = obj.and_then(|obj| obj.pivot_y).unwrap_or(0.0);
    fields.alpha = obj.and_then(|obj| obj.alpha).unwrap_or(1.0);
    fields.visible = obj.and_then(|obj| obj.visible).unwrap_or(true);
    fields.blend_mode = obj.and_then(|obj| obj.blend_mode.clone());
    fields.material = obj.and_then(|obj| obj.material.clone());
    fields.material_data = obj.and_then(|obj| obj.material_data.clone());
    fields.clip = obj.and_then(|obj| obj.clip.clone());
    return out;
}

/// Allocates the 2D runtime tier with the transform, bounds and appearance caches cleared and the
/// optional kind bounds methods installed (TS `createNode2DRuntime`).
pub fn create_node2d_runtime(methods: Option<&Node2DRuntimeMethods>) -> Node2DRuntime {
    let mut out = Node2DRuntime::default();
    out.scene2d = None;
    init_transform2d_runtime_trait(&mut out.transform2d, None);
    let bounds = BoundsRectangleRuntimeMethods {
        compute_local_bounds_rectangle: methods
            .and_then(|methods| methods.compute_local_bounds_rectangle.clone()),
        is_local_bounds_rectangle_valid: methods
            .and_then(|methods| methods.is_local_bounds_rectangle_valid.clone()),
    };
    init_bounds_rectangle_runtime_trait(&mut out.bounds, Some(&bounds));
    init_appearance_runtime_trait(&mut out.appearance);
    return out;
}

/// Narrows any node to the 2D family through its runtime's family key, or `None` for other
/// families.
pub(crate) fn as_node2d(node: &dyn Node) -> Option<&dyn Node2D> {
    let key = get_node2d_traits_key(node)?;
    return (key.narrow)(node);
}

/// Mutable narrowing from any node to the 2D family (TS mutable `asNode2D` path).
pub(crate) fn as_node2d_mut(node: &mut dyn Node) -> Option<&mut dyn Node2D> {
    let key = get_node2d_traits_key(node)?;
    let narrow_mut = key.narrow_mut;
    return (narrow_mut)(node);
}

/// The display object's runtime tier (TS `getDisplayObjectRuntime`).
pub fn get_display_object_runtime(source: &DisplayObject) -> &DisplayObjectRuntime {
    return get_node2d_runtime(source);
}

/// Any 2D node's runtime tier (TS `getNode2DRuntime`).
pub fn get_node2d_runtime(source: &dyn Node2D) -> &Node2DRuntime {
    return source.node2d_fields().node2d_runtime();
}

fn get_node2d_traits_key(node: &dyn Node) -> Option<&Node2DTraitsKey> {
    let traits = node.node_runtime().traits.as_ref()?;
    if !Arc::ptr_eq(&traits.key, &NODE2D_TRAITS_KEY) {
        return None;
    }
    return traits.narrow.downcast_ref::<Node2DTraitsKey>();
}

/// Whether a node of any family is a 2D node (TS `isNode2D`): its base runtime carries the Node2D
/// family key `create_node2d` installs.
pub fn is_node2d(node: &dyn Node) -> bool {
    return get_node2d_traits_key(node).is_some();
}

fn narrow_node2d<T: Node2D>(node: &dyn Node) -> Option<&dyn Node2D> {
    return node
        .as_any()
        .downcast_ref::<T>()
        .map(|node| node as &dyn Node2D);
}

fn narrow_node2d_mut<T: Node2D>(node: &mut dyn Node) -> Option<&mut dyn Node2D> {
    return node
        .as_any_mut()
        .downcast_mut::<T>()
        .map(|node| node as &mut dyn Node2D);
}

/// Sets the node's clip region and invalidates its appearance (TS `setNode2DClip`).
pub fn set_node2d_clip(source: &Node2DRef, value: Option<Ref<ClipRegion>>) {
    source.write().unwrap().node2d_fields_mut().clip = value;
    let node: NodeRef = source.clone();
    invalidate_node_appearance(&node);
}
