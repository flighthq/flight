use flight_particles::*;

mod normalize_particle_emitter_config_tests {
    use super::*;

    #[test]
    fn clamps_negatives_and_floors_integer_fields() {
        let out = normalize_particle_emitter_config(Some(&ParticleEmitterConfig {
            max_particles: -3.0,
            spawn_rate: -10.0,
            burst_count: 4.7,
            frame_count: 0.0,
            emitter_radius: -50.0,
            ..Default::default()
        }));
        assert_eq!(out.max_particles, 0.0);
        assert_eq!(out.spawn_rate, 0.0);
        assert_eq!(out.burst_count, 4.0);
        assert_eq!(out.frame_count, 1.0);
        assert_eq!(out.emitter_radius, 0.0);
    }

    #[test]
    fn drops_a_curve_containing_non_finite_samples() {
        let out = normalize_particle_emitter_config(Some(&ParticleEmitterConfig {
            alpha_curve: Some(vec![1.0, f32::NAN, 0.0]),
            scale_curve: Some(vec![]),
            color_curve: Some(vec![0.0, 0.0, 0.0, 1.0, 1.0, 1.0]),
            ..Default::default()
        }));
        assert!(out.alpha_curve.is_none());
        assert!(out.scale_curve.is_none());
        assert!(out.color_curve.is_some());
    }

    #[test]
    fn keeps_region_id_max_gte_region_id_min() {
        let out = normalize_particle_emitter_config(Some(&ParticleEmitterConfig {
            region_id_min: 5.0,
            region_id_max: 2.0,
            ..Default::default()
        }));
        assert!(out.region_id_max >= out.region_id_min);
    }

    #[test]
    fn leaves_a_valid_config_materially_unchanged() {
        let input = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            spawn_rate: 25.0,
            max_particles: 500.0,
            lifetime_min: 1.0,
            lifetime_max: 2.0,
            ..Default::default()
        }));
        let out = normalize_particle_emitter_config(Some(&input));
        assert_eq!(out.spawn_rate, 25.0);
        assert_eq!(out.max_particles, 500.0);
        assert_eq!(out.lifetime_min, 1.0);
        assert_eq!(out.lifetime_max, 2.0);
    }

    #[test]
    fn replaces_non_finite_fields_with_their_defaults() {
        let out = normalize_particle_emitter_config(Some(&ParticleEmitterConfig {
            gravity_y: f32::NAN,
            spawn_rate: f32::INFINITY,
            lifetime_max: f32::NEG_INFINITY,
            ..Default::default()
        }));
        assert_eq!(out.gravity_y, 0.0);
        assert_eq!(out.spawn_rate, 10.0);
        assert!(out.lifetime_max.is_finite());
    }

    #[test]
    fn validate_flags_a_non_finite_curve_sample_as_an_error() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            alpha_curve: Some(vec![0.0, f32::NAN, 1.0]),
            ..Default::default()
        }));
        let issues = validate_particle_emitter_config(&config);
        assert!(issues
            .iter()
            .any(|i| i.field == "alpha_curve" && i.severity == "error"));
    }
}

mod validate_particle_emitter_config_tests {
    use super::*;

    #[test]
    fn flags_alpha_outside_the_0_1_range() {
        let issues = validate_particle_emitter_config(&create_particle_emitter_config(
            Some(&ParticleEmitterConfig {
                alpha_start: 2.0,
                ..Default::default()
            }),
        ));
        assert!(issues.iter().any(|i| i.field == "alpha_start"));
    }

    #[test]
    fn flags_inverted_min_max_ranges() {
        let issues = validate_particle_emitter_config(&create_particle_emitter_config(
            Some(&ParticleEmitterConfig {
                lifetime_min: 5.0,
                lifetime_max: 1.0,
                ..Default::default()
            }),
        ));
        assert!(issues.iter().any(|i| i.field == "lifetime_min"));
    }

    #[test]
    fn flags_negative_counts_rates_as_warnings() {
        let issues = validate_particle_emitter_config(&create_particle_emitter_config(
            Some(&ParticleEmitterConfig {
                spawn_rate: -5.0,
                max_particles: -1.0,
                ..Default::default()
            }),
        ));
        assert!(issues
            .iter()
            .any(|i| i.field == "spawn_rate" && i.severity == "warning"));
        assert!(issues.iter().any(|i| i.field == "max_particles"));
    }

    #[test]
    fn flags_non_finite_numeric_fields_as_errors() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            gravity_y: f32::NAN,
            spawn_rate: f32::INFINITY,
            ..Default::default()
        }));
        let issues = validate_particle_emitter_config(&config);
        let errors: Vec<&str> = issues
            .iter()
            .filter(|i| i.severity == "error")
            .map(|i| i.field.as_str())
            .collect();
        assert!(errors.contains(&"gravity_y"));
        assert!(errors.contains(&"spawn_rate"));
    }

    #[test]
    fn reports_no_issues_for_a_default_config() {
        let config = create_particle_emitter_config(None);
        let issues = validate_particle_emitter_config(&config);
        assert!(issues.is_empty());
    }
}
