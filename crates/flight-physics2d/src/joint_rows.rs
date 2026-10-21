//! Soft constraint rows (TS `jointRows.ts`).

const TAU: f32 = 2.0 * std::f32::consts::PI;

/// Writes `[effectiveMass, biasFactor, gamma]` for a soft row of the given natural frequency and
/// damping, or the hard row `[mass, hardBiasFactor, 0]` when the spring is off (TS
/// `writePhysics2DSoftRowParameters`).
// flight-lint: allow(conform-params) D9b: out-first
pub fn write_physics2d_soft_row_parameters(
    out: &mut [f32],
    mass: f32,
    frequency_hz: f32,
    damping_ratio: f32,
    dt: f32,
    hard_bias_factor: f32,
) {
    if !(frequency_hz > 0.0) || !(dt > 0.0) {
        out[0] = mass;
        out[1] = hard_bias_factor;
        out[2] = 0.0;
        return;
    }
    let angular = TAU * frequency_hz;
    let damping = 2.0 * mass * damping_ratio * angular;
    let stiffness = mass * angular * angular;
    let gamma_denominator = dt * (damping + dt * stiffness);
    let gamma = if gamma_denominator > 0.0 {
        1.0 / gamma_denominator
    } else {
        0.0
    };
    let inverse_mass = if mass > 0.0 { 1.0 / mass } else { 0.0 };
    let softened = inverse_mass + gamma;
    out[0] = if softened > 0.0 { 1.0 / softened } else { 0.0 };
    out[1] = dt * stiffness * gamma;
    out[2] = gamma;
}
