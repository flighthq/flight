//! Node-owned declarations: the common node fields and feature groups, the open node family
//! traits, and the private runtime tiers (TS `Node.ts`, `Node2D.ts`, `Node3D.ts`, `Has*.ts`).
//!
//! D16: a kind struct composes the family's base fields and dereferences to them; the runtime
//! tiers are private fields reached through the trait accessors below. Kind data lives on the
//! kind's own typed struct, never here.

// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D16 structural node feature accessors preserve the open node families and are contract dispatch, not convenience methods

use std::any::Any;
use std::sync::{Arc, RwLock, Weak};

use flight_adjustments::Adjustment;
use flight_clip::ClipRegion;
use flight_entity::{EntityRuntimeSlot, Kind, Ref, Unknown};
use flight_geometry::{Matrix, Matrix4, Quaternion, Rectangle, Vector3};
pub use flight_layout::ViewportAlign;
use flight_materials::BlendMode;
use flight_materials::ColorScaleBias;
use flight_materials::contract::{Material2D, MaterialData};
use flight_signals::Signal;

/// A shared node identity (TS `NodeOf`/`NodeAny` object identity).
pub type NodeRef = Ref<dyn Node>;

/// A non-owning parent link. Children are owned strongly by the parent runtime; the parent link is
/// weak so a graph is collectable and never leaks through a cycle.
pub type NodeWeak = Weak<RwLock<dyn Node>>;

/// A shared adjustment in the node's pointwise stack (TS `readonly Adjustment[]`).
pub type AdjustmentRef = Ref<dyn Adjustment>;

/// An opaque key identifying a node's trait family (TS symbol-keyed `NodeTraits`). Each scene
/// family (scene2d, scene3d) creates one static key per kind; identity is `Arc::ptr_eq`.
pub struct NodeTraitsKey(pub Arc<dyn Any + Send + Sync>);

/// Whether `target` may accept `child` (TS `NodeRuntime.canAddChild`). The family parameter is
/// erased at this callback boundary, as the source call site does.
pub type NodeCanAddChild = Arc<dyn Fn(&dyn Node, &dyn Node) -> bool + Send + Sync>;

/// Kind-owned local-bounds computation (TS `computeLocalBoundsRectangle`).
pub type NodeLocalBoundsComputer = Arc<dyn Fn(&mut Rectangle, &dyn Node) + Send + Sync>;

/// Kind-owned extra validity check for local-bounds inputs (TS `isLocalBoundsRectangleValid`).
pub type NodeLocalBoundsValidity = Arc<dyn Fn(&dyn Node) -> bool + Send + Sync>;

/// The fields every node has (TS `NodeTraits`): open kind name, optional name, enabled gate.
/// The entity runtime slot and the private runtime tier live here too.
pub struct NodeFields {
    runtime: EntityRuntimeSlot,
    state: NodeRuntime,
    pub enabled: bool,
    pub kind: Kind,
    pub name: Option<String>,
}

/// The base node runtime tier (TS `NodeRuntime`, minus the owner-pending interaction slots).
/// Every revision id is a wrapping revision counter; `-1` marks "no value computed for this axis".
pub struct NodeRuntime {
    pub appearance_id: u32,
    pub bounds_using_local_bounds_id: i32,
    pub bounds_using_local_transform_id: i32,
    pub can_add_child: NodeCanAddChild,
    pub children: Option<Vec<NodeRef>>,
    pub children_id: u32,
    pub color_adjustments: Option<Vec<AdjustmentRef>>,
    pub color_adjustments_unsupported: bool,
    pub local_bounds_id: u32,
    pub local_bounds_using_local_bounds_id: i32,
    pub local_content_id: u32,
    pub interaction_signals: Unknown,
    pub interaction_state: Unknown,
    pub local_transform_id: u32,
    pub local_transform_using_local_transform_id: i32,
    pub node_signals: Option<Ref<NodeSignals>>,
    pub parent: Option<NodeWeak>,
    pub parent_reference_id: u32,
    pub resolved_color_matrix: Option<[f32; 20]>,
    pub resolved_color_scale_bias: Option<ColorScaleBias>,
    pub traits: Option<NodeTraitsKey>,
    pub world_bounds_using_local_bounds_id: i32,
    pub world_bounds_using_world_transform_id: i32,
    pub world_transform_id: u32,
    pub world_transform_using_local_transform_id: i32,
    pub world_transform_using_parent_transform_id: i32,
}

/// The five graph signals a node activates on demand (TS `NodeSignals`).
pub struct NodeSignals {
    runtime: EntityRuntimeSlot,
    pub on_child_added: Signal<NodeRef>,
    pub on_child_removed: Signal<NodeRef>,
    pub on_children_changed: Signal<()>,
    pub on_children_order_changed: Signal<()>,
    pub on_parent_changed: Signal<()>,
}

/// The shared appearance field group (TS `HasAppearance`).
#[derive(Clone, Debug, PartialEq)]
pub struct HasAppearance {
    pub alpha: f32,
    pub visible: bool,
}

/// The shared appearance runtime tier (TS `HasAppearanceRuntime`).
pub struct HasAppearanceRuntime {
    pub world_alpha: Option<f32>,
    pub world_alpha_using_appearance_id: i32,
    pub world_alpha_using_parent_appearance_id: i32,
    pub world_appearance_id: u32,
}

/// The per-instance 2D compositing field group (TS `HasBlendMode`).
#[derive(Clone, Debug, PartialEq)]
pub struct HasBlendMode {
    pub blend_mode: Option<BlendMode>,
}

/// The clip field group (TS `HasClip`): the region applied to this node's subtree, or `None`.
#[derive(Clone, Debug, Default)]
pub struct HasClip {
    pub clip: Option<Ref<ClipRegion>>,
}

/// The 2D material field group (TS `HasMaterial`): the shared material and its per-node data, or
/// `None` for the standard pipeline. Both members are open-family handles, so a derived kind keeps
/// its original shared identity.
#[derive(Clone, Default)]
pub struct HasMaterial {
    pub material: Option<Ref<dyn Material2D>>,
    pub material_data: Option<Ref<dyn MaterialData>>,
}

/// The decomposed 2D local transform field group (TS `HasTransform2D`).
#[derive(Clone, Debug, PartialEq)]
pub struct HasTransform2D {
    pub pivot_x: f32,
    pub pivot_y: f32,
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub skew_x: f32,
    pub skew_y: f32,
    pub x: f32,
    pub y: f32,
}

/// The 2D transform runtime cache (TS `HasTransform2DRuntime`).
pub struct HasTransform2DRuntime {
    pub local_matrix: Option<Matrix>,
    pub rotation_angle: f32,
    pub rotation_cosine: f32,
    pub rotation_sine: f32,
    pub world_matrix: Option<Matrix>,
}

/// The decomposed 3D local transform field group (TS `HasTransform3D`).
#[derive(Clone, Debug, PartialEq)]
pub struct HasTransform3D {
    pub position: Vector3,
    pub rotation: Quaternion,
    pub scale: Vector3,
}

/// The 3D transform runtime cache (TS `HasTransform3DRuntime`).
pub struct HasTransform3DRuntime {
    pub local_matrix4: Option<Matrix4>,
    pub local_matrix4_detached: bool,
    pub world_matrix4: Option<Matrix4>,
}

/// The bounds field group (TS `HasBoundsRectangle`); its state lives entirely on the runtime tier.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct HasBoundsRectangle {}

/// The bounds runtime tier (TS `HasBoundsRectangleRuntime`).
pub struct HasBoundsRectangleRuntime {
    pub bounds_rectangle: Option<Rectangle>,
    pub compute_local_bounds_rectangle: NodeLocalBoundsComputer,
    pub is_local_bounds_rectangle_valid: Option<NodeLocalBoundsValidity>,
    pub local_bounds_rectangle: Option<Rectangle>,
    pub world_bounds_rectangle: Option<Rectangle>,
}

/// Any node (TS `Node`, an open base contract). Feature accessors are optional narrowing hooks for
/// family code, mirroring the source's structural casts on `dyn` handles.
pub trait Node: flight_entity::Entity + Any + Send + Sync {
    fn node_fields(&self) -> &NodeFields;
    fn node_fields_mut(&mut self) -> &mut NodeFields;
    fn as_any(&self) -> &dyn Any;

    fn node_runtime(&self) -> &NodeRuntime {
        return &self.node_fields().state;
    }

    fn node_runtime_mut(&mut self) -> &mut NodeRuntime {
        return &mut self.node_fields_mut().state;
    }

    fn as_transform2d_node(&self) -> Option<&dyn Transform2DNode> {
        return None;
    }

    fn as_transform2d_node_mut(&mut self) -> Option<&mut dyn Transform2DNode> {
        return None;
    }

    fn as_transform3d_node(&self) -> Option<&dyn Transform3DNode> {
        return None;
    }

    fn as_transform3d_node_mut(&mut self) -> Option<&mut dyn Transform3DNode> {
        return None;
    }

    fn as_bounds_node(&self) -> Option<&dyn BoundsNode> {
        return None;
    }

    fn as_bounds_node_mut(&mut self) -> Option<&mut dyn BoundsNode> {
        return None;
    }

    fn as_appearance_node(&self) -> Option<&dyn AppearanceNode> {
        return None;
    }

    fn as_clip_node(&self) -> Option<&dyn ClipNode> {
        return None;
    }

    fn as_clip_node_mut(&mut self) -> Option<&mut dyn ClipNode> {
        return None;
    }

    fn as_material_node(&self) -> Option<&dyn MaterialNode> {
        return None;
    }

    fn as_material_node_mut(&mut self) -> Option<&mut dyn MaterialNode> {
        return None;
    }
}

/// Any node with a 2D local transform (TS `Transform2DNode`).
pub trait Transform2DNode: Node {
    fn transform2d(&self) -> &HasTransform2D;
    fn transform2d_mut(&mut self) -> &mut HasTransform2D;
    fn transform2d_runtime(&self) -> &HasTransform2DRuntime;
    fn transform2d_runtime_mut(&mut self) -> &mut HasTransform2DRuntime;
}

/// Any node with a 3D local transform (TS `Transform3DNode`).
pub trait Transform3DNode: Node {
    fn transform3d(&self) -> &HasTransform3D;
    fn transform3d_mut(&mut self) -> &mut HasTransform3D;
    fn transform3d_runtime(&self) -> &HasTransform3DRuntime;
    fn transform3d_runtime_mut(&mut self) -> &mut HasTransform3DRuntime;
}

/// Any node that owns a bounds extent (TS `BoundsNode`).
pub trait BoundsNode: Node {
    fn bounds_runtime(&self) -> &HasBoundsRectangleRuntime;
    fn bounds_runtime_mut(&mut self) -> &mut HasBoundsRectangleRuntime;
}

/// Any node with hierarchical appearance (TS `AppearanceNode`).
pub trait AppearanceNode: Node {
    fn appearance(&self) -> &HasAppearance;
    fn appearance_mut(&mut self) -> &mut HasAppearance;
    fn appearance_runtime(&self) -> &HasAppearanceRuntime;
    fn appearance_runtime_mut(&mut self) -> &mut HasAppearanceRuntime;
}

/// Any node carrying a clip region (TS `ClipNode`).
pub trait ClipNode: Node {
    fn clip(&self) -> &HasClip;
    fn clip_mut(&mut self) -> &mut HasClip;
}

/// Any node carrying a 2D material (TS `MaterialNode`).
pub trait MaterialNode: Node {
    fn material(&self) -> &HasMaterial;
    fn material_mut(&mut self) -> &mut HasMaterial;
}

/// A reusable ordering list over a node's children (TS `NodeOrderList`). `entry_count` is the valid
/// window into the two parallel arrays; capacity past it is reused, as in the source.
// flight-lint: allow(f64) D1: sort keys are arbitrary JS numbers (fractional and negative are legal); ordering and subtraction must match TS
pub struct NodeOrderList {
    runtime: EntityRuntimeSlot,
    pub entry_count: usize,
    pub nodes: Vec<NodeRef>,
    pub sort_keys: Vec<f64>,
}

/// Options for `create_viewport` (TS `ViewportLike`, a partial Viewport).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ViewportOptions {
    pub device_pixel_ratio: Option<f32>,
    pub height: Option<f32>,
    pub width: Option<f32>,
    pub x: Option<f32>,
    pub y: Option<f32>,
}

/// The bedrock drawable rectangle a scene renders into (TS `Viewport`). Passive plain data: it does
/// not own its drawable.
#[derive(Clone, Debug, PartialEq)]
pub struct Viewport {
    runtime: EntityRuntimeSlot,
    pub device_pixel_ratio: f32,
    pub height: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

/// How scene2d content is mapped into the view (TS `ViewportScaleMode`), a closed union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ViewportScaleMode {
    ExactFit,
    NoBorder,
    NoScale,
    ShowAll,
}

/// The structural fit context `compute_scene2d_fit_transform` reads (TS `Scene2DFitContext`): the
/// root node plus how it maps into the view. Kept structural so the fit math stays in this crate.
#[derive(Clone)]
pub struct Scene2DFitContext {
    pub align: ViewportAlign,
    pub root: Option<NodeRef>,
    pub scale_mode: ViewportScaleMode,
}

// ---------------------------------------------------------------------------
// Construction helpers
// ---------------------------------------------------------------------------

pub(crate) fn create_node_runtime_internal(
    methods: Option<&crate::node::NodeRuntimeMethods>,
) -> NodeRuntime {
    let can_add_child = methods
        .and_then(|methods| methods.can_add_child.clone())
        .unwrap_or_else(|| Arc::new(default_node_can_add_child));
    return NodeRuntime {
        appearance_id: 0,
        bounds_using_local_bounds_id: -1,
        bounds_using_local_transform_id: -1,
        can_add_child,
        children: None,
        children_id: 0,
        color_adjustments: None,
        color_adjustments_unsupported: false,
        local_bounds_id: 0,
        local_bounds_using_local_bounds_id: -1,
        local_content_id: 0,
        interaction_signals: None,
        interaction_state: None,
        local_transform_id: 0,
        local_transform_using_local_transform_id: -1,
        node_signals: None,
        parent: None,
        parent_reference_id: 0,
        resolved_color_matrix: None,
        resolved_color_scale_bias: None,
        traits: None,
        world_bounds_using_local_bounds_id: -1,
        world_bounds_using_world_transform_id: -1,
        world_transform_id: 0,
        world_transform_using_local_transform_id: -1,
        world_transform_using_parent_transform_id: -1,
    };
}

pub(crate) fn default_node_can_add_child(_target: &dyn Node, _child: &dyn Node) -> bool {
    return true;
}

pub(crate) fn init_bounds_rectangle_runtime_value(
    methods: Option<&crate::has_bounds_rectangle::BoundsRectangleRuntimeMethods>,
) -> HasBoundsRectangleRuntime {
    let compute = methods
        .and_then(|methods| methods.compute_local_bounds_rectangle.clone())
        .unwrap_or_else(|| Arc::new(|_out: &mut Rectangle, _source: &dyn Node| {}));
    return HasBoundsRectangleRuntime {
        bounds_rectangle: None,
        compute_local_bounds_rectangle: compute,
        is_local_bounds_rectangle_valid: methods
            .and_then(|methods| methods.is_local_bounds_rectangle_valid.clone()),
        local_bounds_rectangle: None,
        world_bounds_rectangle: None,
    };
}

pub(crate) fn init_transform2d_runtime_value() -> HasTransform2DRuntime {
    return HasTransform2DRuntime {
        local_matrix: None,
        rotation_angle: 0.0,
        rotation_cosine: 1.0,
        rotation_sine: 0.0,
        world_matrix: None,
    };
}

pub(crate) fn init_transform3d_runtime_value() -> HasTransform3DRuntime {
    return HasTransform3DRuntime {
        local_matrix4: None,
        local_matrix4_detached: false,
        world_matrix4: None,
    };
}

pub(crate) fn init_transform3d_value() -> HasTransform3D {
    return HasTransform3D {
        position: flight_geometry::create_vector3(0.0, 0.0, 0.0),
        rotation: flight_geometry::create_quaternion(0.0, 0.0, 0.0, 1.0),
        scale: flight_geometry::create_vector3(1.0, 1.0, 1.0),
    };
}

impl NodeFields {
    pub(crate) fn state_mut(&mut self) -> &mut NodeRuntime {
        return &mut self.state;
    }
}

impl Default for NodeFields {
    fn default() -> Self {
        return NodeFields {
            runtime: EntityRuntimeSlot { data: None },
            state: create_node_runtime_internal(None),
            enabled: true,
            kind: String::new(),
            name: None,
        };
    }
}

impl Default for NodeRuntime {
    fn default() -> Self {
        return create_node_runtime_internal(None);
    }
}

impl Default for NodeSignals {
    fn default() -> Self {
        return NodeSignals {
            runtime: EntityRuntimeSlot { data: None },
            on_child_added: flight_signals::create_signal(),
            on_child_removed: flight_signals::create_signal(),
            on_children_changed: flight_signals::create_signal(),
            on_children_order_changed: flight_signals::create_signal(),
            on_parent_changed: flight_signals::create_signal(),
        };
    }
}

impl Default for HasAppearance {
    fn default() -> Self {
        return HasAppearance {
            alpha: 1.0,
            visible: true,
        };
    }
}

impl Default for HasAppearanceRuntime {
    fn default() -> Self {
        return HasAppearanceRuntime {
            world_alpha: None,
            world_alpha_using_appearance_id: -1,
            world_alpha_using_parent_appearance_id: -1,
            world_appearance_id: 0,
        };
    }
}

impl Default for HasBlendMode {
    fn default() -> Self {
        return HasBlendMode { blend_mode: None };
    }
}

impl Default for HasTransform2D {
    fn default() -> Self {
        return HasTransform2D {
            pivot_x: 0.0,
            pivot_y: 0.0,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            skew_x: 0.0,
            skew_y: 0.0,
            x: 0.0,
            y: 0.0,
        };
    }
}

impl Default for HasTransform2DRuntime {
    fn default() -> Self {
        return init_transform2d_runtime_value();
    }
}

impl Default for HasTransform3D {
    fn default() -> Self {
        return init_transform3d_value();
    }
}

impl Default for HasTransform3DRuntime {
    fn default() -> Self {
        return init_transform3d_runtime_value();
    }
}

impl Default for HasBoundsRectangleRuntime {
    fn default() -> Self {
        return init_bounds_rectangle_runtime_value(None);
    }
}

flight_entity::impl_entity!(NodeFields);
flight_entity::impl_entity!(NodeSignals);

impl Default for NodeOrderList {
    fn default() -> Self {
        return NodeOrderList {
            runtime: EntityRuntimeSlot { data: None },
            entry_count: 0,
            nodes: Vec::new(),
            sort_keys: Vec::new(),
        };
    }
}

impl Default for Viewport {
    fn default() -> Self {
        return Viewport {
            runtime: EntityRuntimeSlot { data: None },
            device_pixel_ratio: 1.0,
            height: 0.0,
            width: 0.0,
            x: 0.0,
            y: 0.0,
        };
    }
}

flight_entity::impl_entity!(NodeOrderList);
flight_entity::impl_entity!(Viewport);
