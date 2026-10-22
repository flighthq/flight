//! The Node2D family constructor, its runtime tier and the plain display object (TS
//! `displayObject.ts`).

use std::sync::{Arc, LazyLock, OnceLock, RwLock};

use flight_clip::ClipRegion;
use flight_entity::{Kind, Ref, allocate_entity};
use flight_node::contract::BoundsRectangleRuntimeMethods;
use flight_node::{
    Node, NodeRef, NodeTraits, NodeTraitsKey, init_appearance_runtime_trait,
    init_bounds_rectangle_runtime_trait, init_transform2d_runtime_trait, initialize_node,
    invalidate_node_appearance,
};

use crate::types::*;

/// The single shared identity key for the Node2D family (TS `Node2DTraitsKey` symbol).
/// Every 2D kind clones this same `Arc`; identity is `Arc::ptr_eq`.
pub static NODE2D_TRAITS_KEY: LazyLock<Arc<NodeTraitsKey>> =
    LazyLock::new(|| Arc::new(NodeTraitsKey));

/// Allocates a plain display object (TS `createDisplayObject`).
// flight-lint: allow(conform-params) D23 B: authored options removed; kind assigns fields after create
pub fn create_display_object() -> Ref<DisplayObject> {
    let mut out: DisplayObject = allocate_entity();
    initialize_display_object(&mut out);
    return publish_node2d(out);
}

/// The display object's runtime tier (TS `createDisplayObjectRuntime`).
pub fn create_display_object_runtime() -> DisplayObjectRuntime {
    return create_node2d_runtime(None);
}

/// Allocates any 2D kind and initializes the common node fields, the 2D field groups and the 2D
/// runtime tier from `create_node2d_runtime_factory` (default `create_node2d_runtime`), as TS
/// `createNode2D`. The kind's data is its own typed struct, initialized by the kind constructor.
// flight-lint: allow(conform-params) D23 B: authored fields are assigned after create; D16 kind data belongs to the typed kind, and the runtime factory is retained
pub fn create_node2d<T: Node2D + Default>(
    kind: Kind,
    create_node2d_runtime_factory: Option<Node2DRuntimeFactory>,
) -> T {
    let mut out: T = allocate_entity();
    initialize_node2d(&mut out, kind, create_node2d_runtime_factory);
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

/// The construction initializer of `create_display_object` (TS `initializeDisplayObject`).
// flight-lint: allow(conform-extra) D23 I: public initialize seam extracted from create_display_object
pub fn initialize_display_object(out: &mut DisplayObject) {
    initialize_node2d(
        out,
        DISPLAY_OBJECT_KIND.to_string(),
        Some(create_display_object_runtime),
    );
}

/// Constructs the common 2D layer in the already allocated concrete kind, preserving its entity
/// slot. Kept internal: the existing public kind initializers are the construction contract.
pub(crate) fn initialize_node2d<T: Node2D>(
    out: &mut T,
    kind: Kind,
    create_node2d_runtime_factory: Option<Node2DRuntimeFactory>,
) {
    initialize_node(out, kind);
    let narrow = Node2DTraitsKey {
        handle: OnceLock::new(),
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
    fields.x = 0.0;
    fields.y = 0.0;
    fields.rotation = 0.0;
    fields.scale_x = 1.0;
    fields.scale_y = 1.0;
    fields.skew_x = 0.0;
    fields.skew_y = 0.0;
    fields.pivot_x = 0.0;
    fields.pivot_y = 0.0;
    fields.alpha = 1.0;
    fields.visible = true;
    fields.blend_mode = None;
    fields.material = None;
    fields.material_data = None;
    fields.clip = None;
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

/// Recovers the 2D family handle of an erased node (Principal 68e645eb C1): the same `Arc` the
/// node was published as, or `None` for another family or a node never published through
/// `publish_node2d`.
// flight-lint: allow(conform-extra) Principal 68e645eb C1: Rust-only family handle projection; TS reads the same object through its Node2D type
pub fn as_node2d_ref(node: &NodeRef) -> Option<Node2DRef> {
    let handle = {
        let guard = node.read().unwrap();
        get_node2d_traits_key(&*guard)?.handle.get()?.upgrade()?
    };
    if !std::ptr::addr_eq(Arc::as_ptr(&handle), Arc::as_ptr(node)) {
        return None;
    }
    return Some(handle);
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

/// Publishes a constructed 2D node as its shared handle and binds the node's own family handle, so
/// `as_node2d_ref` recovers this same `Arc` from an erased `NodeRef` (Principal 68e645eb C1). Every
/// 2D kind constructor publishes through it.
// flight-lint: allow(conform-extra) Principal 68e645eb C1: Rust-only publication of the concrete Ref<T>, where TS needs no handle projection
pub fn publish_node2d<T: Node2D + 'static>(node: T) -> Ref<T> {
    let out = Arc::new(RwLock::new(node));
    let handle: Node2DRef = out.clone();
    if let Some(key) = get_node2d_traits_key(&*out.read().unwrap()) {
        let _ = key.handle.set(Arc::downgrade(&handle));
    }
    return out;
}

/// Sets the node's clip region and invalidates its appearance (TS `setNode2DClip`).
pub fn set_node2d_clip(source: &Node2DRef, value: Option<Ref<ClipRegion>>) {
    source.write().unwrap().node2d_fields_mut().clip = value;
    let node: NodeRef = source.clone();
    invalidate_node_appearance(&node);
}
