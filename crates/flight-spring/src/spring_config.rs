/// A spring configuration defined by frequency and damping ratio.
///
/// - `damping_ratio`: 0 = undamped, <1 = underdamped (overshoots), 1 = critically damped
///   (fastest no-overshoot), >1 = overdamped
/// - `frequency`: oscillation frequency in Hz (cycles per second)
#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct SpringConfig {
    pub damping_ratio: f32,
    pub frequency: f32,
}

/// Builds a `SpringConfig` from the designer-intuitive `frequency` (Hz) and `damping_ratio`
/// (0 undamped, <1 underdamped/overshoots, 1 critical/fastest-no-overshoot, >1 overdamped). This is
/// the primary constructor; use `create_spring_config_from_physical` when starting from raw physics.
pub fn create_spring_config(frequency: f32, damping_ratio: f32) -> SpringConfig {
    return SpringConfig { damping_ratio, frequency };
}

/// Builds a `SpringConfig` from a physical spring: `stiffness` (k), `damping` (c), and `mass` (m).
/// Converts to the mass-independent form via `frequency = sqrt(k / m) / TAU` and
/// `damping_ratio = c / (2 * sqrt(k * m))`, the standard undamped-natural-frequency and
/// damping-ratio identities. Expects positive `stiffness` and `mass`.
pub fn create_spring_config_from_physical(
    stiffness: f32,
    damping: f32,
    mass: f32,
) -> SpringConfig {
    let frequency = (stiffness / mass).sqrt() / std::f32::consts::TAU;
    let damping_ratio = damping / (2.0 * (stiffness * mass).sqrt());
    return create_spring_config(frequency, damping_ratio);
}


impl SpringConfig {
    pub fn new(frequency: f32, damping_ratio: f32) -> Self {
        return create_spring_config(frequency, damping_ratio);
    }

    pub fn from_physical(stiffness: f32, damping: f32, mass: f32) -> Self {
        return create_spring_config_from_physical(stiffness, damping, mass);
    }
}

/// Frozen plain-data preset: quick and underdamped for visible overshoot.
pub const SPRING_PRESET_BOUNCY: SpringConfig = SpringConfig {
    damping_ratio: 0.35,
    frequency: 2.0,
};

/// A slower, well-damped profile for soft UI movement with only a restrained overshoot.
pub const SPRING_PRESET_GENTLE: SpringConfig = SpringConfig {
    damping_ratio: 0.8,
    frequency: 1.5,
};

/// A high-frequency critical profile for a fast response without overshoot.
pub const SPRING_PRESET_STIFF: SpringConfig = SpringConfig {
    damping_ratio: 1.0,
    frequency: 4.0,
};
