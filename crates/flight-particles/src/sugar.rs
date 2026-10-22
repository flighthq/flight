use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn emitter_config_new_delegates() {
        let method = ParticleEmitterConfig::new(None);
        let free = create_particle_emitter_config(None);
        assert_eq!(method.spawn_rate, free.spawn_rate);
        assert_eq!(method.max_particles, free.max_particles);
    }

    #[test]
    fn emitter_config_normalize_delegates() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfigOptions {
            spawn_rate: Some(-5.0),
            max_particles: Some(-1.0),
            ..create_particle_emitter_config_options()
        }));
        let method = config.normalize();
        let free = normalize_particle_emitter_config(Some(&config));
        assert_eq!(method.spawn_rate, free.spawn_rate);
    }

    #[test]
    fn emitter_config_validate_delegates() {
        let config = create_particle_emitter_config(None);
        let mut method_out = Vec::new();
        config.validate(&mut method_out);
        let mut free_out = Vec::new();
        validate_particle_emitter_config(&mut free_out, &config);
        assert_eq!(method_out.len(), free_out.len());
    }

    #[test]
    fn emitter_signals_new_delegates() {
        let method = ParticleEmitterSignals::new();
        let free = create_particle_emitter_signals();
        let _ = &method.on_particle_spawn;
        let _ = &free.on_particle_spawn;
    }

    #[test]
    fn emitter_state_new_delegates() {
        let method = ParticleEmitterState::new();
        let free = create_particle_emitter_state();
        assert_eq!(method.spawn_accumulator, free.spawn_accumulator);
    }

    #[test]
    fn emitter_state_enable_signals_delegates() {
        let mut method_state = create_particle_emitter_state();
        let mut free_state = create_particle_emitter_state();
        let method = method_state.enable_signals();
        let free = enable_particle_emitter_signals(&mut free_state);
        assert!(method_state.signals.is_some());
        assert!(free_state.signals.is_some());
        let _ = (&method.on_particle_spawn, &free.on_particle_spawn);
    }

    #[test]
    fn emitter_state_get_signals_delegates() {
        let state = create_particle_emitter_state();
        let method = state.get_signals();
        let free = get_particle_emitter_signals(&state);
        assert_eq!(method.is_none(), free.is_none());
    }

    #[test]
    fn objects_state_new_delegates() {
        let mut method = ParticleObjectsState::new();
        method.ensure_capacity(10);
        let mut free = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut free, 10);
        assert_eq!(method.lifetimes.len(), free.lifetimes.len());
    }

    #[test]
    fn emitter_state_ensure_capacity_delegates() {
        let mut method_s = create_particle_emitter_state();
        let mut free_s = create_particle_emitter_state();
        method_s.ensure_capacity(10, true);
        ensure_particle_emitter_state_capacity(&mut free_s, 10, true);
        assert_eq!(method_s.lifetimes.len(), free_s.lifetimes.len());
        assert_eq!(method_s.color_birth.len(), free_s.color_birth.len());
    }

    #[test]
    fn objects_state_ensure_capacity_delegates() {
        let mut method_s = create_particle_objects_state();
        let mut free_s = create_particle_objects_state();
        method_s.ensure_capacity(10);
        ensure_particle_objects_state_capacity(&mut free_s, 10);
        assert_eq!(method_s.lifetimes.len(), free_s.lifetimes.len());
        assert_eq!(method_s.velocities.len(), free_s.velocities.len());
    }

    #[test]
    fn objects_state_is_complete_delegates() {
        let objects = vec![ParticleObject {
            alpha: 1.0,
            blend_mode: None,
            color_scale_bias: None,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            visible: false,
            x: 0.0,
            y: 0.0,
        }];
        let mut state = create_particle_objects_state();
        ensure_particle_objects_state_capacity(&mut state, 1);
        let config = create_particle_emitter_config(None);
        let method = state.is_complete(&objects, &config);
        let free = is_particle_objects_complete(&objects, &state, &config);
        assert_eq!(method, free);
    }
}

impl ParticleEmitterConfig {
    pub fn new(overrides: Option<&ParticleEmitterConfigOptions>) -> Self {
        return create_particle_emitter_config(overrides);
    }

    pub fn normalize(&self) -> ParticleEmitterConfig {
        return normalize_particle_emitter_config(Some(self));
    }

    pub fn validate(&self, out: &mut Vec<ParticleConfigIssue>) {
        validate_particle_emitter_config(out, self);
    }
}

impl ParticleEmitterSignals {
    pub fn new() -> Self {
        return create_particle_emitter_signals();
    }
}

impl ParticleEmitterState {
    pub fn new() -> Self {
        return create_particle_emitter_state();
    }

    pub fn enable_signals(&mut self) -> ParticleEmitterSignals {
        return enable_particle_emitter_signals(self);
    }

    pub fn ensure_capacity(&mut self, capacity: usize, has_color_variance: bool) {
        ensure_particle_emitter_state_capacity(self, capacity, has_color_variance);
    }

    pub fn get_signals(&self) -> Option<ParticleEmitterSignals> {
        return get_particle_emitter_signals(self);
    }
}

impl ParticleObjectsState {
    pub fn new() -> Self {
        return create_particle_objects_state();
    }

    pub fn ensure_capacity(&mut self, capacity: usize) {
        ensure_particle_objects_state_capacity(self, capacity);
    }

    pub fn is_complete(
        &self,
        objects: &[ParticleObject],
        config: &ParticleEmitterConfig,
    ) -> bool {
        return is_particle_objects_complete(objects, self, config);
    }
}
