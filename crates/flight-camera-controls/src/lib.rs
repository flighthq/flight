//! Stateful camera controllers: orbit and fly intent controllers with damped goals, 2D follow with
//! deadzone and world bounds, sphere framing for projections, and deterministic trauma-based shake.
//! Input-agnostic pure math; no hardware, OS or render operation lives here.

mod camera_shake;
mod controls_sugar;
mod fly_camera_controller;
mod follow;
mod framing;
mod orbit_camera_controller;
mod types;

pub mod contract;

// Public lane: the functions exported by pinned TS `index.ts`, plus the locally owned types their
// signatures use. Initializers stay contract-only.
pub use contract::add_camera_shake_trauma;
pub use contract::clone_fly_camera_controller;
pub use contract::clone_orbit_camera_controller;
pub use contract::copy_fly_camera_controller;
pub use contract::copy_orbit_camera_controller;
pub use contract::create_camera_shake;
pub use contract::create_camera_shake_offset;
pub use contract::create_fly_camera_controller;
pub use contract::create_orbit_camera_controller;
pub use contract::dolly_orbit_camera_controller;
pub use contract::frame_orbit_camera_controller_to_sphere;
pub use contract::get_perspective_projection_frame_distance_to_sphere;
pub use contract::look_fly_camera_controller;
pub use contract::move_fly_camera_controller;
pub use contract::pan_orbit_camera_controller;
pub use contract::pan_orbit_camera_controller_in_view_plane;
pub use contract::reset_camera_shake;
pub use contract::reset_fly_camera_controller;
pub use contract::reset_orbit_camera_controller;
pub use contract::rotate_orbit_camera_controller;
pub use contract::set_orthographic_projection_frame_to_sphere;
pub use contract::snap_fly_camera_controller;
pub use contract::snap_orbit_camera_controller;
pub use contract::update_camera_2d_follow;
pub use contract::update_camera_shake;
pub use contract::update_fly_camera_controller;
pub use contract::update_orbit_camera_controller;

pub use contract::CameraShake;
pub use contract::CameraShakeOffset;
pub use contract::CameraShakeOptions;
pub use contract::FlyCameraController;
pub use contract::FlyCameraControllerOptions;
pub use contract::OrbitCameraController;
pub use contract::OrbitCameraControllerOptions;
