//! Construction and capacity-management for particle emitter state types,
//! and the default `ParticleEmitterConfig` builder.

use flighthq_geometry::reserve_f32;
use flighthq_types::{
    ParticleBlendMode, ParticleEmitterConfig, ParticleEmitterShape, ParticleEmitterState,
    ParticleObjectsState,
};

/// Create a `ParticleEmitterConfig` with the canonical particle-system
/// defaults when `overrides` is `None`, or return the provided full config
/// otherwise.
///
/// Note: the defaults here are the *particle-system* defaults (matching the
/// TypeScript `createParticleEmitterConfig`), which differ from the bare
/// `ParticleEmitterConfig::default()` used elsewhere — e.g. `alpha_end = 0`,
/// `duration = 0`, `frame_rate = 12`, `max_particles = 1000`.
pub fn create_particle_emitter_config(
    overrides: Option<ParticleEmitterConfig>,
) -> ParticleEmitterConfig {
    match overrides {
        Some(config) => config,
        None => default_particle_emitter_config(),
    }
}

/// Create a new, empty `ParticleEmitterState`.  The `random_seed` is used to
/// seed the internal PRNG so that simulations are reproducible.  Per-particle
/// arrays start empty and grow on demand via
/// [`ensure_particle_emitter_state_capacity`].
pub fn create_particle_emitter_state(random_seed: u64) -> ParticleEmitterState {
    ParticleEmitterState {
        burst_timer: 0.0,
        color_birth: Vec::new(),
        color_death: Vec::new(),
        emitter_age: 0.0,
        lifetimes: Vec::new(),
        prev_x: f32::NAN,
        prev_y: f32::NAN,
        random_state: (random_seed & 0xffff_ffff) as u32,
        rotation_speeds: Vec::new(),
        scales: Vec::new(),
        spawn_accumulator: 0.0,
        velocities: Vec::new(),
    }
}

/// Create a `ParticleObjectsState` pre-allocated for `capacity` objects.  All
/// lifetime slots start dead (`max_age == 0`).
pub fn create_particle_objects_state(capacity: usize, random_seed: u64) -> ParticleObjectsState {
    ParticleObjectsState {
        burst_timer: 0.0,
        emitter_age: 0.0,
        lifetimes: vec![0.0; capacity * 2],
        prev_x: f32::NAN,
        prev_y: f32::NAN,
        random_state: (random_seed & 0xffff_ffff) as u32,
        rotation_speeds: vec![0.0; capacity],
        scales: vec![0.0; capacity],
        spawn_accumulator: 0.0,
        velocities: vec![0.0; capacity * 2],
    }
}

/// Grow the per-particle arrays inside `state` to hold at least `capacity`
/// particles.  No-op when already large enough.
///
/// `has_color_variance` controls whether `color_birth`/`color_death` are
/// also grown — they are kept empty when the emitter uses constant colors.
pub fn ensure_particle_emitter_state_capacity(
    state: &mut ParticleEmitterState,
    capacity: usize,
    has_color_variance: bool,
) {
    if state.lifetimes.len() >= capacity * 2 {
        if has_color_variance && state.color_birth.len() < capacity * 3 {
            let birth = std::mem::take(&mut state.color_birth);
            let death = std::mem::take(&mut state.color_death);
            state.color_birth = reserve_f32(birth, capacity * 3);
            state.color_death = reserve_f32(death, capacity * 3);
        }
        return;
    }
    let lifetimes = std::mem::take(&mut state.lifetimes);
    let velocities = std::mem::take(&mut state.velocities);
    let scales = std::mem::take(&mut state.scales);
    let rotation_speeds = std::mem::take(&mut state.rotation_speeds);
    state.lifetimes = reserve_f32(lifetimes, capacity * 2);
    state.velocities = reserve_f32(velocities, capacity * 2);
    state.scales = reserve_f32(scales, capacity);
    state.rotation_speeds = reserve_f32(rotation_speeds, capacity);
    if has_color_variance {
        let birth = std::mem::take(&mut state.color_birth);
        let death = std::mem::take(&mut state.color_death);
        state.color_birth = reserve_f32(birth, capacity * 3);
        state.color_death = reserve_f32(death, capacity * 3);
    }
}

/// Grow the per-object arrays inside `state` to hold at least `capacity`
/// objects.  No-op when already large enough.
pub fn ensure_particle_objects_state_capacity(state: &mut ParticleObjectsState, capacity: usize) {
    if state.lifetimes.len() >= capacity * 2 {
        return;
    }
    let lifetimes = std::mem::take(&mut state.lifetimes);
    let velocities = std::mem::take(&mut state.velocities);
    let scales = std::mem::take(&mut state.scales);
    let rotation_speeds = std::mem::take(&mut state.rotation_speeds);
    state.lifetimes = reserve_f32(lifetimes, capacity * 2);
    state.velocities = reserve_f32(velocities, capacity * 2);
    state.scales = reserve_f32(scales, capacity);
    state.rotation_speeds = reserve_f32(rotation_speeds, capacity);
}

/// Advance a mulberry32 PRNG `state` in place and return a value in `[0.0, 1.0)`.
///
/// Mirrors `flighthq_math::random_next_f64` exactly (same constants, same
/// `Math.imul` wrapping semantics, same `u32 / 2^32` mapping) so a given seed
/// reproduces the same simulation as the TypeScript `state.random()`. Kept local
/// because the emitter state stores the raw `u32` rather than a `RandomSource`.
pub(crate) fn next_random(state: &mut u32) -> f32 {
    *state = state.wrapping_add(0x6d2b79f5);
    let a = *state;
    let mut t = u32::wrapping_mul(a ^ (a >> 15), 1u32 | a);
    t = u32::wrapping_add(u32::wrapping_mul(t ^ (t >> 7), 61u32 | t), t) ^ t;
    let raw = t ^ (t >> 14);
    (raw as f64 / 4_294_967_296.0) as f32
}

// The canonical particle-system defaults. Kept as a free helper (not the type's
// `Default`) because the particle-system defaults differ from the bare struct
// default, and validation needs to reference both.
pub(crate) fn default_particle_emitter_config() -> ParticleEmitterConfig {
    ParticleEmitterConfig {
        alpha_end: 0.0,
        alpha_start: 1.0,
        blend_mode: None as Option<ParticleBlendMode>,
        burst_count: 0,
        burst_interval: 0.0,
        color_end_r: 1.0,
        color_end_g: 1.0,
        color_end_b: 1.0,
        color_end_variance_r: 0.0,
        color_end_variance_g: 0.0,
        color_end_variance_b: 0.0,
        color_start_r: 1.0,
        color_start_g: 1.0,
        color_start_b: 1.0,
        color_start_variance_r: 0.0,
        color_start_variance_g: 0.0,
        color_start_variance_b: 0.0,
        direction_x: 0.0,
        direction_y: -1.0,
        duration: 0.0,
        emitter_height: 0.0,
        emitter_radius: 0.0,
        emitter_shape: ParticleEmitterShape::Point,
        emitter_width: 0.0,
        frame_count: 1,
        frame_rate: 12.0,
        gravity_x: 0.0,
        gravity_y: 0.0,
        lifetime_max: 1.0,
        lifetime_min: 0.5,
        loop_: true,
        max_particles: 1000,
        region_id_max: 1,
        region_id_min: 0,
        rotation_speed_max: 0.0,
        rotation_speed_min: 0.0,
        scale_end: 1.0,
        scale_max: 1.0,
        scale_min: 1.0,
        spawn_rate: 10.0,
        speed_max: 100.0,
        speed_min: 50.0,
        spread: std::f32::consts::PI,
        velocity_inheritance: 0.0,
        world_space: false,
        alpha_curve: None,
        color_curve: None,
        scale_curve: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_particle_emitter_config_defaults() {
        let config = create_particle_emitter_config(None);
        assert_eq!(config.alpha_end, 0.0);
        assert_eq!(config.alpha_start, 1.0);
        assert_eq!(config.burst_count, 0);
        assert_eq!(config.duration, 0.0);
        assert!(config.loop_);
        assert_eq!(config.direction_y, -1.0);
        assert_eq!(config.emitter_shape, ParticleEmitterShape::Point);
        assert_eq!(config.frame_count, 1);
        assert_eq!(config.frame_rate, 12.0);
        assert_eq!(config.lifetime_max, 1.0);
        assert_eq!(config.lifetime_min, 0.5);
        assert_eq!(config.max_particles, 1000);
        assert_eq!(config.region_id_max, 1);
        assert_eq!(config.speed_max, 100.0);
        assert_eq!(config.speed_min, 50.0);
        assert_eq!(config.spawn_rate, 10.0);
        assert_eq!(config.spread, std::f32::consts::PI);
        assert!(config.blend_mode.is_none());
    }

    #[test]
    fn create_particle_emitter_config_returns_overrides() {
        let mut over = default_particle_emitter_config();
        over.spawn_rate = 60.0;
        over.max_particles = 500;
        let config = create_particle_emitter_config(Some(over));
        assert_eq!(config.spawn_rate, 60.0);
        assert_eq!(config.max_particles, 500);
    }

    #[test]
    fn create_particle_emitter_state_smoke() {
        let state = create_particle_emitter_state(0);
        assert!(state.lifetimes.is_empty());
        assert!(state.velocities.is_empty());
        assert!(state.scales.is_empty());
        assert!(state.rotation_speeds.is_empty());
        assert!(state.color_birth.is_empty());
        assert!(state.color_death.is_empty());
        assert_eq!(state.spawn_accumulator, 0.0);
        assert_eq!(state.burst_timer, 0.0);
        assert!(state.prev_x.is_nan());
        assert!(state.prev_y.is_nan());
    }

    #[test]
    fn create_particle_objects_state_capacity() {
        let state = create_particle_objects_state(10, 0);
        assert_eq!(state.lifetimes.len(), 20);
        assert_eq!(state.velocities.len(), 20);
        assert_eq!(state.spawn_accumulator, 0.0);
        for i in 0..10 {
            assert_eq!(state.lifetimes[i * 2 + 1], 0.0);
        }
    }

    #[test]
    fn ensure_particle_emitter_state_capacity_grows() {
        let mut state = create_particle_emitter_state(0);
        ensure_particle_emitter_state_capacity(&mut state, 10, false);
        assert!(state.lifetimes.len() >= 20);
        assert!(state.velocities.len() >= 20);
        assert!(state.scales.len() >= 10);
        assert!(state.rotation_speeds.len() >= 10);
        assert_eq!(state.color_birth.len(), 0);
        assert_eq!(state.color_death.len(), 0);
    }

    #[test]
    fn ensure_particle_emitter_state_capacity_color_variance() {
        let mut state = create_particle_emitter_state(0);
        ensure_particle_emitter_state_capacity(&mut state, 8, true);
        assert!(state.color_birth.len() >= 24);
        assert!(state.color_death.len() >= 24);
    }

    #[test]
    fn ensure_particle_emitter_state_capacity_backfills_color() {
        let mut state = create_particle_emitter_state(0);
        ensure_particle_emitter_state_capacity(&mut state, 8, false);
        assert_eq!(state.color_birth.len(), 0);
        ensure_particle_emitter_state_capacity(&mut state, 8, true);
        assert!(state.color_birth.len() >= 24);
        assert!(state.color_death.len() >= 24);
    }

    #[test]
    fn ensure_particle_emitter_state_capacity_noop() {
        let mut state = create_particle_emitter_state(0);
        ensure_particle_emitter_state_capacity(&mut state, 16, false);
        let len = state.lifetimes.len();
        ensure_particle_emitter_state_capacity(&mut state, 4, false);
        assert_eq!(state.lifetimes.len(), len);
    }

    #[test]
    fn ensure_particle_objects_state_capacity_grows() {
        let mut state = create_particle_objects_state(5, 0);
        ensure_particle_objects_state_capacity(&mut state, 20);
        assert!(state.lifetimes.len() >= 40);
        assert!(state.velocities.len() >= 40);
    }

    #[test]
    fn ensure_particle_objects_state_capacity_noop() {
        let mut state = create_particle_objects_state(10, 0);
        let len = state.lifetimes.len();
        ensure_particle_objects_state_capacity(&mut state, 10);
        assert_eq!(state.lifetimes.len(), len);
    }
}
