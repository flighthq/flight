//! Arc-length motion-path markers over a `Path`: position, heading and progress queries, direction
//! and distance seeking, and clamp/loop/pingpong stepping. Pure math over the path package; no
//! animation loop, timer or device operation lives here.

mod motion_path;
mod sugar;
mod types;

pub mod contract;

// Public lane: the functions exported by pinned TS `index.ts`, plus the locally owned types their
// signatures use. `initialize_motion_path` stays contract-only.
pub use contract::create_motion_path;
pub use contract::get_motion_path_heading;
pub use contract::get_motion_path_position;
pub use contract::get_motion_path_progress;
pub use contract::is_motion_path_at_end;
pub use contract::set_motion_path_direction;
pub use contract::set_motion_path_distance;
pub use contract::set_motion_path_progress;
pub use contract::update_motion_path;

pub use contract::MotionPath;
pub use contract::MotionPathDirection;
pub use contract::MotionPathLoopMode;
