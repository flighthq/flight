/// Control-point distance, as a fraction of the radius, for approximating a quarter circle with one
/// cubic Bezier: `4 * (sqrt(2) - 1) / 3`.
pub const CIRCLE_KAPPA: f64 = 0.5522847498307936;

/// Default absolute tolerance for approximate floating-point comparisons.
pub const EPSILON: f64 = 1e-6;

/// Full circle in radians (2pi).
pub const TAU: f64 = std::f64::consts::PI * 2.0;

/// Half of pi (pi / 2).
pub const HALF_PI: f64 = std::f64::consts::PI / 2.0;

/// Multiply degrees by this constant to get radians.
pub const DEG_TO_RAD: f64 = std::f64::consts::PI / 180.0;

/// Multiply radians by this constant to get degrees.
pub const RAD_TO_DEG: f64 = 180.0 / std::f64::consts::PI;
