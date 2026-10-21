mod angle_test;
mod clamp_test;
mod comparison_test;
mod constants_test;
mod hash_test;
mod interpolation_advanced_test;
mod interpolation_test;
mod next_power_of_two_test;
mod number_theory_test;
mod random_distributions_test;
mod random_range_test;
mod random_test;
mod rounding_test;
mod scalar_test;
mod statistics_test;

fn assert_range_error(action: impl FnOnce(), message: &str) {
    let payload = std::panic::catch_unwind(std::panic::AssertUnwindSafe(action))
        .expect_err("expected a typed RangeError");
    let error = payload
        .downcast::<flight_entity::FlightError>()
        .expect("expected FlightError panic payload");
    assert_eq!(error.kind, flight_entity::FlightErrorKind::RangeError);
    assert_eq!(error.message, message);
}
