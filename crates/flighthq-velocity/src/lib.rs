//! `flighthq-velocity` — generic per-node velocity field.
//!
//! Tracks the screen-space velocity of any object across frames. Any system
//! (physics, tween, camera, manual edit) can contribute velocity; consumers
//! read it via [`get_velocity`].
//!
//! # Structure
//!
//! - [`velocity_field`]: core [`VelocityField`] operations — frame boundary,
//!   contribution, retrieval, and suppression.
//! - [`transform_velocity`]: default contributor that derives velocity from
//!   the world-transform delta of every node in a subtree.

pub mod transform_velocity;
pub mod velocity_field;

// velocity_field
pub use velocity_field::{
    begin_velocity_frame, contribute_velocity, create_velocity_field, ensure_velocity_sample,
    get_velocity, has_velocity, suppress_velocity,
};

// transform_velocity
pub use transform_velocity::contribute_transform_velocity;
