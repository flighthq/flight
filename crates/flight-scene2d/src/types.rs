//! scene2d-owned declarations: the Node2D family fields, runtime tier and trait, the concrete 2D
//! kinds, the Scene2D presentation context and its records (TS `Node2D.ts`, `DisplayObject.ts`,
//! `Sprite.ts`, `Scale9Sprite.ts`, `HtmlView.ts`, `Scene2D*.ts`, `Node2DAnimation*.ts`).
//!
//! D16: a kind struct composes `Node2DFields` (which composes flight-node's `NodeFields` and the
//! `Has*` field groups) and dereferences to it; the 2D runtime tier is a private field of
//! `Node2DFields`, kind runtime extras are private fields of the kind struct, and the single entity
//! binding/uid slot is the one inside `NodeFields`.

// flight-lint: allow-file(contract-vocabulary) D16 open Node2D family: trait objects, the scene back-pointer and the feature-group accessors are the approved family dispatch

use std::any::Any;
use std::fmt;
use std::ops::{Deref, DerefMut};
use std::sync::{Arc, RwLock, Weak};

use flight_entity::{EntityRuntimeSlot, Kind, Ref, Unknown};
use flight_geometry::Rectangle;
use flight_layout::ViewportAlign;
use flight_materials::BlendMode;
use flight_materials::contract::{Material2D, MaterialData};
use flight_node::contract::{NodeLocalBoundsComputer, NodeLocalBoundsValidity};
use flight_node::{
    AppearanceNode, BoundsNode, ClipNode, HasAppearanceRuntime, HasBoundsRectangleRuntime,
    HasTransform2DRuntime, MaterialNode, Node, NodeFields, RendererDataFields, Transform2DNode,
    ViewportScaleMode,
};
use flight_signals::Signal;
use flight_texture::Texture;

/// The kind of a plain display object (TS `DisplayObjectKind`).
pub const DISPLAY_OBJECT_KIND: &str = "DisplayObject";
/// The kind of a texture-backed sprite (TS `SpriteKind`).
pub const SPRITE_KIND: &str = "Sprite";
/// The kind of a nine-slice sprite (TS `Scale9SpriteKind`).
pub const SCALE9_SPRITE_KIND: &str = "Scale9Sprite";
/// The kind of a host-element view (TS `HtmlViewKind`).
pub const HTML_VIEW_KIND: &str = "HtmlView";

/// A shared handle to any node of the 2D family (TS `Node2D` object identity).
pub type Node2DRef = Ref<dyn Node2D>;

/// A runtime factory a 2D kind constructor installs (TS `Node2DRuntimeFactory`).
pub type Node2DRuntimeFactory = fn() -> Node2DRuntime;

/// The 2D runtime tier inherited by `DisplayObject` (TS `DisplayObjectRuntime`, which adds nothing).
pub type DisplayObjectRuntime = Node2DRuntime;

/// The 2D runtime tier inherited by `HtmlView` (TS `HtmlViewRuntime`, which adds nothing).
pub type HtmlViewRuntime = Node2DRuntime;

/// The runtime extras of a nine-slice sprite (TS `Scale9SpriteRuntime`, which adds nothing to Sprite's).
pub type Scale9SpriteRuntime = SpriteRuntime;

/// The base fields every 2D node has (TS `Node2DTraits`), flat as in the source (Principal
/// 939e24d3): the decomposed 2D transform, appearance, blend mode, clip and material, over
/// flight-node's common node fields. Kind data lives on the kind's own struct as `data`.
/// Dereferences to `NodeFields` for `kind`, `name` and `enabled`.
pub struct Node2DFields {
    node: NodeFields,
    state: Node2DRuntime,
    pub alpha: f32,
    pub blend_mode: Option<BlendMode>,
    pub clip: Option<Ref<flight_clip::ClipRegion>>,
    pub material: Option<Ref<dyn Material2D>>,
    pub material_data: Option<Ref<dyn MaterialData>>,
    pub pivot_x: f32,
    pub pivot_y: f32,
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub skew_x: f32,
    pub skew_y: f32,
    pub visible: bool,
    pub x: f32,
    pub y: f32,
}

/// The private 2D runtime tier (TS `Node2DRuntime`): the transform, bounds and appearance caches
/// plus the scene2d back-pointer. The base `NodeRuntime` tier it extends is `NodeFields`' own,
/// reached with flight-node's `get_node_runtime`.
pub struct Node2DRuntime {
    pub appearance: HasAppearanceRuntime,
    pub bounds: HasBoundsRectangleRuntime,
    /// The scene a display root belongs to, set by `create_scene2d` and `None` on every other node.
    /// A non-owning link (the scene owns its root), as flight-node's parent link.
    pub scene2d: Option<Weak<RwLock<Scene2D>>>,
    pub transform2d: HasTransform2DRuntime,
}

/// Caller-supplied runtime methods (TS `Partial<MethodsOf<Node2DRuntime>>` plus
/// `isLocalBoundsRectangleValid`). The base tier's `canAddChild` stays on flight-node's
/// `NodeRuntimeMethods`.
#[derive(Clone, Default)]
pub struct Node2DRuntimeMethods {
    pub compute_local_bounds_rectangle: Option<NodeLocalBoundsComputer>,
    pub is_local_bounds_rectangle_valid: Option<NodeLocalBoundsValidity>,
}

/// Construction options for any 2D node (TS `PartialNode<Node2D>`); `None` keeps the source default.
#[derive(Clone, Default)]
pub struct PartialNode2D {
    pub alpha: Option<f32>,
    pub blend_mode: Option<BlendMode>,
    pub clip: Option<Ref<flight_clip::ClipRegion>>,
    pub enabled: Option<bool>,
    pub material: Option<Ref<dyn Material2D>>,
    pub material_data: Option<Ref<dyn MaterialData>>,
    pub name: Option<String>,
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotation: Option<f32>,
    pub scale_x: Option<f32>,
    pub scale_y: Option<f32>,
    pub skew_x: Option<f32>,
    pub skew_y: Option<f32>,
    pub visible: Option<bool>,
    pub x: Option<f32>,
    pub y: Option<f32>,
}

/// Any node of the 2D family (TS `Node2D`, an open base contract). Implement it for a custom kind
/// with `impl_node2d!`.
// The flat fields reach flight-node's generic features through borrowed views (Principal 939e24d3).
pub trait Node2D:
    Node + Transform2DNode + BoundsNode + AppearanceNode + ClipNode + MaterialNode
{
    fn node2d_fields(&self) -> &Node2DFields;
    fn node2d_fields_mut(&mut self) -> &mut Node2DFields;

    /// The recorded shape command stream this node's data carries, or `None` (TS: a node whose
    /// `data` has `commands`). A shape kind implements it over its typed command buffer.
    fn shape_command_stream(&self) -> Option<&dyn Node2DShapeCommandStream> {
        return None;
    }
}

/// A read view over a flat shape command stream (TS `ShapeData.commands`, laid out
/// `[key, argCount, ...args, key, argCount, ...args, …]`). scene2d walks it structurally; the token
/// type stays with the shape package that records it.
// flight-lint: allow(f64) D1: an argument count slot is a JS number token, NaN when the slot is not a number
pub trait Node2DShapeCommandStream {
    /// The total number of tokens in the stream.
    fn len(&self) -> usize;

    /// Whether the stream holds no tokens.
    fn is_empty(&self) -> bool {
        return self.len() == 0;
    }

    /// The token at `index` read as a command key, or `None` when it is not a string.
    fn key_at(&self, index: usize) -> Option<&str>;

    /// The token at `index` read as a number (an argument count), NaN when absent or not a number.
    fn arg_count_at(&self, index: usize) -> f64;

    /// The token at `index` as the shape package's own token value, or `None` past the end.
    fn arg_at(&self, index: usize) -> Option<&dyn Any>;
}

/// A plain 2D display object with no kind data (TS `DisplayObject`).
#[derive(Default)]
pub struct DisplayObject {
    node: Node2DFields,
}

/// A texture-backed 2D node (TS `Sprite`).
pub struct Sprite {
    node: Node2DFields,
    pub data: SpriteData,
    pub(crate) sprite_runtime: Ref<SpriteRuntime>,
}

/// Sprite kind data (TS `SpriteData`): the displayed texture, or `None`.
#[derive(Clone, Debug, Default)]
pub struct SpriteData {
    runtime: EntityRuntimeSlot,
    pub texture: Option<Ref<Texture>>,
}

/// Options for `create_sprite_data` (TS `Partial<SpriteData>`).
#[derive(Clone, Debug, Default)]
pub struct SpriteDataOptions {
    pub texture: Option<Ref<Texture>>,
}

/// Options for `create_sprite` (TS `PartialNode<Sprite>`).
#[derive(Clone, Default)]
pub struct PartialSprite {
    pub data: Option<SpriteDataOptions>,
    pub node: PartialNode2D,
}

/// Sprite's own runtime fields (TS `SpriteRuntime` minus the inherited `Node2DRuntime` tier): the
/// texture identity and version the cached local bounds were computed from. `-1` means none. A
/// shared handle because bounds computation stamps it while the node is only read-borrowed.
#[derive(Clone, Debug)]
pub struct SpriteRuntime {
    pub local_bounds_texture: Option<Ref<Texture>>,
    pub local_bounds_texture_version: i64,
}

/// A nine-slice sprite (TS `Scale9Sprite`, a `Sprite` whose data adds the slice grid).
pub struct Scale9Sprite {
    node: Node2DFields,
    pub data: Scale9SpriteData,
    pub(crate) sprite_runtime: Ref<Scale9SpriteRuntime>,
}

/// Scale9Sprite kind data (TS `Scale9SpriteData`): the slice grid and the displayed texture.
#[derive(Clone, Debug, Default)]
pub struct Scale9SpriteData {
    runtime: EntityRuntimeSlot,
    pub scale9_grid: Rectangle,
    pub texture: Option<Ref<Texture>>,
}

/// Options for `create_scale9_sprite_data` (TS `Partial<Scale9SpriteData>` past the grid argument).
#[derive(Clone, Debug, Default)]
pub struct Scale9SpriteDataOptions {
    pub texture: Option<Ref<Texture>>,
}

/// Options for `create_scale9_sprite` (TS `PartialNode<Scale9Sprite>`).
#[derive(Clone, Default)]
pub struct PartialScale9Sprite {
    pub data: Option<Scale9SpriteDataOptions>,
    pub node: PartialNode2D,
}

/// A 2D node standing in for a host element (TS `HtmlView`).
#[derive(Default)]
pub struct HtmlView {
    node: Node2DFields,
    pub data: HtmlViewData,
}

/// HtmlView kind data (TS `HtmlViewData`). `element` is the host's opaque element handle (TS
/// `HTMLElement | null`); scene2d never reads it.
// flight-lint: allow(f64) D1: the element size is a JS number, compared exactly by setHtmlViewSize
#[derive(Clone, Default)]
pub struct HtmlViewData {
    runtime: EntityRuntimeSlot,
    pub element: Unknown,
    pub height: f64,
    pub width: f64,
}

/// Options for `create_html_view_data` (TS `Partial<HtmlViewData>`).
// flight-lint: allow(f64) D1: the element size is a JS number
#[derive(Clone, Default)]
pub struct HtmlViewDataOptions {
    pub element: Unknown,
    pub height: Option<f64>,
    pub width: Option<f64>,
}

/// Options for `create_html_view` (TS `PartialNode<HtmlView>`).
#[derive(Clone, Default)]
pub struct PartialHtmlView {
    pub data: Option<HtmlViewDataOptions>,
    pub node: PartialNode2D,
}

/// The presentation context of a 2D display tree (TS `Scene2D`): not a node, but an entity that
/// owns its display root, the fit context mapping that root into the view, the logical view size
/// and the background color. The runtime (signals) is allocated on first access.
// flight-lint: allow(f64) D1: the view size is a JS number, compared exactly by setScene2DSize
pub struct Scene2D {
    runtime: EntityRuntimeSlot,
    pub(crate) state: Option<Scene2DRuntime>,
    pub align: ViewportAlign,
    /// The packed RGBA background color, or `None`.
    pub color: Option<u32>,
    pub root: Node2DRef,
    pub scale_mode: ViewportScaleMode,
    pub scene2d_height: f64,
    pub scene2d_width: f64,
}

/// Options for `create_scene2d` (TS `Partial<Pick<Scene2D, 'align' | 'color' | 'scaleMode' |
/// 'scene2dHeight' | 'scene2dWidth'>>`).
// flight-lint: allow(f64) D1: the view size is a JS number
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Scene2DOptions {
    pub align: Option<ViewportAlign>,
    pub color: Option<u32>,
    pub scale_mode: Option<ViewportScaleMode>,
    pub scene2d_height: Option<f64>,
    pub scene2d_width: Option<f64>,
}

/// The scene's lazily allocated runtime (TS `Scene2DRuntime`, past the entity binding): its signal
/// registry, `None` until enabled.
#[derive(Clone, Default)]
pub struct Scene2DRuntime {
    pub scene2d_signals: Option<Ref<Scene2DSignals>>,
}

/// The scene's view-change signals (TS `Scene2DSignals`).
pub struct Scene2DSignals {
    runtime: EntityRuntimeSlot,
    pub on_fullscreen_changed: Signal<()>,
    pub on_orientation_changed: Signal<()>,
    pub on_resize: Signal<()>,
}

/// Everything a scene contains that some consumer must be registered for (TS `Scene2DKindUsage`):
/// distinct non-Normal blend modes, material kinds, node kinds and shape command keys.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Scene2DKindUsage {
    runtime: EntityRuntimeSlot,
    pub blend_modes: Vec<BlendMode>,
    pub material_kinds: Vec<Kind>,
    pub node_kinds: Vec<Kind>,
    pub shape_command_keys: Vec<String>,
}

/// The per-render-state identity stamp of a sprite's texture (TS `SpriteIdentityRendererData`).
/// `-1` means no texture.
#[derive(Default)]
pub struct SpriteIdentityRendererData {
    renderer_data: RendererDataFields,
    pub texture_identity: Option<Ref<Texture>>,
    pub texture_version: i64,
}

/// A named place in an authored 2D graph where the application supplies content (TS
/// `Scene2DSlotReference`).
pub struct Scene2DSlotReference {
    runtime: EntityRuntimeSlot,
    pub content: Option<Node2DRef>,
    /// The authoring-time class or symbol name a format recorded for this slot, if any.
    pub linkage: Option<String>,
    pub name: String,
    pub required: bool,
    pub target: Node2DRef,
}

/// Which sink of a Node2D an animation channel drives (TS `Node2DAnimationPath`). Vector paths
/// consume two components; scalar paths consume one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Node2DAnimationPath {
    Alpha,
    Pivot,
    PivotX,
    PivotY,
    Position,
    Rotation,
    Scale,
    ScaleX,
    ScaleY,
    Skew,
    SkewX,
    SkewY,
    Visible,
    X,
    Y,
}

/// The family key every 2D node's base runtime carries (TS `Node2DTraitsKey`): it marks the node as
/// a Node2D and holds the kind's narrowing from `dyn Node` back to `dyn Node2D`. One shared key per
/// kind; `is_node2d` tests for the key type, as the source compares the one family symbol.
pub struct Node2DTraitsKey {
    pub(crate) narrow: fn(&dyn Node) -> Option<&dyn Node2D>,
}

/// The target a 2D display animation channel carries (TS `Node2DAnimationTarget`).
#[derive(Clone)]
pub struct Node2DAnimationTarget {
    pub node: Node2DRef,
    pub path: Node2DAnimationPath,
}

/// How a scene's content aligns in its view (TS `Scene2DAlign`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scene2DAlign {
    Bottom,
    BottomLeft,
    BottomRight,
    Left,
    Right,
    Top,
    TopLeft,
    TopRight,
}

/// A scene's display state (TS `Scene2DDisplayState`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scene2DDisplayState {
    Fullscreen,
    FullscreenInteractive,
    Normal,
}

/// A scene's render quality hint (TS `Scene2DQuality`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scene2DQuality {
    Best,
    High,
    Low,
    Medium,
}

/// How a scene's content scales into its view (TS `Scene2DScaleMode`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scene2DScaleMode {
    ExactFit,
    NoBorder,
    NoScale,
    ShowAll,
}

/// Implements the Node2D family plumbing for a kind struct with a private `node: Node2DFields`
/// field: `Entity` (the one binding slot inside `NodeFields`), `Node` with every 2D feature
/// narrowing hook, the five feature traits, `Node2D`, and `Deref`/`DerefMut` to `Node2DFields`.
/// `impl_node2d!(T, custom_node2d)` leaves `Node2D` for the kind to implement, e.g. to override
/// `shape_command_stream`.
#[macro_export]
macro_rules! impl_node2d {
    ($t:ty) => {
        $crate::impl_node2d!($t, custom_node2d);

        impl $crate::contract::Node2D for $t {
            fn node2d_fields(&self) -> &$crate::contract::Node2DFields {
                return &self.node;
            }

            fn node2d_fields_mut(&mut self) -> &mut $crate::contract::Node2DFields {
                return &mut self.node;
            }
        }
    };
    ($t:ty, custom_node2d) => {
        impl flight_entity::Entity for $t {
            fn entity_runtime(&self) -> &flight_entity::EntityRuntimeSlot {
                return flight_entity::Entity::entity_runtime(&*self.node);
            }

            fn entity_runtime_mut(&mut self) -> &mut flight_entity::EntityRuntimeSlot {
                return flight_entity::Entity::entity_runtime_mut(&mut *self.node);
            }
        }

        impl flight_node::Node for $t {
            fn node_fields(&self) -> &flight_node::NodeFields {
                return &self.node;
            }

            fn node_fields_mut(&mut self) -> &mut flight_node::NodeFields {
                return &mut self.node;
            }

            fn as_any(&self) -> &dyn std::any::Any {
                return self;
            }

            fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
                return self;
            }

            fn as_transform2d_node(&self) -> Option<&dyn flight_node::Transform2DNode> {
                return Some(self);
            }

            fn as_transform2d_node_mut(&mut self) -> Option<&mut dyn flight_node::Transform2DNode> {
                return Some(self);
            }

            fn as_bounds_node(&self) -> Option<&dyn flight_node::BoundsNode> {
                return Some(self);
            }

            fn as_bounds_node_mut(&mut self) -> Option<&mut dyn flight_node::BoundsNode> {
                return Some(self);
            }

            fn as_appearance_node(&self) -> Option<&dyn flight_node::AppearanceNode> {
                return Some(self);
            }

            fn as_clip_node(&self) -> Option<&dyn flight_node::ClipNode> {
                return Some(self);
            }

            fn as_clip_node_mut(&mut self) -> Option<&mut dyn flight_node::ClipNode> {
                return Some(self);
            }

            fn as_material_node(&self) -> Option<&dyn flight_node::MaterialNode> {
                return Some(self);
            }

            fn as_material_node_mut(&mut self) -> Option<&mut dyn flight_node::MaterialNode> {
                return Some(self);
            }
        }

        impl flight_node::Transform2DNode for $t {
            fn transform2d(&self) -> flight_node::Transform2DRef<'_> {
                let n = &self.node;
                return flight_node::Transform2DRef {
                    x: &n.x,
                    y: &n.y,
                    rotation: &n.rotation,
                    scale_x: &n.scale_x,
                    scale_y: &n.scale_y,
                    skew_x: &n.skew_x,
                    skew_y: &n.skew_y,
                    pivot_x: &n.pivot_x,
                    pivot_y: &n.pivot_y,
                };
            }

            fn transform2d_mut(&mut self) -> flight_node::Transform2DMut<'_> {
                let n = &mut self.node;
                return flight_node::Transform2DMut {
                    x: &mut n.x,
                    y: &mut n.y,
                    rotation: &mut n.rotation,
                    scale_x: &mut n.scale_x,
                    scale_y: &mut n.scale_y,
                    skew_x: &mut n.skew_x,
                    skew_y: &mut n.skew_y,
                    pivot_x: &mut n.pivot_x,
                    pivot_y: &mut n.pivot_y,
                };
            }

            fn transform2d_runtime(&self) -> &flight_node::HasTransform2DRuntime {
                return &self.node.node2d_runtime().transform2d;
            }

            fn transform2d_runtime_mut(&mut self) -> &mut flight_node::HasTransform2DRuntime {
                return &mut self.node.node2d_runtime_mut().transform2d;
            }
        }

        impl flight_node::AppearanceNode for $t {
            fn appearance(&self) -> flight_node::AppearanceRef<'_> {
                return flight_node::AppearanceRef {
                    alpha: &self.node.alpha,
                    visible: &self.node.visible,
                };
            }

            fn appearance_mut(&mut self) -> flight_node::AppearanceMut<'_> {
                let n = &mut self.node;
                return flight_node::AppearanceMut {
                    alpha: &mut n.alpha,
                    visible: &mut n.visible,
                };
            }

            fn appearance_runtime(&self) -> &flight_node::HasAppearanceRuntime {
                return &self.node.node2d_runtime().appearance;
            }

            fn appearance_runtime_mut(&mut self) -> &mut flight_node::HasAppearanceRuntime {
                return &mut self.node.node2d_runtime_mut().appearance;
            }
        }

        impl flight_node::ClipNode for $t {
            fn clip_view(&self) -> flight_node::ClipRef<'_> {
                return flight_node::ClipRef {
                    clip: &self.node.clip,
                };
            }

            fn clip_view_mut(&mut self) -> flight_node::ClipMut<'_> {
                return flight_node::ClipMut {
                    clip: &mut self.node.clip,
                };
            }
        }

        impl flight_node::MaterialNode for $t {
            fn material_view(&self) -> flight_node::MaterialRef<'_> {
                return flight_node::MaterialRef {
                    material: &self.node.material,
                    material_data: &self.node.material_data,
                };
            }

            fn material_view_mut(&mut self) -> flight_node::MaterialMut<'_> {
                let n = &mut self.node;
                return flight_node::MaterialMut {
                    material: &mut n.material,
                    material_data: &mut n.material_data,
                };
            }
        }

        impl flight_node::BoundsNode for $t {
            fn bounds_runtime(&self) -> &flight_node::HasBoundsRectangleRuntime {
                return &self.node.node2d_runtime().bounds;
            }

            fn bounds_runtime_mut(&mut self) -> &mut flight_node::HasBoundsRectangleRuntime {
                return &mut self.node.node2d_runtime_mut().bounds;
            }
        }

        impl std::ops::Deref for $t {
            type Target = $crate::contract::Node2DFields;

            fn deref(&self) -> &$crate::contract::Node2DFields {
                return &self.node;
            }
        }

        impl std::ops::DerefMut for $t {
            fn deref_mut(&mut self) -> &mut $crate::contract::Node2DFields {
                return &mut self.node;
            }
        }
    };
}

// flight-lint: allow(sugar-delegates) D16 family composition: the private runtime tier accessors the feature traits and kind constructors use
impl Node2DFields {
    /// The private 2D runtime tier; read it through `get_node2d_runtime`.
    #[doc(hidden)]
    pub fn node2d_runtime(&self) -> &Node2DRuntime {
        return &self.state;
    }

    /// The private 2D runtime tier, for kind constructors and the feature traits.
    #[doc(hidden)]
    pub fn node2d_runtime_mut(&mut self) -> &mut Node2DRuntime {
        return &mut self.state;
    }
}

// flight-lint: allow(sugar-delegates) D16 family composition: Node2DFields extends NodeFields
impl Deref for Node2DFields {
    type Target = NodeFields;

    fn deref(&self) -> &NodeFields {
        return &self.node;
    }
}

// flight-lint: allow(sugar-delegates) D16 family composition: Node2DFields extends NodeFields
impl DerefMut for Node2DFields {
    fn deref_mut(&mut self) -> &mut NodeFields {
        return &mut self.node;
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; create_node2d sets the source defaults
impl Default for Node2DFields {
    fn default() -> Self {
        return Node2DFields {
            node: NodeFields::default(),
            state: Node2DRuntime::default(),
            alpha: 1.0,
            blend_mode: None,
            clip: None,
            material: None,
            material_data: None,
            pivot_x: 0.0,
            pivot_y: 0.0,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            skew_x: 0.0,
            skew_y: 0.0,
            visible: true,
            x: 0.0,
            y: 0.0,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; create_node2d_runtime installs the kind methods
impl Default for Node2DRuntime {
    fn default() -> Self {
        return Node2DRuntime {
            appearance: HasAppearanceRuntime::default(),
            bounds: HasBoundsRectangleRuntime::default(),
            scene2d: None,
            transform2d: HasTransform2DRuntime::default(),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; create_sprite sets the source defaults
impl Default for Sprite {
    fn default() -> Self {
        return Sprite {
            node: Node2DFields::default(),
            data: SpriteData::default(),
            sprite_runtime: Arc::new(RwLock::new(SpriteRuntime::default())),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the source runtime starts with no texture stamp
impl Default for SpriteRuntime {
    fn default() -> Self {
        return SpriteRuntime {
            local_bounds_texture: None,
            local_bounds_texture_version: -1,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; create_scale9_sprite sets the source defaults
impl Default for Scale9Sprite {
    fn default() -> Self {
        return Scale9Sprite {
            node: Node2DFields::default(),
            data: Scale9SpriteData::default(),
            sprite_runtime: Arc::new(RwLock::new(SpriteRuntime::default())),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_scene2d sets the source defaults
impl Default for Scene2D {
    fn default() -> Self {
        let root: Node2DRef = Arc::new(RwLock::new(DisplayObject::default()));
        return Scene2D {
            runtime: EntityRuntimeSlot::default(),
            state: None,
            align: ViewportAlign::TopLeft,
            color: None,
            root,
            scale_mode: ViewportScaleMode::NoScale,
            scene2d_height: 550.0,
            scene2d_width: 400.0,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: allocate_entity needs a Default; initialize_scene2d_signals creates the signals
impl Default for Scene2DSignals {
    fn default() -> Self {
        return Scene2DSignals {
            runtime: EntityRuntimeSlot::default(),
            on_fullscreen_changed: Signal::default(),
            on_orientation_changed: Signal::default(),
            on_resize: Signal::default(),
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the runtime tier holds closures, so Debug reports its cached state
impl fmt::Debug for Node2DRuntime {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("Node2DRuntime")
            .field(
                "local_bounds_rectangle",
                &self.bounds.local_bounds_rectangle,
            )
            .field("local_matrix", &self.transform2d.local_matrix)
            .field("scene2d", &self.scene2d.is_some())
            .field("world_alpha", &self.appearance.world_alpha)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the fields hold open-family handles, so Debug reports the plain field groups
impl fmt::Debug for Node2DFields {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("Node2DFields")
            .field("kind", &self.node.kind)
            .field("name", &self.node.name)
            .field("enabled", &self.node.enabled)
            .field("alpha", &self.alpha)
            .field("blend_mode", &self.blend_mode)
            .field("clip", &self.clip.is_some())
            .field("material", &self.material.is_some())
            .field("material_data", &self.material_data.is_some())
            .field("pivot_x", &self.pivot_x)
            .field("pivot_y", &self.pivot_y)
            .field("rotation", &self.rotation)
            .field("scale_x", &self.scale_x)
            .field("scale_y", &self.scale_y)
            .field("skew_x", &self.skew_x)
            .field("skew_y", &self.skew_y)
            .field("visible", &self.visible)
            .field("x", &self.x)
            .field("y", &self.y)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: Debug reports the composed base fields
impl fmt::Debug for DisplayObject {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("DisplayObject")
            .field("node", &self.node)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: Debug reports the base fields and kind data
impl fmt::Debug for Sprite {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("Sprite")
            .field("node", &self.node)
            .field("data", &self.data)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: Debug reports the base fields and kind data
impl fmt::Debug for Scale9Sprite {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("Scale9Sprite")
            .field("node", &self.node)
            .field("data", &self.data)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the element is an opaque host value, so Debug reports whether it is set
impl fmt::Debug for HtmlViewData {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("HtmlViewData")
            .field("element", &self.element.is_some())
            .field("height", &self.height)
            .field("width", &self.width)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: Debug reports the base fields and kind data
impl fmt::Debug for HtmlView {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("HtmlView")
            .field("node", &self.node)
            .field("data", &self.data)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: Debug reports the stamp, not the binding slot
impl fmt::Debug for SpriteIdentityRendererData {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("SpriteIdentityRendererData")
            .field("texture_identity", &self.texture_identity.is_some())
            .field("texture_version", &self.texture_version)
            .finish();
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the root and runtime are shared handles, so Debug reports the plain fields
impl fmt::Debug for Scene2D {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("Scene2D")
            .field("align", &self.align)
            .field("color", &self.color)
            .field("scale_mode", &self.scale_mode)
            .field("scene2d_height", &self.scene2d_height)
            .field("scene2d_width", &self.scene2d_width)
            .finish();
    }
}

impl_node2d!(DisplayObject);
impl_node2d!(Sprite);
impl_node2d!(Scale9Sprite);
impl_node2d!(HtmlView);

flight_entity::impl_entity!(SpriteData);
flight_entity::impl_entity!(Scale9SpriteData);
flight_entity::impl_entity!(HtmlViewData);
flight_entity::impl_entity!(Scene2D);
flight_entity::impl_entity!(Scene2DSignals);
flight_entity::impl_entity!(Scene2DKindUsage);
flight_node::impl_renderer_data!(SpriteIdentityRendererData);
flight_entity::impl_entity!(Scene2DSlotReference);
