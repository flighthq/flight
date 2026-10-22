use flight_entity::allocate_entity;
use flight_signals::create_signal;

use crate::{ParticleEmitterSignals, ParticleEmitterState};

pub fn create_particle_emitter_signals() -> ParticleEmitterSignals {
    let mut out: ParticleEmitterSignals = allocate_entity();
    initialize_particle_emitter_signals(&mut out);
    return out;
}

/// Initialise a fresh `ParticleEmitterSignals` group.
pub fn initialize_particle_emitter_signals(out: &mut ParticleEmitterSignals) {
    out.on_emitter_complete = create_signal();
    out.on_particle_death = create_signal();
    out.on_particle_spawn = create_signal();
}

/// Opt-in signals for a typed-array particle emitter.
///
/// Returns a handle to the `ParticleEmitterSignals` attached to `state`, creating
/// them on first call. The handle is a clone that shares every signal's slots with the
/// group stored on `state`, so repeated calls return the same signals. The cost of signals is zero until this function is called.
pub fn enable_particle_emitter_signals(state: &mut ParticleEmitterState) -> ParticleEmitterSignals {
    if state.signals.is_none() {
        state.signals = Some(create_particle_emitter_signals());
    }
    return state.signals.clone().unwrap();
}

/// Return a shared handle to the `ParticleEmitterSignals` attached to `state`, or `None`
/// if signals have not been enabled for this emitter.
pub fn get_particle_emitter_signals(
    state: &ParticleEmitterState,
) -> Option<ParticleEmitterSignals> {
    return state.signals.clone();
}
