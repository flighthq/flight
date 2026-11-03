use flight_interaction::register_default_hit_tests::*;

mod register_default_hit_tests {
    use super::*;

    #[test]
    fn does_not_panic() {
        let mut ctx = flight_interaction::hit_tests::create_hit_test_context();
        register_default_hit_tests(&mut ctx);
    }
}
