use std::sync::Mutex;

pub(crate) static GUARD_TEST_LOCK: Mutex<()> = Mutex::new(());

pub(crate) fn create_test_log_state() -> flight_log::LogStateRef {
    return std::sync::Arc::new(std::sync::RwLock::new(flight_log::create_log_state()));
}

#[path = "ease_back_test.rs"]
mod flight_easing_ease_back_test;
#[path = "ease_bounce_test.rs"]
mod flight_easing_ease_bounce_test;
#[path = "ease_circular_test.rs"]
mod flight_easing_ease_circular_test;
#[path = "ease_combinators_test.rs"]
mod flight_easing_ease_combinators_test;
#[path = "ease_cubic_bezier_test.rs"]
mod flight_easing_ease_cubic_bezier_test;
#[path = "ease_cubic_test.rs"]
mod flight_easing_ease_cubic_test;
#[path = "ease_damped_sine_test.rs"]
mod flight_easing_ease_damped_sine_test;
#[path = "ease_elastic_test.rs"]
mod flight_easing_ease_elastic_test;
#[path = "ease_exponential_test.rs"]
mod flight_easing_ease_exponential_test;
#[path = "ease_linear_test.rs"]
mod flight_easing_ease_linear_test;
#[path = "ease_piecewise_test.rs"]
mod flight_easing_ease_piecewise_test;
#[path = "ease_power_test.rs"]
mod flight_easing_ease_power_test;
#[path = "ease_quadratic_test.rs"]
mod flight_easing_ease_quadratic_test;
#[path = "ease_quartic_test.rs"]
mod flight_easing_ease_quartic_test;
#[path = "ease_quintic_test.rs"]
mod flight_easing_ease_quintic_test;
#[path = "ease_sine_test.rs"]
mod flight_easing_ease_sine_test;
#[path = "ease_smoothstep_test.rs"]
mod flight_easing_ease_smoothstep_test;
#[path = "ease_steps_test.rs"]
mod flight_easing_ease_steps_test;
#[path = "easing_families_test.rs"]
mod flight_easing_easing_families_test;
#[path = "enable_easing_guards_test.rs"]
mod flight_easing_enable_easing_guards_test;
#[path = "get_easing_derivative_test.rs"]
mod flight_easing_get_easing_derivative_test;
#[path = "write_easing_samples_test.rs"]
mod flight_easing_write_easing_samples_test;
