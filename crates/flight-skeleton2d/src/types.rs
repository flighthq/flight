//! Skeleton2D-owned declarations: the rig, bones, slots, attachment and constraint families, skins,
//! slot deforms and the guard report records (TS `Skeleton2D.ts`, `Bone2D.ts`, `Slot2D.ts`,
//! `Attachment2D.ts` and the concrete attachment/constraint/skin declarations).

// flight-lint: allow-file(contract-vocabulary, sugar-delegates) D16 open attachment/constraint families use Ref<dyn ...> shared identity and structural trait accessors, not convenience sugar

use std::any::Any;
use std::sync::Arc;

use flight_entity::{Entity, EntityRuntimeSlot, Kind, Ref};
use flight_path::PathWinding;

/// Floats in one flat 2x3 affine bone matrix (a, b, c, d, tx, ty).
pub const SKELETON_2D_MATRIX_STRIDE: usize = 6;

/// The `RegionAttachment2D` kind.
pub const REGION_ATTACHMENT_2D_KIND: &str = "RegionAttachment2D";
/// The `MeshAttachment2D` kind.
pub const MESH_ATTACHMENT_2D_KIND: &str = "MeshAttachment2D";
/// The `PathAttachment2D` kind.
pub const PATH_ATTACHMENT_2D_KIND: &str = "PathAttachment2D";
/// The `PointAttachment2D` kind.
pub const POINT_ATTACHMENT_2D_KIND: &str = "PointAttachment2D";
/// The `BoundingBoxAttachment2D` kind.
pub const BOUNDING_BOX_ATTACHMENT_2D_KIND: &str = "BoundingBoxAttachment2D";
/// The `ClippingAttachment2D` kind.
pub const CLIPPING_ATTACHMENT_2D_KIND: &str = "ClippingAttachment2D";

/// The IK constraint kind.
pub const SKELETON_2D_IK_CONSTRAINT_KIND: &str = "Skeleton2D.IkConstraint";
/// The path constraint kind.
pub const SKELETON_2D_PATH_CONSTRAINT_KIND: &str = "Skeleton2D.PathConstraint";
/// The transform constraint kind.
pub const SKELETON_2D_TRANSFORM_CONSTRAINT_KIND: &str = "Skeleton2D.TransformConstraint";

/// Path position mode: fixed arc length or a 0..1 fraction.
pub const SKELETON_2D_PATH_POSITION_MODE_FIXED: &str = "Fixed";
/// Path position mode: a 0..1 fraction of the path.
pub const SKELETON_2D_PATH_POSITION_MODE_PERCENT: &str = "Percent";
/// Path rotate mode: follow the tangent.
pub const SKELETON_2D_PATH_ROTATE_MODE_TANGENT: &str = "Tangent";
/// Path rotate mode: aim at the next bone.
pub const SKELETON_2D_PATH_ROTATE_MODE_CHAIN: &str = "Chain";
/// Path spacing mode: fixed arc length.
pub const SKELETON_2D_PATH_SPACING_MODE_FIXED: &str = "Fixed";
/// Path spacing mode: a fraction of the path.
pub const SKELETON_2D_PATH_SPACING_MODE_PERCENT: &str = "Percent";
/// Path spacing mode: a multiple of the bone's length.
pub const SKELETON_2D_PATH_SPACING_MODE_LENGTH: &str = "Length";

/// How a bone inherits each axis of its parent's world transform (TS `TransformInherit2D`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TransformInherit2D {
    pub reflection: bool,
    pub rotation: bool,
    pub scale: bool,
    pub translation: bool,
}

/// Inherit every axis (`TransformMode2D.Normal`).
pub const TRANSFORM_MODE_2D_NORMAL: TransformInherit2D = TransformInherit2D {
    reflection: true,
    rotation: true,
    scale: true,
    translation: true,
};
/// Inherit translation only (`TransformMode2D.OnlyTranslation`).
pub const TRANSFORM_MODE_2D_ONLY_TRANSLATION: TransformInherit2D = TransformInherit2D {
    reflection: false,
    rotation: false,
    scale: false,
    translation: true,
};
/// Inherit scale but strip rotation and reflection (`TransformMode2D.NoRotationOrReflection`).
pub const TRANSFORM_MODE_2D_NO_ROTATION_OR_REFLECTION: TransformInherit2D = TransformInherit2D {
    reflection: false,
    rotation: false,
    scale: true,
    translation: true,
};
/// Inherit rotation and reflection but not scale (`TransformMode2D.NoScale`).
pub const TRANSFORM_MODE_2D_NO_SCALE: TransformInherit2D = TransformInherit2D {
    reflection: true,
    rotation: true,
    scale: false,
    translation: true,
};
/// Inherit rotation but neither scale nor reflection (`TransformMode2D.NoScaleOrReflection`).
pub const TRANSFORM_MODE_2D_NO_SCALE_OR_REFLECTION: TransformInherit2D = TransformInherit2D {
    reflection: false,
    rotation: true,
    scale: false,
    translation: true,
};

/// One bone in the flat, parent-before-child ordered array (TS `Bone2D`): local setup transform
/// (degrees), parent link, inherit mode and length.
#[derive(Clone, Debug, PartialEq)]
pub struct Bone2D {
    pub length: f32,
    pub name: Option<String>,
    pub parent_index: i32,
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub shear_x: f32,
    pub shear_y: f32,
    pub transform_mode: TransformInherit2D,
    pub x: f32,
    pub y: f32,
}

/// A draw slot: the bone it follows, the attachment it shows, its tint and its deform offsets.
#[derive(Clone, Default)]
pub struct Slot2D {
    pub attachment: Option<Ref<dyn Attachment2D>>,
    pub deform: Option<Skeleton2DSlotDeform>,
    pub bone_index: i32,
    pub color: Option<u32>,
    pub name: Option<String>,
}

/// The per-vertex offset stream in effect on a slot, paired with the attachment it was authored for.
#[derive(Clone)]
pub struct Skeleton2DSlotDeform {
    pub attachment: Option<Ref<dyn Attachment2D>>,
    pub offsets: Vec<f32>,
}

/// The rig: flat bone arrays plus the world, inverse-bind and palette buffers, its wardrobe and slots.
#[derive(Default)]
pub struct Skeleton2D {
    runtime: EntityRuntimeSlot,
    pub bone_matrices: Vec<f32>,
    pub bones: Vec<Bone2D>,
    pub inverse_bind_matrices: Vec<f32>,
    pub skins: Option<Vec<AttachmentSkin2D>>,
    pub slots: Option<Vec<Slot2D>>,
    pub world_matrices: Vec<f32>,
}

/// A weighted mesh's per-vertex bone binding (TS `Skin2D`): influence counts plus the flat
/// (boneIndex, localX, localY, weight) stream.
#[derive(Default)]
pub struct Skin2D {
    runtime: EntityRuntimeSlot,
    pub influence_counts: Vec<u16>,
    pub influences: Vec<f32>,
}

/// The base contract for a 2D skeletal attachment (TS `Attachment2D`, an open family).
pub trait Attachment2D: Entity + Any + Send + Sync {
    fn kind(&self) -> &str;
    fn name(&self) -> Option<&str>;
    fn name_mut(&mut self) -> &mut Option<String>;
    fn as_any(&self) -> &dyn Any;
}

/// A shared attachment identity.
pub type Attachment2DRef = Ref<dyn Attachment2D>;

/// A textured quad attached to a slot's bone (TS `RegionAttachment2D`).
#[derive(Default)]
pub struct RegionAttachment2D {
    runtime: EntityRuntimeSlot,
    pub height: f32,
    pub kind: Kind,
    pub name: Option<String>,
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub width: f32,
    pub x: f32,
    pub y: f32,
}

/// A deformable triangle mesh (TS `MeshAttachment2D`).
#[derive(Default)]
pub struct MeshAttachment2D {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub skin: Option<Ref<Skin2D>>,
    pub triangles: Vec<u16>,
    pub uvs: Vec<f32>,
    pub vertex_count: usize,
    pub vertices: Option<Vec<f32>>,
}

/// A deformable vector path (TS `PathAttachment2D`).
#[derive(Default)]
pub struct PathAttachment2D {
    runtime: EntityRuntimeSlot,
    pub commands: Vec<u8>,
    pub kind: Kind,
    pub name: Option<String>,
    pub point_count: usize,
    pub skin: Option<Ref<Skin2D>>,
    pub vertices: Option<Vec<f32>>,
    pub winding: PathWinding,
}

/// A positioned, oriented point on a bone (TS `PointAttachment2D`).
#[derive(Default)]
pub struct PointAttachment2D {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub rotation: f32,
    pub x: f32,
    pub y: f32,
}

/// A closed polygon for hit testing (TS `BoundingBoxAttachment2D`).
#[derive(Default)]
pub struct BoundingBoxAttachment2D {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
    pub point_count: usize,
    pub skin: Option<Ref<Skin2D>>,
    pub vertices: Option<Vec<f32>>,
}

/// A closed polygon clipping a draw-order range (TS `ClippingAttachment2D`).
#[derive(Default)]
pub struct ClippingAttachment2D {
    runtime: EntityRuntimeSlot,
    pub end_slot_index: i32,
    pub kind: Kind,
    pub name: Option<String>,
    pub point_count: usize,
    pub skin: Option<Ref<Skin2D>>,
    pub vertices: Option<Vec<f32>>,
}

/// One entry of a wardrobe skin (TS `SkinAttachment2D`).
#[derive(Clone)]
pub struct SkinAttachment2D {
    pub attachment: Attachment2DRef,
    pub name: String,
    pub slot_index: i32,
}

/// A named wardrobe skin (TS `AttachmentSkin2D`): the attachments a skeleton wears together.
#[derive(Clone)]
pub struct AttachmentSkin2D {
    pub attachments: Vec<SkinAttachment2D>,
    pub name: String,
}

/// The base contract for a pose constraint (TS `Skeleton2DConstraint`, an open family).
pub trait Skeleton2DConstraint: Entity + Any + Send + Sync {
    fn kind(&self) -> &str;
    fn mix(&self) -> f32;
    fn as_any(&self) -> &dyn Any;
}

/// A shared constraint identity.
pub type Skeleton2DConstraintRef = Ref<dyn Skeleton2DConstraint>;

/// What solves a constraint (TS `Skeleton2DConstraintSolver`).
pub type Skeleton2DConstraintSolver =
    Arc<dyn Fn(&mut Skeleton2D, &dyn Skeleton2DConstraint) + Send + Sync>;

/// IK over a one- or two-bone chain (TS `Skeleton2DIkConstraint`).
#[derive(Clone, Debug, PartialEq)]
pub struct Skeleton2DIkConstraint {
    runtime: EntityRuntimeSlot,
    pub bend_positive: bool,
    pub bone_indices: Vec<i32>,
    pub compress: bool,
    pub kind: Kind,
    pub mix: f32,
    pub stretch: bool,
    pub target_bone_index: i32,
}

/// Lays a bone chain along a path (TS `Skeleton2DPathConstraint`).
#[derive(Clone, Debug, PartialEq)]
pub struct Skeleton2DPathConstraint {
    runtime: EntityRuntimeSlot,
    pub bone_indices: Vec<i32>,
    pub kind: Kind,
    pub mix: f32,
    pub mix_rotate: f32,
    pub mix_x: f32,
    pub mix_y: f32,
    pub position: f32,
    pub position_mode: String,
    pub rotate_mode: String,
    pub spacing: f32,
    pub spacing_mode: String,
    pub target_slot_index: i32,
}

/// Copies a target bone's world transform per channel (TS `Skeleton2DTransformConstraint`).
#[derive(Clone, Debug, PartialEq)]
pub struct Skeleton2DTransformConstraint {
    runtime: EntityRuntimeSlot,
    pub bone_indices: Vec<i32>,
    pub kind: Kind,
    pub mix: f32,
    pub mix_rotate: f32,
    pub mix_scale_x: f32,
    pub mix_scale_y: f32,
    pub mix_shear_y: f32,
    pub mix_x: f32,
    pub mix_y: f32,
    pub offset_rotation: f32,
    pub offset_scale_x: f32,
    pub offset_scale_y: f32,
    pub offset_shear_y: f32,
    pub offset_x: f32,
    pub offset_y: f32,
    pub target_bone_index: i32,
}

/// What a channel's stated interpolation was replaced with (TS `Skeleton2DCoercedInterpolation`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Skeleton2DCoercedInterpolation {
    pub applied: String,
    pub stated: String,
    pub subject: String,
}

/// A deform offset stream that does not match what it addresses (TS `Skeleton2DDeformLengthMismatch`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Skeleton2DDeformLengthMismatch {
    pub addressed: usize,
    pub offsets: usize,
    pub subject: String,
}

/// Why a deform offset stream was applied or ignored (TS `Skeleton2DDeformLengthExplanation`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Skeleton2DDeformLengthExplanation {
    pub accepted: bool,
    pub addressed: usize,
    pub addressing: String,
    pub offsets: usize,
}

/// Called when a channel's interpolation is overridden.
pub type Skeleton2DCoercedInterpolationGuard =
    Arc<dyn Fn(&Skeleton2DCoercedInterpolation) + Send + Sync>;
/// Called when a deform offset stream is the wrong length.
pub type Skeleton2DDeformLengthGuard = Arc<dyn Fn(&Skeleton2DDeformLengthMismatch) + Send + Sync>;

impl Default for Skeleton2DIkConstraint {
    fn default() -> Self {
        return Skeleton2DIkConstraint {
            runtime: EntityRuntimeSlot::default(),
            bend_positive: false,
            bone_indices: Vec::new(),
            compress: false,
            kind: String::from(SKELETON_2D_IK_CONSTRAINT_KIND),
            mix: 1.0,
            stretch: false,
            target_bone_index: -1,
        };
    }
}

impl Default for Skeleton2DPathConstraint {
    fn default() -> Self {
        return Skeleton2DPathConstraint {
            runtime: EntityRuntimeSlot::default(),
            bone_indices: Vec::new(),
            kind: String::from(SKELETON_2D_PATH_CONSTRAINT_KIND),
            mix: 1.0,
            mix_rotate: 1.0,
            mix_x: 1.0,
            mix_y: 1.0,
            position: 0.0,
            position_mode: String::from(SKELETON_2D_PATH_POSITION_MODE_FIXED),
            rotate_mode: String::from(SKELETON_2D_PATH_ROTATE_MODE_TANGENT),
            spacing: 0.0,
            spacing_mode: String::from(SKELETON_2D_PATH_SPACING_MODE_FIXED),
            target_slot_index: -1,
        };
    }
}

impl Default for Skeleton2DTransformConstraint {
    fn default() -> Self {
        return Skeleton2DTransformConstraint {
            runtime: EntityRuntimeSlot::default(),
            bone_indices: Vec::new(),
            kind: String::from(SKELETON_2D_TRANSFORM_CONSTRAINT_KIND),
            mix: 1.0,
            mix_rotate: 1.0,
            mix_scale_x: 1.0,
            mix_scale_y: 1.0,
            mix_shear_y: 1.0,
            mix_x: 1.0,
            mix_y: 1.0,
            offset_rotation: 0.0,
            offset_scale_x: 0.0,
            offset_scale_y: 0.0,
            offset_shear_y: 0.0,
            offset_x: 0.0,
            offset_y: 0.0,
            target_bone_index: -1,
        };
    }
}

flight_entity::impl_entity!(RegionAttachment2D);
flight_entity::impl_entity!(MeshAttachment2D);
flight_entity::impl_entity!(PathAttachment2D);
flight_entity::impl_entity!(PointAttachment2D);
flight_entity::impl_entity!(BoundingBoxAttachment2D);
flight_entity::impl_entity!(ClippingAttachment2D);
flight_entity::impl_entity!(Skeleton2DIkConstraint);
flight_entity::impl_entity!(Skeleton2DPathConstraint);
flight_entity::impl_entity!(Skeleton2DTransformConstraint);

macro_rules! impl_attachment {
    ($t:ty, $default_kind:expr) => {
        impl Attachment2D for $t {
            fn kind(&self) -> &str {
                return &self.kind;
            }
            fn name(&self) -> Option<&str> {
                return self.name.as_deref();
            }
            fn name_mut(&mut self) -> &mut Option<String> {
                return &mut self.name;
            }
            fn as_any(&self) -> &dyn Any {
                return self;
            }
        }
    };
}

impl_attachment!(RegionAttachment2D, REGION_ATTACHMENT_2D_KIND);
impl_attachment!(MeshAttachment2D, MESH_ATTACHMENT_2D_KIND);
impl_attachment!(PathAttachment2D, PATH_ATTACHMENT_2D_KIND);
impl_attachment!(PointAttachment2D, POINT_ATTACHMENT_2D_KIND);
impl_attachment!(BoundingBoxAttachment2D, BOUNDING_BOX_ATTACHMENT_2D_KIND);
impl_attachment!(ClippingAttachment2D, CLIPPING_ATTACHMENT_2D_KIND);

impl Skeleton2DConstraint for Skeleton2DIkConstraint {
    fn as_any(&self) -> &dyn Any {
        return self;
    }
    fn kind(&self) -> &str {
        return &self.kind;
    }
    fn mix(&self) -> f32 {
        return self.mix;
    }
}

impl Skeleton2DConstraint for Skeleton2DPathConstraint {
    fn as_any(&self) -> &dyn Any {
        return self;
    }
    fn kind(&self) -> &str {
        return &self.kind;
    }
    fn mix(&self) -> f32 {
        return self.mix;
    }
}

impl Skeleton2DConstraint for Skeleton2DTransformConstraint {
    fn as_any(&self) -> &dyn Any {
        return self;
    }
    fn kind(&self) -> &str {
        return &self.kind;
    }
    fn mix(&self) -> f32 {
        return self.mix;
    }
}

impl Default for Bone2D {
    fn default() -> Self {
        return Bone2D {
            length: 0.0,
            name: None,
            parent_index: -1,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            shear_x: 0.0,
            shear_y: 0.0,
            transform_mode: TRANSFORM_MODE_2D_NORMAL,
            x: 0.0,
            y: 0.0,
        };
    }
}
flight_entity::impl_entity!(Skeleton2D);
flight_entity::impl_entity!(Skin2D);
