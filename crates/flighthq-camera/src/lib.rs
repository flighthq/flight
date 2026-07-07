//! `flighthq-camera` — the 3D scene camera: projections and view-projection
//! helpers.
//!
//! Ports the TypeScript `@flighthq/camera` package. (The device/photo-capture
//! seam is `flighthq-webcam`.) The [`Camera`] / [`Projection`] header types live
//! in `flighthq-types`; this crate owns the constructors and matrix helpers.

pub mod basis;
pub mod camera;
pub mod culling;
pub mod depth;
pub mod frustum_corners;
pub mod intersection;
pub mod picking;
pub mod projection;
pub mod shadow_camera;

pub use basis::{get_camera_forward, get_camera_position, get_camera_right, get_camera_up};
pub use camera::{
    create_camera, get_camera_inverse_view_projection_matrix4, get_camera_view_projection_matrix4,
    set_camera_jitter, set_camera_view_matrix4_from_look_at, set_camera_view_matrix4_from_matrix4,
};
pub use culling::{
    get_camera_frustum, is_box_in_camera_frustum, is_point_in_camera_frustum,
    is_sphere_in_camera_frustum,
};
pub use depth::{get_camera_linear_depth, get_camera_view_space_z};
pub use frustum_corners::get_camera_frustum_corners;
pub use intersection::{get_camera_ray_through_bounding_sphere, intersect_camera_ray_with_plane};
pub use picking::{get_camera_screen_to_world_ray, get_camera_world_to_screen};
pub use projection::{
    create_orthographic_projection, create_perspective_projection, is_orthographic_projection,
    is_perspective_projection, set_projection_matrix4,
};
pub use shadow_camera::setup_directional_shadow_camera;
