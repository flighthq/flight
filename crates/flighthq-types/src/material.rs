use crate::entity::Entity;
use crate::kind::KindId;

/// Serializable per-node rendering intent.
///
/// A material identifies the rendering pipeline (`kind`) that the backend uses
/// to draw nodes that carry it. Plain data only — no GPU handles, no function
/// pointers — so a material round-trips through scene serialization.
pub trait Material: Entity {
    /// Shared registry key for the pipeline this material selects.
    fn kind(&self) -> KindId;
}

/// A structural `Material`-like value that may not carry full entity identity.
#[derive(Clone, Debug)]
pub struct MaterialLike {
    pub kind: KindId,
}

/// Per-node, material-specific data companion (`HasMaterial.material_data`).
///
/// Its concrete shape is defined by the material kind that reads it.
pub trait MaterialData: std::any::Any + std::fmt::Debug + Send + Sync {}

/// Resolved when a node carries no material. The built-in default renderer
/// draws the node with the standard pipeline.
pub const DEFAULT_MATERIAL_KIND_VALUE: u64 = 0;

/// Runtime id for the default material pipeline.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Debug)]
pub struct DefaultMaterialKind;

// ---------------------------------------------------------------------------
// ColorTransform
// ---------------------------------------------------------------------------

/// Per-channel color multiplier and offset. Matches Flash / OpenFL ColorTransform.
///
/// Final channel = clamp(channel * multiplier + offset, 0, 1).
#[derive(Clone, Debug)]
pub struct ColorTransform {
    pub red_multiplier: f32,
    pub green_multiplier: f32,
    pub blue_multiplier: f32,
    pub alpha_multiplier: f32,
    pub red_offset: f32,
    pub green_offset: f32,
    pub blue_offset: f32,
    pub alpha_offset: f32,
}

impl Entity for ColorTransform {}

impl Default for ColorTransform {
    fn default() -> Self {
        Self {
            red_multiplier: 1.0,
            green_multiplier: 1.0,
            blue_multiplier: 1.0,
            alpha_multiplier: 1.0,
            red_offset: 0.0,
            green_offset: 0.0,
            blue_offset: 0.0,
            alpha_offset: 0.0,
        }
    }
}

/// A `ColorTransform`-like value (no entity identity).
#[derive(Clone, Debug)]
pub struct ColorTransformLike {
    pub red_multiplier: f32,
    pub green_multiplier: f32,
    pub blue_multiplier: f32,
    pub alpha_multiplier: f32,
    pub red_offset: f32,
    pub green_offset: f32,
    pub blue_offset: f32,
    pub alpha_offset: f32,
}

// Default is identity (all multipliers 1.0, all offsets 0.0), matching
// `ColorTransform::default()` — a zeroed color transform would erase all
// color, not leave it unchanged.
impl Default for ColorTransformLike {
    fn default() -> Self {
        Self {
            red_multiplier: 1.0,
            green_multiplier: 1.0,
            blue_multiplier: 1.0,
            alpha_multiplier: 1.0,
            red_offset: 0.0,
            green_offset: 0.0,
            blue_offset: 0.0,
            alpha_offset: 0.0,
        }
    }
}

// ---------------------------------------------------------------------------
// ColorTransformMaterial
// ---------------------------------------------------------------------------

/// Per-instance color transform material.
///
/// Packs each node's `HasColorTransform` as additional instance attribute
/// data (8 floats: 4 multiplier + 4 offset) so tinted nodes stay in one batch.
/// Use `UniformColorTransformMaterial` for a whole-batch tint at lower cost.
pub struct ColorTransformMaterial {
    pub kind: KindId,
}

impl Entity for ColorTransformMaterial {}

impl Material for ColorTransformMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}

// ---------------------------------------------------------------------------
// UniformColorTransformMaterial
// ---------------------------------------------------------------------------

/// Per-batch color transform material.
///
/// The transform lives on the material and uploads as a single GPU uniform
/// for the whole batch. Cheapest path for tinting a whole group or layer.
/// Use `ColorTransformMaterial` when many nodes need distinct tints in one batch.
#[derive(Clone, Debug)]
pub struct UniformColorTransformMaterial {
    pub kind: KindId,
    pub color_transform: ColorTransform,
}

impl Entity for UniformColorTransformMaterial {}

impl Material for UniformColorTransformMaterial {
    fn kind(&self) -> KindId {
        self.kind
    }
}
