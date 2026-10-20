use flight_easing::*;

mod ease_in_elastic {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_eq!(ease_in_elastic(0.0), 0.0);
        assert_eq!(ease_in_elastic(1.0), 1.0);
    }

    #[test]
    fn oscillates_below_0_before_reaching_target() {
        assert!(ease_in_elastic(0.8) < 0.0);
    }
}

mod ease_in_out_elastic {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_eq!(ease_in_out_elastic(0.0), 0.0);
        assert_eq!(ease_in_out_elastic(1.0), 1.0);
    }
}

mod ease_out_elastic {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_eq!(ease_out_elastic(0.0), 0.0);
        assert_eq!(ease_out_elastic(1.0), 1.0);
    }

    #[test]
    fn oscillates_past_1_near_the_end() {
        assert!(ease_out_elastic(0.6) > 1.0);
    }
}
