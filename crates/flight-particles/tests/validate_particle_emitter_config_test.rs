use flight_particles::*;

mod normalize_particle_emitter_config {
    use super::*;

    #[test]
    fn clamps_negatives_and_floors_integer_fields() {
        let out = normalize_particle_emitter_config(Some(&ParticleEmitterConfig {
            max_particles: -3.0,
            spawn_rate: -10.0,
            burst_count: 4.7,
            frame_count: 0.0,
            emitter_radius: -50.0,
            alpha_curve: None,
            alpha_end: 0.0,
            alpha_start: 1.0,
            blend_mode: None,
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
            emitter_shape: EmitterShape::Point,
            emitter_width: 0.0,
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
            alpha_end: 0.0,
            alpha_start: 1.0,
            blend_mode: None,
            burst_count: 0.0,
            burst_interval: 0.0,
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
            max_particles: 1000.0,
            region_id_max: 1.0,
            region_id_min: 0.0,
            rotation_speed_max: 0.0,
            rotation_speed_min: 0.0,
            scale_end: 1.0,
            scale_max: 1.0,
            scale_min: 1.0,
            spawn_rate: 10.0,
            speed_max: 100.0,
            speed_min: 50.0,
            spread: std::f32::consts::PI,
            velocity_inheritance: 0.0,
            world_space: false,
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
            max_particles: 1000.0,
            rotation_speed_max: 0.0,
            rotation_speed_min: 0.0,
            scale_curve: None,
            scale_end: 1.0,
            scale_max: 1.0,
            scale_min: 1.0,
            spawn_rate: 10.0,
            speed_max: 100.0,
            speed_min: 50.0,
            spread: std::f32::consts::PI,
            velocity_inheritance: 0.0,
            world_space: false,
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
            gravity_z: 0.0,
            lifetime_min: 0.5,
            looping: true,
            max_particles: 1000.0,
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
        assert_eq!(out.gravity_y, 0.0);
        assert_eq!(out.spawn_rate, 10.0);
        assert!(out.lifetime_max.is_finite());
    }

    #[test]
    fn validate_flags_a_non_finite_curve_sample_as_an_error() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            alpha_curve: Some(vec![0.0, f32::NAN, 1.0]),
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
            max_particles: 1000.0,
            region_id_max: 1.0,
            region_id_min: 0.0,
            rotation_speed_max: 0.0,
            rotation_speed_min: 0.0,
            scale_curve: None,
            scale_end: 1.0,
            scale_max: 1.0,
            scale_min: 1.0,
            spawn_rate: 10.0,
            speed_max: 100.0,
            speed_min: 50.0,
            spread: std::f32::consts::PI,
            velocity_inheritance: 0.0,
            world_space: false,
        }));
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &config);
        assert!(issues
            .iter()
            .any(|i| i.field == "alpha_curve" && i.severity == "error"));
    }
}

mod validate_particle_emitter_config {
    use super::*;

    #[test]
    fn flags_alpha_outside_the_0_1_range() {
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &create_particle_emitter_config(
            Some(&ParticleEmitterConfig {
                alpha_start: 2.0,
                alpha_curve: None,
                alpha_end: 0.0,
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
                max_particles: 1000.0,
                region_id_max: 1.0,
                region_id_min: 0.0,
                rotation_speed_max: 0.0,
                rotation_speed_min: 0.0,
                scale_curve: None,
                scale_end: 1.0,
                scale_max: 1.0,
                scale_min: 1.0,
                spawn_rate: 10.0,
                speed_max: 100.0,
                speed_min: 50.0,
                spread: std::f32::consts::PI,
                velocity_inheritance: 0.0,
                world_space: false,
            }),
        ));
        assert!(issues.iter().any(|i| i.field == "alpha_start"));
    }

    #[test]
    fn flags_inverted_min_max_ranges() {
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &create_particle_emitter_config(
            Some(&ParticleEmitterConfig {
                lifetime_min: 5.0,
                lifetime_max: 1.0,
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
                looping: true,
                max_particles: 1000.0,
                region_id_max: 1.0,
                region_id_min: 0.0,
                rotation_speed_max: 0.0,
                rotation_speed_min: 0.0,
                scale_curve: None,
                scale_end: 1.0,
                scale_max: 1.0,
                scale_min: 1.0,
                spawn_rate: 10.0,
                speed_max: 100.0,
                speed_min: 50.0,
                spread: std::f32::consts::PI,
                velocity_inheritance: 0.0,
                world_space: false,
            }),
        ));
        assert!(issues.iter().any(|i| i.field == "lifetime_min"));
    }

    #[test]
    fn flags_negative_counts_rates_as_warnings() {
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &create_particle_emitter_config(
            Some(&ParticleEmitterConfig {
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
            gravity_z: 0.0,
            lifetime_max: 1.0,
            lifetime_min: 0.5,
            looping: true,
            max_particles: 1000.0,
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
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &config);
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
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &config);
        assert!(issues.is_empty());
    }

    #[test]
    fn clears_prefilled_sentinel_issues_before_validating() {
        let config = create_particle_emitter_config(None);
        let mut issues = vec![
            ParticleConfigIssue {
                field: "sentinel".to_string(),
                message: "leftover from previous call".to_string(),
                severity: "error".to_string(),
            },
        ];
        validate_particle_emitter_config(&mut issues, &config);
        assert!(issues.is_empty());
        assert!(!issues.iter().any(|i| i.field == "sentinel"));
    }

    #[test]
    fn repeated_invalid_call_does_not_duplicate_issues() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            gravity_y: f32::NAN,
            spawn_rate: -5.0,
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
            gravity_z: 0.0,
            lifetime_max: 1.0,
            lifetime_min: 0.5,
            looping: true,
            max_particles: 1000.0,
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
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &config);
        let first_count = issues.len();
        assert!(first_count > 0);
        validate_particle_emitter_config(&mut issues, &config);
        assert_eq!(issues.len(), first_count);
    }

    #[test]
    fn invalid_then_valid_clears_previous_issues() {
        let invalid = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            gravity_y: f32::NAN,
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
            gravity_z: 0.0,
            lifetime_max: 1.0,
            lifetime_min: 0.5,
            looping: true,
            max_particles: 1000.0,
            region_id_max: 1.0,
            region_id_min: 0.0,
            rotation_speed_max: 0.0,
            rotation_speed_min: 0.0,
            scale_curve: None,
            scale_end: 1.0,
            scale_max: 1.0,
            scale_min: 1.0,
            spawn_rate: 10.0,
            speed_max: 100.0,
            speed_min: 50.0,
            spread: std::f32::consts::PI,
            velocity_inheritance: 0.0,
            world_space: false,
        }));
        let valid = create_particle_emitter_config(None);
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &invalid);
        assert!(!issues.is_empty());
        validate_particle_emitter_config(&mut issues, &valid);
        assert!(issues.is_empty());
    }

    #[test]
    fn multiple_issues_appear_in_source_order() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            alpha_start: 2.0,
            lifetime_min: 5.0,
            lifetime_max: 1.0,
            spawn_rate: -5.0,
            alpha_curve: None,
            alpha_end: 0.0,
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
            looping: true,
            max_particles: 1000.0,
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
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &config);
        assert!(issues.len() >= 3);
        let fields: Vec<&str> = issues.iter().map(|i| i.field.as_str()).collect();
        let spawn_idx = fields.iter().position(|f| *f == "spawn_rate").unwrap();
        let lifetime_idx = fields.iter().position(|f| *f == "lifetime_min").unwrap();
        let alpha_idx = fields.iter().position(|f| *f == "alpha_start").unwrap();
        assert!(spawn_idx < lifetime_idx);
        assert!(lifetime_idx < alpha_idx);
    }

    #[test]
    fn retains_vec_capacity_after_clear() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            gravity_y: f32::NAN,
            spawn_rate: f32::INFINITY,
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
            gravity_z: 0.0,
            lifetime_max: 1.0,
            lifetime_min: 0.5,
            looping: true,
            max_particles: 1000.0,
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
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &config);
        let cap_after_first = issues.capacity();
        assert!(cap_after_first > 0);
        let valid = create_particle_emitter_config(None);
        validate_particle_emitter_config(&mut issues, &valid);
        assert!(issues.is_empty());
        assert!(issues.capacity() >= cap_after_first);
    }

    #[test]
    fn does_not_mutate_the_input_config() {
        let config = create_particle_emitter_config(Some(&ParticleEmitterConfig {
            gravity_y: f32::NAN,
            spawn_rate: -5.0,
            alpha_start: 2.0,
            alpha_curve: None,
            alpha_end: 0.0,
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
            gravity_z: 0.0,
            lifetime_max: 1.0,
            lifetime_min: 0.5,
            looping: true,
            max_particles: 1000.0,
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
        let spawn_before = config.spawn_rate;
        let alpha_before = config.alpha_start;
        let mut issues = Vec::new();
        validate_particle_emitter_config(&mut issues, &config);
        assert_eq!(config.spawn_rate, spawn_before);
        assert_eq!(config.alpha_start, alpha_before);
        assert!(config.gravity_y.is_nan());
    }
}
