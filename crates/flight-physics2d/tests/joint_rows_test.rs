use flight_physics2d::*;

// flight-lint: allow(f64) D1: the independent reference derivation runs in f64, as the source does
const TAU: f64 = 2.0 * std::f64::consts::PI;

// What a correct derivation must produce, written independently of the implementation from the two
// definitions it is built on: critical damping is `2 * m * zeta * omega`, spring rate is `m * omega^2`.
// flight-lint: allow(f64) D1: the independent reference derivation runs in f64, as the source does
fn expected_soft_row(mass: f64, frequency_hz: f64, damping_ratio: f64, dt: f64) -> [f64; 3] {
    let omega = TAU * frequency_hz;
    let damping = 2.0 * mass * damping_ratio * omega;
    let stiffness = mass * omega * omega;
    let gamma = 1.0 / (dt * (damping + dt * stiffness));
    return [1.0 / (1.0 / mass + gamma), dt * stiffness * gamma, gamma];
}

// f32: the source compares 12 digits of an f64 derivation; the f32 row agrees to f32 precision, so
// closeness is relative at 1e-5 (measured worst case 6.3e-8).
// flight-lint: allow(f64) D1: compares the f32 row against the f64 reference
fn close(actual: f32, expected: f64) -> bool {
    return ((actual as f64) - expected).abs() <= 1e-5 * expected.abs().max(1.0);
}

mod write_physics2d_soft_row_parameters {
    use super::*;

    #[test]
    fn matches_the_stiffness_and_damping_derivation_it_stands_for() {
        let mut out = [0.0; 3];
        write_physics2d_soft_row_parameters(&mut out, 2.5, 3.0, 0.4, 1.0 / 120.0, 0.0);
        let expected = expected_soft_row(2.5, 3.0, 0.4, 1.0 / 120.0);
        assert!(close(out[0], expected[0]), "{} vs {}", out[0], expected[0]);
        assert!(close(out[1], expected[1]), "{} vs {}", out[1], expected[1]);
        assert!(close(out[2], expected[2]), "{} vs {}", out[2], expected[2]);
    }

    #[test]
    fn overwrites_every_slot_of_a_reused_out_array() {
        let mut out = [0.0; 3];
        write_physics2d_soft_row_parameters(&mut out, 3.0, 4.0, 0.6, 1.0 / 60.0, 0.0);
        let soft = out;
        write_physics2d_soft_row_parameters(&mut out, 3.0, 0.0, 0.6, 1.0 / 60.0, 11.0);
        assert_eq!(out, [3.0, 11.0, 0.0]);
        assert!(soft[2] > 0.0);
    }

    #[test]
    fn produces_a_bias_factor_that_does_not_depend_on_the_mass_being_moved() {
        let mut light = [0.0; 3];
        let mut heavy = [0.0; 3];
        write_physics2d_soft_row_parameters(&mut light, 0.25, 2.0, 0.3, 1.0 / 60.0, 0.0);
        write_physics2d_soft_row_parameters(&mut heavy, 400.0, 2.0, 0.3, 1.0 / 60.0, 0.0);
        assert!(
            close(light[1], heavy[1] as f64),
            "{} vs {}",
            light[1],
            heavy[1]
        );

        let omega = TAU * 2.0;
        let closed = (omega * omega) / (2.0 * 0.3 * omega + (omega * omega) / 60.0);
        assert!(close(light[1], closed), "{} vs {}", light[1], closed);
    }

    #[test]
    fn returns_the_hard_parameters_unchanged_for_a_negative_or_nan_frequency() {
        let mut out = [9.0; 3];
        write_physics2d_soft_row_parameters(&mut out, 4.0, -3.0, 0.7, 1.0 / 60.0, 12.0);
        assert_eq!(out, [4.0, 12.0, 0.0]);
        write_physics2d_soft_row_parameters(&mut out, 4.0, f32::NAN, 0.7, 1.0 / 60.0, 12.0);
        assert_eq!(out, [4.0, 12.0, 0.0]);
    }

    #[test]
    fn returns_the_hard_parameters_unchanged_for_a_non_positive_timestep() {
        let mut out = [9.0; 3];
        write_physics2d_soft_row_parameters(&mut out, 4.0, 2.0, 0.7, 0.0, 12.0);
        assert_eq!(out, [4.0, 12.0, 0.0]);
    }

    #[test]
    fn returns_the_hard_parameters_unchanged_when_no_frequency_was_authored() {
        let mut out = [9.0; 3];
        write_physics2d_soft_row_parameters(&mut out, 4.0, 0.0, 0.7, 1.0 / 60.0, 12.0);
        assert_eq!(out, [4.0, 12.0, 0.0]);
    }

    #[test]
    fn scales_gamma_and_the_softened_mass_with_the_mass_which_the_bias_factor_hides() {
        let mut light = [0.0; 3];
        let mut heavy = [0.0; 3];
        write_physics2d_soft_row_parameters(&mut light, 1.0, 2.0, 0.3, 1.0 / 60.0, 0.0);
        write_physics2d_soft_row_parameters(&mut heavy, 4.0, 2.0, 0.3, 1.0 / 60.0, 0.0);
        assert!(
            close(heavy[2], (light[2] / 4.0) as f64),
            "{} vs {}",
            heavy[2],
            light[2] / 4.0
        );
        assert!(heavy[0] > light[0]);
    }

    #[test]
    fn softens_rather_than_stiffens_since_compliance_adds_to_the_inverse_mass() {
        let mut out = [0.0; 3];
        write_physics2d_soft_row_parameters(&mut out, 5.0, 1.5, 0.5, 1.0 / 60.0, 0.0);
        assert!(out[0] > 0.0);
        assert!(out[0] < 5.0);
        assert!(out[2] > 0.0);
    }

    #[test]
    fn yields_a_fully_compliant_row_for_a_massless_constraint_instead_of_dividing_by_zero() {
        let mut out = [9.0; 3];
        write_physics2d_soft_row_parameters(&mut out, 0.0, 2.0, 0.3, 1.0 / 60.0, 7.0);
        assert_eq!(out, [0.0, 0.0, 0.0]);
    }
}
