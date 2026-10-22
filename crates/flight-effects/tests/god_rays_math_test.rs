use super::*;

mod compute_god_rays_accumulation_scale {
    use super::*;

    #[test]
    fn is_finite_and_positive_for_default_parameters() {
        let effect = create_god_rays_effect();
        let scale = compute_god_rays_accumulation_scale(&effect.read().unwrap());
        assert!(scale.is_finite() && scale > 0.0);
    }

    #[test]
    fn is_the_inverse_of_samples_weight_and_exposure() {
        let effect = create_god_rays_effect();
        let mut guard = effect.write().unwrap();
        guard.samples = Some(50.0);
        guard.weight = Some(0.5);
        guard.exposure = Some(0.2);
        drop(guard);
        // D1 f32 bound (TS: 6 decimal digits).
        assert_close(
            compute_god_rays_accumulation_scale(&effect.read().unwrap()),
            1.0 / (50.0 * 0.5 * 0.2),
            5e-7,
        );
    }
}

mod compute_god_rays_light_center {
    use super::*;

    #[test]
    fn clamps_to_zero_to_one() {
        let effect = create_god_rays_effect();
        effect.write().unwrap().center_x = Some(-1.0);
        effect.write().unwrap().center_y = Some(2.0);
        let mut out = [0.0; 2];
        compute_god_rays_light_center(&mut out, &effect.read().unwrap());
        assert_eq!(out, [0.0, 1.0]);
    }

    #[test]
    fn defaults_to_the_center() {
        let effect = create_god_rays_effect();
        let mut out = [0.0; 2];
        compute_god_rays_light_center(&mut out, &effect.read().unwrap());
        assert_eq!(out, [0.5, 0.5]);
    }
}

mod compute_god_rays_sample_weight {
    use super::*;

    #[test]
    fn decreases_with_sample_index_due_to_decay() {
        let effect = create_god_rays_effect();
        let mut guard = effect.write().unwrap();
        guard.decay = Some(0.9);
        guard.weight = Some(1.0);
        guard.exposure = Some(1.0);
        drop(guard);
        assert!(
            compute_god_rays_sample_weight(&effect.read().unwrap(), 0.0)
                > compute_god_rays_sample_weight(&effect.read().unwrap(), 5.0)
        );
    }

    #[test]
    fn sample_zero_equals_weight_times_exposure() {
        let effect = create_god_rays_effect();
        let mut guard = effect.write().unwrap();
        guard.decay = Some(0.96);
        guard.weight = Some(0.4);
        guard.exposure = Some(0.1);
        drop(guard);
        // D1 f32 bound (TS: 6 decimal digits).
        assert_close(
            compute_god_rays_sample_weight(&effect.read().unwrap(), 0.0),
            0.4 * 0.1,
            5e-7,
        );
    }
}

mod compute_god_rays_step_size {
    use super::*;

    #[test]
    fn returns_zero_step_at_the_light_center() {
        let effect = create_god_rays_effect();
        effect.write().unwrap().center_x = Some(0.5);
        effect.write().unwrap().center_y = Some(0.5);
        let mut out = [1.0; 2];
        compute_god_rays_step_size(&mut out, &effect.read().unwrap(), 0.5, 0.5);
        for value in out {
            // D1 f32 bound (TS: 6 decimal digits).
            assert_close(value, 0.0, 5e-7);
        }
    }

    #[test]
    fn step_direction_points_toward_the_light_center() {
        let effect = create_god_rays_effect();
        let mut guard = effect.write().unwrap();
        guard.center_x = Some(0.5);
        guard.center_y = Some(0.5);
        guard.density = Some(1.0);
        guard.samples = Some(10.0);
        drop(guard);
        let mut out = [0.0; 2];
        compute_god_rays_step_size(&mut out, &effect.read().unwrap(), 0.0, 0.0);
        assert!(out[0] > 0.0 && out[1] > 0.0);
    }
}
