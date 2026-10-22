use flight_entity::allocate_entity;
use flight_math::{RandomSource, create_random_source};

use crate::ParticleObjectsState;

// flight-lint: allow(conform-params) D23 B: authored fields removed; caller assigns after create
pub fn create_particle_objects_state() -> ParticleObjectsState {
    let mut out: ParticleObjectsState = allocate_entity();
    initialize_particle_objects_state(&mut out, 0, create_random_source(0));
    return out;
}

pub fn initialize_particle_objects_state(
    out: &mut ParticleObjectsState,
    capacity: usize,
    random: RandomSource,
) {
    out.burst_timer = 0.0;
    out.emitter_age = 0.0;
    out.lifetimes = vec![0.0; capacity * 2];
    out.prev_x = f32::NAN;
    out.prev_y = f32::NAN;
    out.random = random;
    out.rotation_speeds = vec![0.0; capacity];
    out.scales = vec![0.0; capacity];
    out.spawn_accumulator = 0.0;
    out.velocities = vec![0.0; capacity * 2];
}

pub fn ensure_particle_objects_state_capacity(
    state: &mut ParticleObjectsState,
    capacity: usize,
) {
    if state.lifetimes.len() >= capacity * 2 {
        return;
    }
    state.lifetimes.resize(capacity * 2, 0.0);
    state.velocities.resize(capacity * 2, 0.0);
    state.scales.resize(capacity, 0.0);
    state.rotation_speeds.resize(capacity, 0.0);
}
