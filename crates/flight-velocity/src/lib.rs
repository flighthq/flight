mod transform_velocity;
mod velocity2d;
mod velocity_explanation;
mod velocity_sample;
mod velocity_store;

pub mod contract;

// Public lane: exactly the values of the pinned TS `index.ts` (all of transformVelocity, the
// selected velocityField functions, and all of velocitySample), plus the public type exports.
// Contract-only seams (ensure/find sample lookups, initialize_*, the pure sample rules, the
// Rust-only clone helper, and the D9e string conversions) stay in `contract`.
pub use contract::add_velocity;
pub use contract::begin_velocity_frame;
pub use contract::clamp_velocity;
pub use contract::contribute_transform_velocity;
pub use contract::contribute_velocity;
pub use contract::copy_velocity;
pub use contract::create_velocity_field;
pub use contract::damp_velocity;
pub use contract::explain_velocity;
pub use contract::get_velocity;
pub use contract::get_velocity_sample_at;
pub use contract::has_velocity;
pub use contract::is_velocity_zero;
pub use contract::length_of_velocity;
pub use contract::lerp_velocity;
pub use contract::normalize_velocity;
pub use contract::scale_velocity;
pub use contract::subtract_velocity;
pub use contract::suppress_velocity;
pub use contract::zero_velocity;

pub use contract::SourceId;
pub use contract::Velocity2D;
pub use contract::VelocityExplanation;
pub use contract::VelocityField;
pub use contract::VelocityReason;
pub use contract::VelocitySample;
