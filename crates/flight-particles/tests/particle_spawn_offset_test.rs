use flight_math::*;
use flight_particles::*;

mod write_particle_spawn_offset {
    use super::*;

    #[test]
    fn samples_circle_area_and_rectangle_bounds() {
        // Use a known seed and precompute expected values from the random sequence.
        let seed = 42u32;

        // -- Circle pass --
        let rng_check = create_random_source(seed);
        let r0 = rng_check(); // radius sample
        let r1 = rng_check(); // angle sample
        let two_pi = std::f32::consts::PI * 2.0;
        let radius = r0.sqrt() * 10.0;
        let angle = r1 * two_pi;
        let expected_cx = angle.cos() * radius;
        let expected_cy = angle.sin() * radius;

        let rng = create_random_source(seed);
        let mut out = [f32::NAN, f32::NAN];
        write_particle_spawn_offset(
            &mut out,
            0,
            &ParticleEmitterConfig {
                emitter_radius: 10.0,
                emitter_shape: EmitterShape::Circle,
                ..Default::default()
            },
            rng.as_ref(),
        );
        assert!((out[0] - expected_cx).abs() < 1e-5);
        assert!((out[1] - expected_cy).abs() < 1e-5);

        // -- Rectangle pass (continues the same rng sequence) --
        let r2 = rng_check(); // x sample
        let r3 = rng_check(); // y sample
        let expected_rx = (r2 - 0.5) * 20.0;
        let expected_ry = (r3 - 0.5) * 10.0;

        write_particle_spawn_offset(
            &mut out,
            0,
            &ParticleEmitterConfig {
                emitter_height: 10.0,
                emitter_shape: EmitterShape::Rect,
                emitter_width: 20.0,
                ..Default::default()
            },
            rng.as_ref(),
        );
        assert!((out[0] - expected_rx).abs() < 1e-5);
        assert!((out[1] - expected_ry).abs() < 1e-5);
    }

    #[test]
    fn samples_the_line_using_random_offset() {
        let seed = 99u32;
        let rng_check = create_random_source(seed);
        let r = rng_check();
        let expected_x = (r - 0.5) * 20.0;

        let rng = create_random_source(seed);
        let mut out = [f32::NAN, f32::NAN];
        write_particle_spawn_offset(
            &mut out,
            0,
            &ParticleEmitterConfig {
                emitter_shape: EmitterShape::Line,
                emitter_width: 20.0,
                ..Default::default()
            },
            rng.as_ref(),
        );
        assert!((out[0] - expected_x).abs() < 1e-5);
        assert_eq!(out[1], 0.0);
    }

    #[test]
    fn samples_the_ring_circumference() {
        let seed = 77u32;
        let rng_check = create_random_source(seed);
        let r = rng_check();
        let two_pi = std::f32::consts::PI * 2.0;
        let angle = r * two_pi;
        let expected_x = angle.cos() * 10.0;
        let expected_y = angle.sin() * 10.0;

        let rng = create_random_source(seed);
        let mut out = [f32::NAN, f32::NAN];
        write_particle_spawn_offset(
            &mut out,
            0,
            &ParticleEmitterConfig {
                emitter_radius: 10.0,
                emitter_shape: EmitterShape::Ring,
                ..Default::default()
            },
            rng.as_ref(),
        );
        assert!((out[0] - expected_x).abs() < 1e-5);
        assert!((out[1] - expected_y).abs() < 1e-5);
    }

    #[test]
    fn writes_origin_for_degenerate_line_without_drawing_randomness() {
        let rng = create_random_source(42);
        let expected = create_random_source(42)();
        let mut out = [f32::NAN, f32::NAN];
        write_particle_spawn_offset(
            &mut out,
            0,
            &ParticleEmitterConfig {
                emitter_shape: EmitterShape::Line,
                emitter_width: 0.0,
                ..Default::default()
            },
            rng.as_ref(),
        );
        assert_eq!(out, [0.0, 0.0]);
        assert_eq!(rng(), expected); // no random calls
    }

    #[test]
    fn writes_origin_for_degenerate_ring_without_drawing_randomness() {
        let rng = create_random_source(42);
        let expected = create_random_source(42)();
        let mut out = [f32::NAN, f32::NAN];
        write_particle_spawn_offset(
            &mut out,
            0,
            &ParticleEmitterConfig {
                emitter_shape: EmitterShape::Ring,
                emitter_radius: 0.0,
                ..Default::default()
            },
            rng.as_ref(),
        );
        assert_eq!(out, [0.0, 0.0]);
        assert_eq!(rng(), expected); // no random calls
    }
}
