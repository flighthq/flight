use crate::blend::BlendMode;
use crate::entity::Entity;
use crate::geometry::Matrix4;
use crate::kind::KindId;
use crate::material::{Material, MaterialData};

// ---------------------------------------------------------------------------
// Node traits and data containers
// ---------------------------------------------------------------------------

/// Arbitrary per-node data payload (kind-specific fields).
pub trait NodeData: std::any::Any + Send + Sync {}

/// Core node fields shared by every scene graph node.
#[derive(Clone, Debug)]
pub struct NodeTraits {
    /// Whether this node is enabled (paused/disabled nodes skip updates).
    pub enabled: bool,
    /// The kind identifier for this node type.
    pub kind: KindId,
    /// Optional debug name.
    pub name: Option<String>,
}

impl Default for NodeTraits {
    fn default() -> Self {
        Self {
            enabled: true,
            kind: KindId::new(),
            name: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Feature traits — each maps to a TS Has* interface
// ---------------------------------------------------------------------------

/// 2D transform: position, rotation, scale, pivot.
pub trait HasTransform2D {
    fn pivot_x(&self) -> f32;
    fn pivot_y(&self) -> f32;
    fn rotation(&self) -> f32;
    fn scale_x(&self) -> f32;
    fn scale_y(&self) -> f32;
    fn x(&self) -> f32;
    fn y(&self) -> f32;
}

/// 3D transform via a 4×4 local matrix.
pub trait HasTransform3D {
    fn local_matrix(&self) -> &Matrix4;
}

/// Bounds rectangle capability.
pub trait HasBoundsRectangle: Entity {
    // Runtime computes bounds lazily; trait marks the capability.
}

/// Geometric clip applied to this node and its subtree.
pub trait HasClip: Entity {
    fn clip(&self) -> Option<&crate::node_types::ClipRegion>;
}

/// Material override for this node.
pub trait HasMaterial {
    fn material(&self) -> Option<&dyn Material>;
    fn material_data(&self) -> Option<&dyn MaterialData>;
}

/// Appearance properties: alpha, blend mode, visibility.
pub trait HasAppearanceTrait {
    fn alpha(&self) -> f32;
    fn blend_mode(&self) -> Option<BlendMode>;
    fn is_visible(&self) -> bool;
}

/// Per-node color transform (opt-in).
pub trait HasColorTransform {
    fn color_transform(&self) -> Option<&crate::material::ColorTransform>;
}

// ---------------------------------------------------------------------------
// Computed alias types (mirror TS union aliases)
// ---------------------------------------------------------------------------

/// A node that has both bounds and 2D transform (Spatial2DNode).
pub trait Spatial2DNode: HasBoundsRectangle + HasTransform2D {}

// ---------------------------------------------------------------------------
// ClipRegion (referenced by HasClip)
// ---------------------------------------------------------------------------

// Imported by node consumers; declared here to avoid circular deps.
pub use crate::node_types::ClipRegion;
pub use crate::node_types::PathWinding;
