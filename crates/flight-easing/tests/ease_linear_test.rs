use flight_easing::*;

mod ease_linear {
    use super::*;

    #[test]
    fn returns_0_at_t_0() {
        assert_eq!(ease_linear(0.0), 0.0);
    }

    #[test]
    fn returns_1_at_t_1() {
        assert_eq!(ease_linear(1.0), 1.0);
    }

    #[test]
    fn returns_t_unchanged() {
        assert_eq!(ease_linear(0.5), 0.5);
        assert_eq!(ease_linear(0.25), 0.25);
        assert_eq!(ease_linear(0.75), 0.75);
    }
}
