//! Trait initializers — ports of the TypeScript `has*.ts` modules.
//!
//! Each TS `init*Trait` function writes default field values onto a target
//! data object (or applies caller-supplied overrides). The Rust port mirrors
//! that exactly using small plain-data trait structs and `init_*_trait`
//! functions that write into a `&mut` target. Defaults match the TS reference.

use flighthq_geometry::create_matrix4_identity;
use flighthq_types::{BlendMode, ClipRegion, Matrix4};

use crate::node_id::NodeId;

// ---------------------------------------------------------------------------
// Appearance trait
// ---------------------------------------------------------------------------

/// Compositing fields a node carries when it `HasAppearance`.
#[derive(Clone, Debug, PartialEq)]
pub struct AppearanceTrait {
    pub alpha: f32,
    pub blend_mode: Option<BlendMode>,
    pub visible: bool,
}

impl Default for AppearanceTrait {
    fn default() -> Self {
        Self {
            alpha: 1.0,
            blend_mode: None,
            visible: true,
        }
    }
}

/// Optional overrides for [`init_appearance_trait`].
#[derive(Clone, Debug, Default)]
pub struct AppearanceTraitOptions {
    pub alpha: Option<f32>,
    pub blend_mode: Option<Option<BlendMode>>,
    pub visible: Option<bool>,
}

/// Writes the appearance defaults (`alpha = 1`, `blend_mode = None`,
/// `visible = true`) into `target`, applying any provided overrides.
pub fn init_appearance_trait(target: &mut AppearanceTrait, obj: Option<&AppearanceTraitOptions>) {
    target.alpha = obj.and_then(|o| o.alpha).unwrap_or(1.0);
    target.blend_mode = obj.and_then(|o| o.blend_mode).unwrap_or(None);
    target.visible = obj.and_then(|o| o.visible).unwrap_or(true);
}

// ---------------------------------------------------------------------------
// Bounds-rectangle traits
// ---------------------------------------------------------------------------

/// Compute-local-bounds hook: writes a node's own extent into `out`.
pub type ComputeLocalBoundsRectangle = fn(out: &mut flighthq_types::Rectangle, source: NodeId);

/// The default compute-local-bounds implementation — a no-op leaving `out`
/// unchanged.
pub fn default_compute_local_bounds_rectangle(
    _out: &mut flighthq_types::Rectangle,
    _source: NodeId,
) {
}

/// Runtime-side bounds state for a node that `HasBoundsRectangle`.
pub struct BoundsRectangleRuntimeTrait {
    pub bounds_rectangle: Option<flighthq_types::Rectangle>,
    pub local_bounds_rectangle: Option<flighthq_types::Rectangle>,
    pub world_bounds_rectangle: Option<flighthq_types::Rectangle>,
    pub compute_local_bounds_rectangle: ComputeLocalBoundsRectangle,
}

impl Default for BoundsRectangleRuntimeTrait {
    fn default() -> Self {
        Self {
            bounds_rectangle: None,
            local_bounds_rectangle: None,
            world_bounds_rectangle: None,
            compute_local_bounds_rectangle: default_compute_local_bounds_rectangle,
        }
    }
}

/// Optional override for [`init_bounds_rectangle_runtime_trait`].
#[derive(Default)]
pub struct BoundsRectangleRuntimeTraitOptions {
    pub compute_local_bounds_rectangle: Option<ComputeLocalBoundsRectangle>,
}

/// Data-side bounds state. Like the TS reference, the data trait carries no
/// fields of its own.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct BoundsRectangleTrait;

/// Resets the runtime bounds caches to `None` and installs the
/// compute-local-bounds hook (default or supplied override).
pub fn init_bounds_rectangle_runtime_trait(
    target: &mut BoundsRectangleRuntimeTrait,
    methods: Option<&BoundsRectangleRuntimeTraitOptions>,
) {
    target.bounds_rectangle = None;
    target.local_bounds_rectangle = None;
    target.world_bounds_rectangle = None;
    target.compute_local_bounds_rectangle = methods
        .and_then(|m| m.compute_local_bounds_rectangle)
        .unwrap_or(default_compute_local_bounds_rectangle);
}

/// No-op data-side bounds initializer, mirroring the TS reference.
pub fn init_bounds_rectangle_trait(
    _target: &mut BoundsRectangleTrait,
    _obj: Option<&BoundsRectangleTrait>,
) {
}

// ---------------------------------------------------------------------------
// Clip trait
// ---------------------------------------------------------------------------

/// Clip field a node carries when it `HasClip`.
#[derive(Clone, Debug, Default)]
pub struct ClipTrait {
    pub clip: Option<ClipRegion>,
}

/// Optional override for [`init_clip_trait`].
#[derive(Clone, Debug, Default)]
pub struct ClipTraitOptions {
    pub clip: Option<ClipRegion>,
}

/// Defaults `clip` to `None`, applying a supplied override.
pub fn init_clip_trait(target: &mut ClipTrait, obj: Option<&ClipTraitOptions>) {
    target.clip = obj.and_then(|o| o.clip.clone());
}

// ---------------------------------------------------------------------------
// Material trait
// ---------------------------------------------------------------------------

/// Material identity for a node that `HasMaterial`. Stored as opaque ids so the
/// trait stays free of trait-object machinery (the TS reference holds object
/// references; the port holds the equivalent registry keys).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct MaterialTrait {
    pub material: Option<flighthq_types::KindId>,
    pub material_data: Option<flighthq_types::KindId>,
}

/// Optional overrides for [`init_material_trait`].
#[derive(Clone, Copy, Debug, Default)]
pub struct MaterialTraitOptions {
    pub material: Option<flighthq_types::KindId>,
    pub material_data: Option<flighthq_types::KindId>,
}

/// Defaults `material` and `material_data` to `None`, applying supplied
/// overrides.
pub fn init_material_trait(target: &mut MaterialTrait, obj: Option<&MaterialTraitOptions>) {
    target.material = obj.and_then(|o| o.material);
    target.material_data = obj.and_then(|o| o.material_data);
}

// ---------------------------------------------------------------------------
// Transform2D traits
// ---------------------------------------------------------------------------

/// Runtime-side 2D transform cache for a node that `HasTransform2D`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Transform2DRuntimeTrait {
    pub local_transform2d: Option<flighthq_types::MatrixLike>,
    pub rotation_angle: f32,
    pub rotation_cosine: f32,
    pub rotation_sine: f32,
    pub world_transform2d: Option<flighthq_types::MatrixLike>,
}

impl Default for Transform2DRuntimeTrait {
    fn default() -> Self {
        Self {
            local_transform2d: None,
            rotation_angle: 0.0,
            rotation_cosine: 1.0,
            rotation_sine: 0.0,
            world_transform2d: None,
        }
    }
}

/// Data-side 2D transform fields.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Transform2DTrait {
    pub pivot_x: f32,
    pub pivot_y: f32,
    pub rotation: f32,
    pub scale_x: f32,
    pub scale_y: f32,
    pub x: f32,
    pub y: f32,
}

impl Default for Transform2DTrait {
    fn default() -> Self {
        Self {
            pivot_x: 0.0,
            pivot_y: 0.0,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            x: 0.0,
            y: 0.0,
        }
    }
}

/// Optional overrides for [`init_transform2d_trait`].
#[derive(Clone, Copy, Debug, Default)]
pub struct Transform2DTraitOptions {
    pub pivot_x: Option<f32>,
    pub pivot_y: Option<f32>,
    pub rotation: Option<f32>,
    pub scale_x: Option<f32>,
    pub scale_y: Option<f32>,
    pub x: Option<f32>,
    pub y: Option<f32>,
}

/// Resets the runtime 2D transform cache to its defaults (null matrices,
/// identity rotation trig).
pub fn init_transform2d_runtime_trait(target: &mut Transform2DRuntimeTrait) {
    target.local_transform2d = None;
    target.rotation_angle = 0.0;
    target.rotation_cosine = 1.0;
    target.rotation_sine = 0.0;
    target.world_transform2d = None;
}

/// Writes the 2D transform defaults into `target`, applying supplied overrides.
pub fn init_transform2d_trait(target: &mut Transform2DTrait, obj: Option<&Transform2DTraitOptions>) {
    target.pivot_x = obj.and_then(|o| o.pivot_x).unwrap_or(0.0);
    target.pivot_y = obj.and_then(|o| o.pivot_y).unwrap_or(0.0);
    target.rotation = obj.and_then(|o| o.rotation).unwrap_or(0.0);
    target.scale_x = obj.and_then(|o| o.scale_x).unwrap_or(1.0);
    target.scale_y = obj.and_then(|o| o.scale_y).unwrap_or(1.0);
    target.x = obj.and_then(|o| o.x).unwrap_or(0.0);
    target.y = obj.and_then(|o| o.y).unwrap_or(0.0);
}

// ---------------------------------------------------------------------------
// Transform3D traits
// ---------------------------------------------------------------------------

/// Runtime-side 3D transform cache for a node that `HasTransform3D`.
#[derive(Clone, Debug, Default)]
pub struct Transform3DRuntimeTrait {
    pub world_matrix: Option<Matrix4>,
}

/// Data-side 3D transform fields.
#[derive(Clone, Debug)]
pub struct Transform3DTrait {
    pub local_matrix: Matrix4,
}

impl Default for Transform3DTrait {
    fn default() -> Self {
        Self {
            local_matrix: Matrix4::default(),
        }
    }
}

/// Optional override for [`init_transform3d_trait`].
#[derive(Clone, Debug, Default)]
pub struct Transform3DTraitOptions {
    pub local_matrix: Option<Matrix4>,
}

/// Resets the runtime 3D world matrix to `None`.
pub fn init_transform3d_runtime_trait(target: &mut Transform3DRuntimeTrait) {
    target.world_matrix = None;
}

/// Sets `local_matrix` to a fresh identity by default, or to a supplied matrix.
pub fn init_transform3d_trait(target: &mut Transform3DTrait, obj: Option<&Transform3DTraitOptions>) {
    target.local_matrix = match obj.and_then(|o| o.local_matrix.clone()) {
        Some(m) => m,
        None => create_matrix4_identity(),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // default_compute_local_bounds_rectangle

    #[test]
    fn default_compute_local_bounds_rectangle_is_noop() {
        let mut out = flighthq_types::Rectangle {
            x: 1.0,
            y: 2.0,
            width: 3.0,
            height: 4.0,
        };
        default_compute_local_bounds_rectangle(&mut out, NodeId::default());
        assert_eq!((out.x, out.y, out.width, out.height), (1.0, 2.0, 3.0, 4.0));
    }

    // init_appearance_trait

    #[test]
    fn init_appearance_trait_sets_defaults() {
        let mut t = AppearanceTrait {
            alpha: 0.0,
            blend_mode: Some(BlendMode::Add),
            visible: false,
        };
        init_appearance_trait(&mut t, None);
        assert_eq!(t.alpha, 1.0);
        assert!(t.blend_mode.is_none());
        assert!(t.visible);
    }

    #[test]
    fn init_appearance_trait_applies_partial_overrides() {
        let mut t = AppearanceTrait::default();
        init_appearance_trait(
            &mut t,
            Some(&AppearanceTraitOptions {
                alpha: Some(0.5),
                visible: Some(false),
                blend_mode: None,
            }),
        );
        assert_eq!(t.alpha, 0.5);
        assert!(!t.visible);
        assert!(t.blend_mode.is_none());
    }

    #[test]
    fn init_appearance_trait_applies_blend_mode_override() {
        let mut t = AppearanceTrait::default();
        init_appearance_trait(
            &mut t,
            Some(&AppearanceTraitOptions {
                blend_mode: Some(Some(BlendMode::Add)),
                ..AppearanceTraitOptions::default()
            }),
        );
        assert_eq!(t.blend_mode, Some(BlendMode::Add));
    }

    // init_bounds_rectangle_runtime_trait

    #[test]
    fn init_bounds_rectangle_runtime_trait_defaults() {
        let mut t = BoundsRectangleRuntimeTrait {
            bounds_rectangle: Some(flighthq_types::Rectangle::default()),
            local_bounds_rectangle: Some(flighthq_types::Rectangle::default()),
            world_bounds_rectangle: Some(flighthq_types::Rectangle::default()),
            compute_local_bounds_rectangle: default_compute_local_bounds_rectangle,
        };
        init_bounds_rectangle_runtime_trait(&mut t, None);
        assert!(t.bounds_rectangle.is_none());
        assert!(t.local_bounds_rectangle.is_none());
        assert!(t.world_bounds_rectangle.is_none());
        // The hook is the default function pointer.
        let mut out = flighthq_types::Rectangle::default();
        (t.compute_local_bounds_rectangle)(&mut out, NodeId::default());
        assert_eq!(out.width, 0.0);
    }

    // init_bounds_rectangle_trait

    #[test]
    fn init_bounds_rectangle_trait_does_nothing() {
        let mut t = BoundsRectangleTrait;
        init_bounds_rectangle_trait(&mut t, None);
        assert_eq!(t, BoundsRectangleTrait);
    }

    // init_clip_trait

    fn sample_clip() -> ClipRegion {
        ClipRegion {
            rect: flighthq_types::Rectangle {
                x: 1.0,
                y: 2.0,
                width: 3.0,
                height: 4.0,
            },
            contours: None,
            winding: flighthq_types::PathWinding::default(),
            version: 0,
        }
    }

    #[test]
    fn init_clip_trait_defaults_to_none() {
        let mut t = ClipTrait {
            clip: Some(sample_clip()),
        };
        init_clip_trait(&mut t, None);
        assert!(t.clip.is_none());
    }

    #[test]
    fn init_clip_trait_applies_override() {
        let clip = sample_clip();
        let mut t = ClipTrait::default();
        init_clip_trait(
            &mut t,
            Some(&ClipTraitOptions {
                clip: Some(clip.clone()),
            }),
        );
        assert!(t.clip.is_some());
        let stored = t.clip.unwrap();
        assert_eq!(stored.rect.width, 3.0);
        assert_eq!(stored.rect.height, 4.0);
    }

    // init_material_trait

    #[test]
    fn init_material_trait_defaults_to_none() {
        let mut t = MaterialTrait {
            material: Some(flighthq_types::KindId::new()),
            material_data: Some(flighthq_types::KindId::new()),
        };
        init_material_trait(&mut t, None);
        assert!(t.material.is_none());
        assert!(t.material_data.is_none());
    }

    #[test]
    fn init_material_trait_applies_overrides() {
        let mat = flighthq_types::KindId::new();
        let data = flighthq_types::KindId::new();
        let mut t = MaterialTrait::default();
        init_material_trait(
            &mut t,
            Some(&MaterialTraitOptions {
                material: Some(mat),
                material_data: Some(data),
            }),
        );
        assert_eq!(t.material, Some(mat));
        assert_eq!(t.material_data, Some(data));
    }

    // init_transform2d_runtime_trait
    // (test name spelled `transform2_d` to match the parity harness's
    // camel→snake conversion of `initTransform2DRuntimeTrait`.)

    #[test]
    fn init_transform2_d_runtime_trait_defaults() {
        let mut t = Transform2DRuntimeTrait {
            local_transform2d: Some(flighthq_types::MatrixLike::default()),
            rotation_angle: 90.0,
            rotation_cosine: 0.0,
            rotation_sine: 1.0,
            world_transform2d: Some(flighthq_types::MatrixLike::default()),
        };
        init_transform2d_runtime_trait(&mut t);
        assert!(t.local_transform2d.is_none());
        assert_eq!(t.rotation_angle, 0.0);
        assert_eq!(t.rotation_cosine, 1.0);
        assert_eq!(t.rotation_sine, 0.0);
        assert!(t.world_transform2d.is_none());
    }

    // init_transform2d_trait

    #[test]
    fn init_transform2_d_trait_defaults() {
        let mut t = Transform2DTrait {
            pivot_x: 5.0,
            pivot_y: 5.0,
            rotation: 45.0,
            scale_x: 2.0,
            scale_y: 2.0,
            x: 9.0,
            y: 9.0,
        };
        init_transform2d_trait(&mut t, None);
        assert_eq!(t.rotation, 0.0);
        assert_eq!(t.scale_x, 1.0);
        assert_eq!(t.scale_y, 1.0);
        assert_eq!(t.x, 0.0);
        assert_eq!(t.y, 0.0);
    }

    #[test]
    fn init_transform2_d_trait_applies_overrides() {
        let mut t = Transform2DTrait::default();
        init_transform2d_trait(
            &mut t,
            Some(&Transform2DTraitOptions {
                scale_x: Some(2.0),
                scale_y: Some(3.0),
                rotation: Some(45.0),
                x: Some(100.0),
                y: Some(200.0),
                ..Transform2DTraitOptions::default()
            }),
        );
        assert_eq!(t.scale_x, 2.0);
        assert_eq!(t.scale_y, 3.0);
        assert_eq!(t.rotation, 45.0);
        assert_eq!(t.x, 100.0);
        assert_eq!(t.y, 200.0);
    }

    // init_transform3d_runtime_trait
    // (test name spelled `transform3_d` to match the parity harness's
    // camel→snake conversion of `initTransform3DRuntimeTrait`.)

    #[test]
    fn init_transform3_d_runtime_trait_sets_world_matrix_none() {
        let mut t = Transform3DRuntimeTrait {
            world_matrix: Some(Matrix4::default()),
        };
        init_transform3d_runtime_trait(&mut t);
        assert!(t.world_matrix.is_none());
    }

    // init_transform3d_trait

    #[test]
    fn init_transform3_d_trait_creates_identity_by_default() {
        let mut t = Transform3DTrait {
            local_matrix: Matrix4 { m: [0.0; 16] },
        };
        init_transform3d_trait(&mut t, None);
        let m = t.local_matrix.m;
        assert_eq!(m[0], 1.0);
        assert_eq!(m[5], 1.0);
        assert_eq!(m[10], 1.0);
        assert_eq!(m[15], 1.0);
        assert_eq!(m[12], 0.0);
        assert_eq!(m[13], 0.0);
        assert_eq!(m[14], 0.0);
    }

    #[test]
    fn init_transform3_d_trait_accepts_existing_matrix() {
        let mut existing = Matrix4::default();
        existing.m[12] = 7.0;
        let mut t = Transform3DTrait::default();
        init_transform3d_trait(
            &mut t,
            Some(&Transform3DTraitOptions {
                local_matrix: Some(existing.clone()),
            }),
        );
        assert_eq!(t.local_matrix.m[12], 7.0);
    }
}
