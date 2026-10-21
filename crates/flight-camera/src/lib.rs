//! Mathematical 2D/3D cameras: projection descriptors, view matrices, aspect/jitter setters,
//! culling, picking, reflection, shadow-camera fitting and the 2D world/screen transforms. No
//! render backend, device capture or OS operation lives here.

mod basis;
mod camera;
mod camera2d;
mod camera_sugar;
mod cube_capture;
mod culling;
mod depth;
mod enable_camera_guards;
mod explain_camera_3d_view;
mod frustum_corners;
mod intersection;
mod parallax;
mod picking;
mod projection;
mod projection2d;
mod reflection;
mod shadow_camera;
mod types;
mod view_matrix;
mod visible_bounds;
mod zoom;

pub mod contract;

// Public lane: the functions exported by pinned TS `index.ts`, plus the locally owned types their
// signatures use. Initializers and the guard setters stay contract-only.
pub use contract::apply_oblique_near_clip_plane;
pub use contract::are_camera_guards_enabled;
pub use contract::configure_directional_shadow_camera_3d;
pub use contract::configure_directional_shadow_camera_3d_tight_fit;
pub use contract::create_camera_2d;
pub use contract::create_camera_3d;
pub use contract::create_orthographic_projection;
pub use contract::create_perspective_projection;
pub use contract::create_raw_projection;
pub use contract::disable_camera_guards;
pub use contract::enable_camera_guards;
pub use contract::explain_camera_3d_view;
pub use contract::get_camera_2d_parallax_point;
pub use contract::get_camera_2d_view_matrix;
pub use contract::get_camera_2d_visible_bounds;
pub use contract::get_camera_3d_forward;
pub use contract::get_camera_3d_frustum;
pub use contract::get_camera_3d_frustum_corners;
pub use contract::get_camera_3d_inverse_view_projection_matrix4;
pub use contract::get_camera_3d_linear_depth;
pub use contract::get_camera_3d_position;
pub use contract::get_camera_3d_ray_through_bounding_sphere;
pub use contract::get_camera_3d_right;
pub use contract::get_camera_3d_screen_to_world_ray;
pub use contract::get_camera_3d_up;
pub use contract::get_camera_3d_view_projection_matrix4;
pub use contract::get_camera_3d_view_space_z;
pub use contract::get_camera_3d_world_to_screen;
pub use contract::get_cube_capture_face_camera_3d;
pub use contract::get_orthographic_projection_texel_size;
pub use contract::intersect_camera_3d_ray_with_plane;
pub use contract::is_box_in_camera_3d_frustum;
pub use contract::is_orthographic_projection;
pub use contract::is_perspective_projection;
pub use contract::is_point_in_camera_3d_frustum;
pub use contract::is_raw_projection;
pub use contract::is_sphere_in_camera_3d_frustum;
pub use contract::project_camera_2d_point;
pub use contract::reflect_camera_3d_by_plane;
pub use contract::set_camera_2d_look_at;
pub use contract::set_camera_3d_aspect;
pub use contract::set_camera_3d_jitter;
pub use contract::set_camera_3d_view_matrix4_from_look_at;
pub use contract::set_camera_3d_view_matrix4_from_matrix4;
pub use contract::set_projection_matrix4;
pub use contract::unproject_camera_2d_point;
pub use contract::update_camera_3d_inverse_view_projection;
pub use contract::zoom_camera_2d_at_screen_point;

pub use contract::Camera2D;
pub use contract::Camera2DOptions;
pub use contract::Camera2DVisibleBoundsGuard;
pub use contract::Camera3D;
pub use contract::Camera3DOptions;
pub use contract::Camera3DViewExplanation;
pub use contract::Camera3DViewGuard;
pub use contract::CameraGuardState;
pub use contract::CameraGuardStateRef;
pub use contract::OrthographicProjection;
pub use contract::OrthographicProjectionOptions;
pub use contract::PerspectiveProjection;
pub use contract::PerspectiveProjectionOptions;
pub use contract::Projection;
pub use contract::RawProjection;
pub use contract::RawProjectionOptions;
