/// Control-point distance, as a fraction of the radius, for approximating a quarter circle with one
/// cubic Bezier: `4 * (sqrt(2) - 1) / 3`.
pub const CIRCLE_KAPPA: f32 = 0.5522848;

/// Default absolute tolerance for approximate floating-point comparisons.
pub const EPSILON: f32 = 1e-6;

/// Full circle in radians (2pi).
pub const TAU: f32 = std::f32::consts::PI * 2.0;

/// Half of pi (pi / 2).
pub const HALF_PI: f32 = std::f32::consts::PI / 2.0;

/// Multiply degrees by this constant to get radians.
pub const DEG_TO_RAD: f32 = std::f32::consts::PI / 180.0;

/// Multiply radians by this constant to get degrees.
pub const RAD_TO_DEG: f32 = 180.0 / std::f32::consts::PI;
