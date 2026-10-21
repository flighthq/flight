use flight_entity::allocate_entity;

use crate::{ParticleEmitterSignals, ParticleEmitterState, Signal};

pub fn create_particle_emitter_signals() -> ParticleEmitterSignals {
    let mut out: ParticleEmitterSignals = allocate_entity();
    initialize_particle_emitter_signals(&mut out);
    return out;
}

/// Opt-in signals for a typed-array particle emitter.
///
/// Returns a clone of the `ParticleEmitterSignals` attached to `state`, creating
/// them on first call. The cost of signals is zero until this function is called.
pub fn enable_particle_emitter_signals(
    state: &mut ParticleEmitterState,
) -> ParticleEmitterSignals {
    if state.signals.is_none() {
        state.signals = Some(create_particle_emitter_signals());
    }
    return state.signals.clone().unwrap();
}

/// Return a clone of the `ParticleEmitterSignals` attached to `state`, or `None`
/// if signals have not been enabled for this emitter.
pub fn get_particle_emitter_signals(
    state: &ParticleEmitterState,
) -> Option<ParticleEmitterSignals> {
    return state.signals.clone();
}

/// Initialise a fresh `ParticleEmitterSignals` group.
pub fn initialize_particle_emitter_signals(out: &mut ParticleEmitterSignals) {
    out.on_emitter_complete = Signal {};
    out.on_particle_death = Signal {};
    out.on_particle_spawn = Signal {};
}
