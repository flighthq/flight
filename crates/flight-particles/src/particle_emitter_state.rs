use flight_entity::allocate_entity;
use flight_math::{RandomSource, create_random_source};

use crate::ParticleEmitterState;

/// Velocity stride: [vx, vy, vz] per particle.
pub const PARTICLE_VELOCITY_STRIDE: usize = 3;

pub fn create_particle_emitter_state(
    random: Option<RandomSource>,
) -> ParticleEmitterState {
    let mut out: ParticleEmitterState = allocate_entity();
    initialize_particle_emitter_state(&mut out, random);
    return out;
}

pub fn initialize_particle_emitter_state(
    out: &mut ParticleEmitterState,
    random: Option<RandomSource>,
) {
    out.burst_timer = 0.0;
    out.color_birth = Vec::new();
    out.color_death = Vec::new();
    out.emitter_age = 0.0;
    out.lifetimes = Vec::new();
    out.prev_x = f32::NAN;
    out.prev_y = f32::NAN;
    out.prev_z = f32::NAN;
    out.random = random.unwrap_or_else(|| create_random_source(0));
    out.rotation_speeds = Vec::new();
    out.scales = Vec::new();
    out.spawn_accumulator = 0.0;
    out.velocities = Vec::new();
    out.signals = None;
}

/// Grow the per-particle state arrays to hold at least `capacity` particles.
/// No-op when already large enough. `color_birth`/`color_death` are only grown when
/// the emitter uses color variance (they stay empty otherwise).
pub fn ensure_particle_emitter_state_capacity(
    state: &mut ParticleEmitterState,
    capacity: usize,
    has_color_variance: bool,
) {
    if state.lifetimes.len() >= capacity * 2 {
        if has_color_variance && state.color_birth.len() < capacity * 3 {
            state.color_birth.resize(capacity * 3, 0.0);
            state.color_death.resize(capacity * 3, 0.0);
        }
        return;
    }
    if state.lifetimes.len() < capacity * 2 {
        state.lifetimes.resize(capacity * 2, 0.0);
    }
    if state.velocities.len() < capacity * PARTICLE_VELOCITY_STRIDE {
        state.velocities.resize(capacity * PARTICLE_VELOCITY_STRIDE, 0.0);
    }
    if state.scales.len() < capacity {
        state.scales.resize(capacity, 0.0);
    }
    if state.rotation_speeds.len() < capacity {
        state.rotation_speeds.resize(capacity, 0.0);
    }
    if has_color_variance {
        if state.color_birth.len() < capacity * 3 {
            state.color_birth.resize(capacity * 3, 0.0);
        }
        if state.color_death.len() < capacity * 3 {
            state.color_death.resize(capacity * 3, 0.0);
        }
    }
}
