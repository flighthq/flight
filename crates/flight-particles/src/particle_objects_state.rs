use flight_math::RandomSource;

use crate::ParticleObjectsState;

pub fn create_particle_objects_state(
    capacity: usize,
    random: Option<RandomSource>,
) -> ParticleObjectsState {
    let mut out = ParticleObjectsState::default();
    initialize_particle_objects_state(&mut out, capacity, random);
    return out;
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

pub fn initialize_particle_objects_state(
    out: &mut ParticleObjectsState,
    capacity: usize,
    random: Option<RandomSource>,
) {
    out.burst_timer = 0.0;
    out.emitter_age = 0.0;
    out.lifetimes = vec![0.0; capacity * 2];
    out.prev_x = f32::NAN;
    out.prev_y = f32::NAN;
    out.random = random.unwrap_or_default();
    out.rotation_speeds = vec![0.0; capacity];
    out.scales = vec![0.0; capacity];
    out.spawn_accumulator = 0.0;
    out.velocities = vec![0.0; capacity * 2];
}
