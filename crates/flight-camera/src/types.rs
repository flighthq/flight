//! The camera contract types: 2D/3D camera entities, projection descriptors, options,
//! explanation data and caller-owned guard state (TS `Camera2D.ts`, `Camera3D.ts`,
//! `Camera3DOptions.ts`, `Camera3DViewExplanation.ts`, `*ProjectionOptions.ts`).

use std::sync::{Arc, RwLock};

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_geometry::{Matrix4, Plane, Rectangle, Vector2, create_matrix4, create_vector2};

/// A 3D scene camera (TS `Camera3D`, an Entity). `view` is the world-to-view matrix (the inverse of
/// the camera's world placement); `projection` is the perspective/orthographic/raw descriptor;
/// `near`/`far` are the clip-plane distances; `jitter` is the per-frame sub-pixel NDC offset applied
/// to every projection; `inverse_view_projection` is the last inverse projection-times-view cache;
/// `near_clip_plane`, when present, replaces the symmetric near plane via the oblique technique.
pub struct Camera3D {
    runtime: EntityRuntimeSlot,
    pub far: f32,
    pub inverse_view_projection: Ref<Matrix4>,
    pub jitter: Ref<Vector2>,
    pub near: f32,
    pub near_clip_plane: Option<Ref<Plane>>,
    pub projection: Projection,
    pub view: Ref<Matrix4>,
}

/// A 2D game camera (TS `Camera2D`, an Entity). `(x, y)` is the world point rendered at the center
/// of the viewport; `zoom` > 1 magnifies; `rotation` is in radians. The viewport is not on the
/// camera — functions that need it take explicit width/height parameters.
#[derive(Default)]
pub struct Camera2D {
    runtime: EntityRuntimeSlot,
    pub rotation: f32,
    pub x: f32,
    pub y: f32,
    pub zoom: f32,
}

/// A perspective projection (TS `PerspectiveProjection`, an Entity): vertical field of view in
/// radians plus the viewport aspect ratio. Clip planes live on the owning `Camera3D`.
#[derive(Default)]
pub struct PerspectiveProjection {
    runtime: EntityRuntimeSlot,
    pub aspect: f32,
    pub fov_y: f32,
}

/// An orthographic projection (TS `OrthographicProjection`, an Entity): half-extents of the view
/// volume in view-space units. Clip planes live on the owning `Camera3D`.
#[derive(Default)]
pub struct OrthographicProjection {
    runtime: EntityRuntimeSlot,
    pub half_height: f32,
    pub half_width: f32,
}

/// A pre-built projection matrix used verbatim (TS `RawProjection`, an Entity). The system cannot
/// derive FOV, aspect or clip planes from it, so resize adaptation is a no-op; jitter still applies.
pub struct RawProjection {
    runtime: EntityRuntimeSlot,
    pub matrix: Ref<Matrix4>,
}

/// The discriminated projection union (TS `Projection`). Each member is an entity, so the variant
/// carries the source object identity; the source's literal `kind` field is the variant itself.
#[derive(Clone)]
pub enum Projection {
    Orthographic(Ref<OrthographicProjection>),
    Perspective(Ref<PerspectiveProjection>),
    Raw(Ref<RawProjection>),
}

/// Structural inputs for `create_camera_3d` (TS `Camera3DOptions`). `near_clip_plane` absent and
/// explicit null both mean no oblique plane.
#[derive(Clone)]
pub struct Camera3DOptions {
    pub far: f32,
    pub near: f32,
    pub near_clip_plane: Option<Ref<Plane>>,
    pub projection: Projection,
}

/// Optional overrides for `create_camera_2d` (TS `Camera2DOptions`). Omitted fields take their
/// identity defaults (`x` = `y` = 0, `zoom` = 1, `rotation` = 0).
#[derive(Clone, Default, PartialEq)]
pub struct Camera2DOptions {
    pub rotation: Option<f32>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub zoom: Option<f32>,
}

/// Optional target-follow parameters for `update_camera_2d_follow` (TS `Camera2DFollowOptions`).
/// Owned by this camera crate (the reviewed type table places them here); the camera-controls
/// package imports this type. Omitted fields take their neutral defaults, and `world_bounds` is the
/// source rectangle object retained by handle.
#[derive(Clone, Default)]
pub struct Camera2DFollowOptions {
    pub deadzone_half_height: Option<f32>,
    pub deadzone_half_width: Option<f32>,
    pub smooth_time: Option<f32>,
    pub world_bounds: Option<Ref<Rectangle>>,
}

/// Source-compatible orthographic projection field bundle (TS `OrthographicProjectionOptions`).
/// D23 construction allocates the projection first and assigns these fields afterward.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OrthographicProjectionOptions {
    pub half_height: f32,
    pub half_width: f32,
}

/// Source-compatible perspective projection field bundle (TS `PerspectiveProjectionOptions`).
/// `aspect` defaults to 1 (square viewport) when callers apply the bundle after D23 construction.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PerspectiveProjectionOptions {
    pub aspect: Option<f32>,
    pub fov_y: f32,
}

/// Source-compatible raw projection field bundle (TS `RawProjectionOptions`). Callers copy its
/// matrix data into the identity matrix allocated by D23 construction.
#[derive(Clone, Debug, PartialEq)]
pub struct RawProjectionOptions {
    pub matrix: Matrix4,
}

/// What `explain_camera_3d_view` measured about a camera's view matrix (TS
/// `Camera3DViewExplanation`). Plain data: the caller decides what a deviation means.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Camera3DViewExplanation {
    pub determinant: f32,
    pub is_orthonormal: bool,
    pub is_reflection: bool,
    pub scale_deviation: f32,
    pub shear_deviation: f32,
}

/// The optional non-orthonormal view hook (TS module-level `camera3DViewGuard`).
pub type Camera3DViewGuard = Arc<dyn Fn(&Camera3D) + Send + Sync>;

/// The optional degenerate-visible-bounds hook (TS module-level
/// `degenerateVisibleBoundsGuard`).
pub type Camera2DVisibleBoundsGuard = Arc<dyn Fn(&Camera2D) + Send + Sync>;

/// Caller-owned replacement for the source's module-level guard hooks and enabled flag (D5).
#[derive(Default)]
pub struct CameraGuardState {
    pub enabled: bool,
    pub view_guard: Option<Camera3DViewGuard>,
    pub visible_bounds_guard: Option<Camera2DVisibleBoundsGuard>,
}

/// Shared caller-owned camera guard state.
pub type CameraGuardStateRef = Ref<CameraGuardState>;

// D12 allocation bootstrap: `initialize_camera_3d` immediately replaces every field. The
// placeholder projection is never observable through the public API.
impl Default for Camera3D {
    fn default() -> Self {
        return Camera3D {
            runtime: EntityRuntimeSlot::default(),
            far: 0.0,
            inverse_view_projection: Ref::new(RwLock::new(create_matrix4())),
            jitter: Ref::new(RwLock::new(create_vector2(0.0, 0.0))),
            near: 0.0,
            near_clip_plane: None,
            projection: Projection::default(),
            view: Ref::new(RwLock::new(create_matrix4())),
        };
    }
}

impl Default for RawProjection {
    fn default() -> Self {
        return RawProjection {
            runtime: EntityRuntimeSlot::default(),
            matrix: Ref::new(RwLock::new(create_matrix4())),
        };
    }
}

impl Default for Projection {
    fn default() -> Self {
        return Projection::Perspective(Ref::new(RwLock::new(PerspectiveProjection::default())));
    }
}

flight_entity::impl_entity!(Camera2D);
flight_entity::impl_entity!(Camera3D);
flight_entity::impl_entity!(OrthographicProjection);
flight_entity::impl_entity!(PerspectiveProjection);
flight_entity::impl_entity!(RawProjection);
