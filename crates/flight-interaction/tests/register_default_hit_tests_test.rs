use flight_interaction::hit_tests::HitTestContext;
use flight_interaction::register_default_hit_tests::*;

mod register_default_hit_tests {
    use super::*;

    #[test]
    fn does_not_panic() {
        let mut ctx = HitTestContext::new();
        register_default_hit_tests(&mut ctx);
    }
}
