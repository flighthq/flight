//! 3D camera header types.
//!
//! (The device/photo-capture seam is [`WebcamBackend`], freeing this name for
//! the scene camera.) `view` is the world->view [`Matrix4`] (the inverse of the
//! camera's world transform); `projection` is the discriminated perspective/
//! orthographic descriptor.
//!
//! [`WebcamBackend`]: crate::platform::WebcamBackend

use crate::entity::Entity;
use crate::geometry::{Matrix4, Vector2};

/// Perspective projection: a vertical field of view in radians and a viewport
/// aspect ratio (`width / height`). The clip-plane distances live on the owning
/// [`Camera`] (`near`/`far`).
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct PerspectiveProjection {
    pub aspect: f32,
    pub fov_y: f32,
}

/// Orthographic projection: the half-extents of the view volume in view-space
/// units. The full visible width is `2 * half_width` and height
/// `2 * half_height`. Clip-plane distances live on the [`Camera`].
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub struct OrthographicProjection {
    pub half_height: f32,
    pub half_width: f32,
}

/// Discriminated union of the supported projection models. Switch on the
/// variant.
#[derive(Copy, Clone, PartialEq, Debug)]
pub enum Projection {
    Perspective(PerspectiveProjection),
    Orthographic(OrthographicProjection),
}

impl Default for Projection {
    fn default() -> Self {
        Projection::Perspective(PerspectiveProjection::default())
    }
}

/// 3D camera. `near`/`far` are the clip-plane distances. `jitter` is the
/// per-frame sub-pixel NDC offset TAA applies to projection.
/// `inverse_view_projection` is the cached inverse of `projection × view`,
/// consumed by the TAA / velocity / fog / depth-of-field effects; it is
/// recomputed whenever `view` or `projection` changes.
#[derive(Clone, Debug, Default)]
pub struct Camera {
    pub far: f32,
    pub inverse_view_projection: Matrix4,
    pub jitter: Vector2,
    pub near: f32,
    pub projection: Projection,
    pub view: Matrix4,
}

impl Entity for Camera {}
