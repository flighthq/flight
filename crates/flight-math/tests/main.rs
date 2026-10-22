fn assert_range_error(action: impl FnOnce(), message: &str) {
    let payload = std::panic::catch_unwind(std::panic::AssertUnwindSafe(action))
        .expect_err("expected a typed RangeError");
    let error = payload
        .downcast::<flight_entity::FlightError>()
        .expect("expected FlightError panic payload");
    assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);
    assert_eq!(error.message, message);
}

fn sequence_random(values: &[f32]) -> impl Fn() -> f32 + '_ {
    let index = std::cell::Cell::new(0);
    return move || {
        let next = index.get();
        assert!(next < values.len(), "sequenceRandom exhausted");
        index.set(next + 1);
        return values[next];
    };
}

#[path = "angle_test.rs"]
mod flight_math_angle_test;
#[path = "clamp_test.rs"]
mod flight_math_clamp_test;
#[path = "comparison_test.rs"]
mod flight_math_comparison_test;
#[path = "constants_test.rs"]
mod flight_math_constants_test;
#[path = "hash_test.rs"]
mod flight_math_hash_test;
#[path = "interpolation_advanced_test.rs"]
mod flight_math_interpolation_advanced_test;
#[path = "interpolation_test.rs"]
mod flight_math_interpolation_test;
#[path = "next_power_of_two_test.rs"]
mod flight_math_next_power_of_two_test;
#[path = "number_theory_test.rs"]
mod flight_math_number_theory_test;
#[path = "random_distributions_test.rs"]
mod flight_math_random_distributions_test;
#[path = "random_range_test.rs"]
mod flight_math_random_range_test;
#[path = "random_test.rs"]
mod flight_math_random_test;
#[path = "rounding_test.rs"]
mod flight_math_rounding_test;
#[path = "scalar_test.rs"]
mod flight_math_scalar_test;
#[path = "statistics_test.rs"]
mod flight_math_statistics_test;
