mod spring;
mod spring2d;
mod spring3d;
mod spring_config;

pub mod contract;

// Public lane: every name exported by the pinned TS `index.ts` (including the explicit
// initializeSpring* exports and the three preset values) plus the public type exports.
// Contract-only seams (initialize_spring_config and the Rust-only SPRING_SETTLE_EPSILON) stay
// in `contract`.
pub use contract::SPRING_PRESET_BOUNCY;
pub use contract::SPRING_PRESET_GENTLE;
pub use contract::SPRING_PRESET_STIFF;
pub use contract::add_spring_impulse;
pub use contract::add_spring_impulse_2d;
pub use contract::add_spring_impulse_3d;
pub use contract::create_spring;
pub use contract::create_spring_config;
pub use contract::create_spring_config_from_physical;
pub use contract::create_spring2d;
pub use contract::create_spring3d;
pub use contract::initialize_spring;
pub use contract::initialize_spring2d;
pub use contract::initialize_spring3d;
pub use contract::is_spring_settled;
pub use contract::is_spring2d_settled;
pub use contract::is_spring3d_settled;
pub use contract::reset_spring;
pub use contract::reset_spring2d;
pub use contract::reset_spring3d;
pub use contract::update_spring;
pub use contract::update_spring_angle;
pub use contract::update_spring2d;
pub use contract::update_spring3d;

pub use contract::Spring;
pub use contract::Spring2D;
pub use contract::Spring3D;
pub use contract::SpringConfig;
