//! `flighthq-camera` — the 3D scene camera: projections and view-projection
//! helpers.
//!
//! Ports the TypeScript `@flighthq/camera` package. (The device/photo-capture
//! seam is `flighthq-webcam`.) The [`Camera`] / [`Projection`] header types live
//! in `flighthq-types`; this crate owns the constructors and matrix helpers.

pub mod camera;
pub mod projection;

pub use camera::{
    create_camera, get_camera_inverse_view_projection_matrix4, get_camera_view_projection_matrix4,
    set_camera_jitter, set_camera_view_matrix4_from_look_at, set_camera_view_matrix4_from_matrix4,
};
pub use projection::{
    create_orthographic_projection, create_perspective_projection, is_orthographic_projection,
    is_perspective_projection, set_projection_matrix4,
};
