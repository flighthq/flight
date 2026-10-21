use flight_math::RandomSource;

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
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            spawn_rate: -5.0,
            max_particles: -1.0,
            alpha_curve: None,
            alpha_end: 0.0,
            alpha_start: 1.0,
            blend_mode: None,
            burst_count: 0.0,
            burst_interval: 0.0,
            color_curve: None,
            color_end_b: 1.0,
            color_end_g: 1.0,
            color_end_r: 1.0,
            color_end_variance_b: 0.0,
            color_end_variance_g: 0.0,
            color_end_variance_r: 0.0,
            color_start_b: 1.0,
            color_start_g: 1.0,
            color_start_r: 1.0,
            color_start_variance_b: 0.0,
            color_start_variance_g: 0.0,
            color_start_variance_r: 0.0,
            direction_x: 0.0,
            direction_y: -1.0,
            direction_z: 0.0,
            duration: 0.0,
            emitter_cone_angle: 0.0,
            emitter_depth: 0.0,
            emitter_height: 0.0,
            emitter_radius: 0.0,
            emitter_shape: EmitterShape::Point,
            emitter_width: 0.0,
            frame_count: 1.0,
            frame_rate: 12.0,
            gravity_x: 0.0,
            gravity_y: 0.0,
            gravity_z: 0.0,
            lifetime_max: 1.0,
            lifetime_min: 0.5,
            looping: true,
            region_id_max: 1.0,
            region_id_min: 0.0,
            rotation_speed_max: 0.0,
            rotation_speed_min: 0.0,
            scale_curve: None,
            scale_end: 1.0,
            scale_max: 1.0,
            scale_min: 1.0,
            speed_max: 100.0,
            speed_min: 50.0,
            spread: std::f32::consts::PI,
            velocity_inheritance: 0.0,
            world_space: false,
        }));
        let method = config.normalize();
        let free = normalize_particle_emitter_config(Some(&config));
        assert_eq!(method.spawn_rate, free.spawn_rate);
    }

    #[test]
    fn emitter_config_validate_delegates() {
        let config = create_particle_emitter_config(None);
        let method = config.validate();
        let free = validate_particle_emitter_config(&config);
        assert_eq!(method.len(), free.len());
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
        let method = ParticleEmitterState::new(None);
        let free = create_particle_emitter_state(None);
        assert_eq!(method.spawn_accumulator, free.spawn_accumulator);
    }

    #[test]
    fn emitter_state_enable_signals_delegates() {
        let mut method_state = create_particle_emitter_state(None);
        let mut free_state = create_particle_emitter_state(None);
        let method = method_state.enable_signals();
        let free = enable_particle_emitter_signals(&mut free_state);
        assert_eq!(method, free);
    }

    #[test]
    fn emitter_state_get_signals_delegates() {
        let state = create_particle_emitter_state(None);
        let method = state.get_signals();
        let free = get_particle_emitter_signals(&state);
        assert_eq!(method, free);
    }

    #[test]
    fn objects_state_new_delegates() {
        let method = ParticleObjectsState::new(10, None);
        let free = create_particle_objects_state(10, None);
        assert_eq!(method.lifetimes.len(), free.lifetimes.len());
    }

    #[test]
    fn emitter_state_ensure_capacity_delegates() {
        let mut method_s = create_particle_emitter_state(None);
        let mut free_s = create_particle_emitter_state(None);
        method_s.ensure_capacity(10, true);
        ensure_particle_emitter_state_capacity(&mut free_s, 10, true);
        assert_eq!(method_s.lifetimes.len(), free_s.lifetimes.len());
        assert_eq!(method_s.color_birth.len(), free_s.color_birth.len());
    }

    #[test]
    fn objects_state_ensure_capacity_delegates() {
        let mut method_s = create_particle_objects_state(0, None);
        let mut free_s = create_particle_objects_state(0, None);
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
        let state = create_particle_objects_state(1, None);
        let config = create_particle_emitter_config(None);
        let method = state.is_complete(&objects, &config);
        let free = is_particle_objects_complete(&objects, &state, &config);
        assert_eq!(method, free);
    }
}

impl ParticleEmitterConfig {
    pub fn new(overrides: Option<&ParticleEmitterConfig>) -> Self {
        return create_particle_emitter_config(overrides);
    }

    pub fn normalize(&self) -> ParticleEmitterConfig {
        return normalize_particle_emitter_config(Some(self));
    }

    pub fn validate(&self) -> Vec<ParticleConfigIssue> {
        return validate_particle_emitter_config(self);
    }
}

impl ParticleEmitterSignals {
    pub fn new() -> Self {
        return create_particle_emitter_signals();
    }
}

impl ParticleEmitterState {
    pub fn new(random: Option<RandomSource>) -> Self {
        return create_particle_emitter_state(random);
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
    pub fn new(capacity: usize, random: Option<RandomSource>) -> Self {
        return create_particle_objects_state(capacity, random);
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
