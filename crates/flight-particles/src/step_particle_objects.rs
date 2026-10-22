use crate::{
    ParticleCollider, ParticleEmitterConfig, ParticleForce, ParticleObject, ParticleObjectsState,
    ParticleObjectsUpdateOptions, apply_particle_object_collisions, apply_particle_object_forces,
    update_particle_objects,
};

/// Convenience wrapper for the object-pool path that folds the canonical
/// three-step update sequence into a single call:
/// `apply_particle_object_forces` -> `update_particle_objects` -> `apply_particle_object_collisions`.
pub fn step_particle_objects(
    objects: &mut [ParticleObject],
    state: &mut ParticleObjectsState,
    config: &ParticleEmitterConfig,
    delta_time: f32,
    forces: Option<&[ParticleForce]>,
    colliders: Option<&[ParticleCollider]>,
    update_options: Option<&ParticleObjectsUpdateOptions>,
) {
    if let Some(f) = forces {
        if !f.is_empty() {
            apply_particle_object_forces(objects, state, f, delta_time);
        }
    }
    update_particle_objects(objects, state, config, delta_time, update_options);
    if let Some(c) = colliders {
        if !c.is_empty() {
            apply_particle_object_collisions(objects, state, c);
        }
    }
}
