//! flight-compiler: rust-only

// Spring value, velocity, target and delta_time are f64: at 1e9 the single-precision spacing is 64,
// so a millimetre offset from a large target only settles because nothing narrows.

use flight_spring::contract::*;

#[test]
fn settles_onto_a_millimetre_offset_from_one_billion() {
    let config = create_spring_config(2.0, 1.0);
    let target = 1e9 + 1e-3;
    let mut spring = create_spring(1e9, 0.0);
    for _ in 0..600 {
        update_spring(&mut spring, target, &config, 1.0 / 60.0);
    }
    assert!(
        (spring.value - target).abs() < 1e-6,
        "value {}",
        spring.value
    );
    assert!(spring.value > 1e9);
}

#[test]
fn propagates_large_components_through_spring3d() {
    let config = create_spring_config(2.0, 1.0);
    let mut spring = create_spring3d(1e9, -1e9, 5e8, 0.0, 0.0, 0.0);
    for _ in 0..600 {
        update_spring3d(
            &mut spring,
            1e9 + 2e-3,
            -1e9 - 2e-3,
            5e8,
            &config,
            1.0 / 60.0,
        );
    }
    assert!((spring.x.value - (1e9 + 2e-3)).abs() < 1e-6);
    assert!((spring.y.value - (-1e9 - 2e-3)).abs() < 1e-6);
    assert_eq!(spring.z.value, 5e8);
}

#[test]
fn accumulates_small_time_steps_without_single_precision_drift() {
    let config = create_spring_config(0.5, 0.5);
    let mut fine = create_spring(0.0, 1.0);
    for _ in 0..36_000 {
        update_spring(&mut fine, 10.0, &config, 1.0 / 3_600.0);
    }
    let mut coarse = create_spring(0.0, 1.0);
    update_spring(&mut coarse, 10.0, &config, 10.0);
    assert!(
        (fine.value - coarse.value).abs() < 1e-9,
        "{} vs {}",
        fine.value,
        coarse.value
    );
}
