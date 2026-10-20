use crate::ParticleEmitterConfig;

pub fn create_particle_emitter_config(
    config: Option<&ParticleEmitterConfig>,
) -> ParticleEmitterConfig {
    return match config {
        Some(c) => c.clone(),
        None => ParticleEmitterConfig::default(),
    };
}
