use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use flight_math::*;
use flight_particles::contract::*;

// D1 f32 bound (TS: toBeCloseTo(x, 5) → 5e-6)
fn d1_bound_5(expected: f32) -> f32 {
    return 5e-6f32.max(4.0 * f32::EPSILON * 1.0f32.max(expected.abs()));
}

fn sequence_rng(values: &[f32]) -> RandomSource {
    let data: Vec<f32> = values.to_vec();
    let index = Arc::new(AtomicUsize::new(0));
    return Arc::new(move || {
        let i = index.fetch_add(1, Ordering::Relaxed);
        return data[i % data.len()];
    });
}

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
            },
            rng.as_ref(),
        );
        assert!((out[0] - expected_cx).abs() <= d1_bound_5(expected_cx)); // D1 f32 bound (TS: toBeCloseTo(x, 5))
        assert!((out[1] - expected_cy).abs() <= d1_bound_5(expected_cy)); // D1 f32 bound (TS: toBeCloseTo(x, 5))

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
                emitter_radius: 0.0,
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
            },
            rng.as_ref(),
        );
        assert!((out[0] - expected_rx).abs() <= d1_bound_5(expected_rx)); // D1 f32 bound (TS: toBeCloseTo(x, 5))
        assert!((out[1] - expected_ry).abs() <= d1_bound_5(expected_ry)); // D1 f32 bound (TS: toBeCloseTo(x, 5))
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
            },
            rng.as_ref(),
        );
        assert!((out[0] - expected_x).abs() <= d1_bound_5(expected_x)); // D1 f32 bound (TS: toBeCloseTo(x, 5))
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
            },
            rng.as_ref(),
        );
        assert!((out[0] - expected_x).abs() <= d1_bound_5(expected_x)); // D1 f32 bound (TS: toBeCloseTo(x, 5))
        assert!((out[1] - expected_y).abs() <= d1_bound_5(expected_y)); // D1 f32 bound (TS: toBeCloseTo(x, 5))
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
            },
            rng.as_ref(),
        );
        assert_eq!(out, [0.0, 0.0]);
        assert_eq!(rng(), expected); // no random calls
    }

    #[test]
    fn line_boundary_left_with_controlled_rng() {
        let rng = sequence_rng(&[0.0]);
        let mut out = [f32::NAN, f32::NAN];
        write_particle_spawn_offset(
            &mut out,
            0,
            &ParticleEmitterConfig {
                emitter_shape: EmitterShape::Line,
                emitter_width: 40.0,
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
            },
            rng.as_ref(),
        );
        assert_eq!(out[0], -20.0);
        assert_eq!(out[1], 0.0);
    }

    #[test]
    fn circle_boundary_with_controlled_rng() {
        let rng = sequence_rng(&[1.0, 0.0]);
        let mut out = [f32::NAN, f32::NAN];
        write_particle_spawn_offset(
            &mut out,
            0,
            &ParticleEmitterConfig {
                emitter_shape: EmitterShape::Circle,
                emitter_radius: 10.0,
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
            },
            rng.as_ref(),
        );
        assert_eq!(out[0], 10.0);
        assert_eq!(out[1], 0.0);
    }
}
