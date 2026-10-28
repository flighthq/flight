//! flight-compiler: target-native

use flight_spring::contract::*;

fn assert_accumulated_close(actual: f32, expected: f32, digits: i32, evaluations: usize) {
    let diff = (actual - expected).abs();
    let ts_bound = 0.5 * 10.0_f32.powi(-digits);
    let limit = ts_bound.max(evaluations as f32 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        diff <= limit,
        "expected {expected}, got {actual} (diff: {diff}, limit: {limit})"
    );
}

mod update_spring {
    use super::*;

    #[test]
    fn preserves_oscillation_energy_when_damping_ratio_is_exactly_zero() {
        let frequency: f32 = 2.0;
        let target: f32 = 3.0;
        let mut spring = create_spring(7.0, -4.0);
        let config = create_spring_config(frequency, 0.0);
        let omega = std::f32::consts::TAU * frequency;
        let initial_energy = spring.velocity * spring.velocity
            + omega * omega * (spring.value - target) * (spring.value - target);

        for _ in 0..600 {
            update_spring(&mut spring, target, &config, 1.0 / 60.0);
        }

        let final_energy = spring.velocity * spring.velocity
            + omega * omega * (spring.value - target) * (spring.value - target);
        // D1 f32 bound (TS: 5e-9)
        assert_accumulated_close(final_energy, initial_energy, 8, 300);
    }

    #[test]
    fn is_frame_rate_independent_for_a_constant_target_in_velocity() {
        let config = create_spring_config(2.0, 0.5);
        let target: f32 = 7.0;

        let mut fine = create_spring(0.0, 3.0);
        for _ in 0..60 {
            update_spring(&mut fine, target, &config, 1.0 / 60.0);
        }

        let mut coarse = create_spring(0.0, 3.0);
        update_spring(&mut coarse, target, &config, 1.0);

        // D1 f32 bound (TS: 5e-7)
        assert_accumulated_close(fine.velocity, coarse.velocity, 6, 8);
    }
}
