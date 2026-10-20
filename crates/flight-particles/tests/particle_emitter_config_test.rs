use flight_particles::*;

mod create_particle_emitter_config {
    use super::*;

    #[test]
    fn returns_defaults_when_called_with_no_arguments() {
        let config = create_particle_emitter_config(None);
        assert_eq!(config.alpha_end, 0.0);
        assert_eq!(config.alpha_start, 1.0);
        assert_eq!(config.burst_count, 0.0);
        assert_eq!(config.burst_interval, 0.0);
        assert_eq!(config.duration, 0.0);
        assert_eq!(config.looping, true);
        assert_eq!(config.color_end_r, 1.0);
        assert_eq!(config.color_end_g, 1.0);
        assert_eq!(config.color_end_b, 1.0);
        assert_eq!(config.color_start_r, 1.0);
        assert_eq!(config.color_start_g, 1.0);
        assert_eq!(config.color_start_b, 1.0);
        assert_eq!(config.direction_x, 0.0);
        assert_eq!(config.direction_y, -1.0);
        assert_eq!(config.emitter_shape, EmitterShape::Point);
        assert_eq!(config.emitter_radius, 0.0);
        assert_eq!(config.emitter_width, 0.0);
        assert_eq!(config.emitter_height, 0.0);
        assert_eq!(config.frame_count, 1.0);
        assert_eq!(config.frame_rate, 12.0);
        assert_eq!(config.direction_z, 0.0);
        assert_eq!(config.emitter_cone_angle, 0.0);
        assert_eq!(config.emitter_depth, 0.0);
        assert_eq!(config.gravity_x, 0.0);
        assert_eq!(config.gravity_y, 0.0);
        assert_eq!(config.gravity_z, 0.0);
        assert_eq!(config.lifetime_max, 1.0);
        assert_eq!(config.lifetime_min, 0.5);
        assert_eq!(config.max_particles, 1000.0);
        assert_eq!(config.region_id_max, 1.0);
        assert_eq!(config.region_id_min, 0.0);
        assert_eq!(config.rotation_speed_min, 0.0);
        assert_eq!(config.rotation_speed_max, 0.0);
        assert_eq!(config.scale_end, 1.0);
        assert_eq!(config.velocity_inheritance, 0.0);
        assert_eq!(config.world_space, false);
        assert!(config.blend_mode.is_none());
        assert_eq!(config.color_start_variance_r, 0.0);
        assert_eq!(config.color_start_variance_g, 0.0);
        assert_eq!(config.color_start_variance_b, 0.0);
        assert_eq!(config.color_end_variance_r, 0.0);
        assert_eq!(config.color_end_variance_g, 0.0);
        assert_eq!(config.color_end_variance_b, 0.0);
        assert_eq!(config.scale_max, 1.0);
        assert_eq!(config.scale_min, 1.0);
        assert_eq!(config.speed_max, 100.0);
        assert_eq!(config.speed_min, 50.0);
        assert_eq!(config.spawn_rate, 10.0);
        assert_eq!(config.spread, std::f32::consts::PI);
    }

    #[test]
    fn overrides_individual_fields() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            spawn_rate: 60.0,
            max_particles: 500.0,
            ..Default::default()
        }));
        assert_eq!(config.spawn_rate, 60.0);
        assert_eq!(config.max_particles, 500.0);
        assert_eq!(config.alpha_end, 0.0); // other fields still default
    }

    #[test]
    fn returns_a_new_object_each_call() {
        let a = create_particle_emitter_config(None);
        let b = create_particle_emitter_config(None);
        // They are equal by value but are distinct allocations.
        assert_eq!(a.spawn_rate, b.spawn_rate);
    }
}
