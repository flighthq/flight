//! flight-compiler: target-native

use flight_interaction::contract::*;

mod register_default_hit_tests {
    use super::*;

    #[test]
    fn does_not_panic() {
        let mut ctx = flight_interaction::contract::create_hit_test_context();
        register_default_hit_tests(&mut ctx);
    }
}
