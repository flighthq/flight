use flight_math::*;

mod is_power_of_two {
    use super::*;

    #[test]
    fn returns_true_for_powers_of_two() {
        assert!(is_power_of_two(1));
        assert!(is_power_of_two(2));
        assert!(is_power_of_two(4));
        assert!(is_power_of_two(64));
        assert!(is_power_of_two(1024));
    }

    #[test]
    fn returns_false_for_non_powers_of_two() {
        assert!(!is_power_of_two(3));
        assert!(!is_power_of_two(5));
        assert!(!is_power_of_two(100));
    }

    #[test]
    fn returns_false_for_0() {
        assert!(!is_power_of_two(0));
    }

    #[test]
    fn returns_false_for_negative_numbers() {
        assert!(!is_power_of_two(-1));
        assert!(!is_power_of_two(-4));
    }
}

mod next_multiple_of {
    use super::*;

    #[test]
    fn rounds_up_to_the_next_multiple() {
        assert_eq!(next_multiple_of(7.0, 4.0), 8.0);
    }

    #[test]
    fn leaves_an_exact_multiple_unchanged() {
        assert_eq!(next_multiple_of(8.0, 4.0), 8.0);
    }

    #[test]
    fn returns_value_when_multiple_is_0() {
        assert_eq!(next_multiple_of(7.0, 0.0), 7.0);
    }

    #[test]
    fn works_with_small_values() {
        assert_eq!(next_multiple_of(1.0, 16.0), 16.0);
        assert_eq!(next_multiple_of(0.0, 4.0), 0.0);
    }
}

mod next_power_of_two {
    use super::*;

    #[test]
    fn returns_1_for_0() {
        assert_eq!(next_power_of_two(0), 1);
    }

    #[test]
    fn returns_1_for_1() {
        assert_eq!(next_power_of_two(1), 1);
    }

    #[test]
    fn returns_an_exact_power_of_two_unchanged() {
        assert_eq!(next_power_of_two(2), 2);
        assert_eq!(next_power_of_two(64), 64);
        assert_eq!(next_power_of_two(128), 128);
        assert_eq!(next_power_of_two(1024), 1024);
    }

    #[test]
    fn rounds_up_to_the_next_power_of_two() {
        assert_eq!(next_power_of_two(3), 4);
        assert_eq!(next_power_of_two(5), 8);
        assert_eq!(next_power_of_two(100), 128);
        assert_eq!(next_power_of_two(129), 256);
        assert_eq!(next_power_of_two(1000), 1024);
    }

    #[test]
    fn handles_negative_numbers() {
        assert_eq!(next_power_of_two(-1), 1);
    }
}

mod previous_power_of_two {
    use super::*;

    #[test]
    fn returns_1_for_1() {
        assert_eq!(previous_power_of_two(1), 1);
    }

    #[test]
    fn returns_1_for_values_less_than_or_equal_to_1() {
        assert_eq!(previous_power_of_two(0), 1);
        assert_eq!(previous_power_of_two(-1), 1);
    }

    #[test]
    fn returns_an_exact_power_of_two_unchanged() {
        assert_eq!(previous_power_of_two(4), 4);
        assert_eq!(previous_power_of_two(64), 64);
    }

    #[test]
    fn rounds_down_to_the_previous_power_of_two() {
        assert_eq!(previous_power_of_two(6), 4);
        assert_eq!(previous_power_of_two(100), 64);
        assert_eq!(previous_power_of_two(200), 128);
        assert_eq!(previous_power_of_two(1025), 1024);
    }

    #[test]
    fn returns_a_positive_power_of_two_at_and_above_2_pow_30() {
        assert_eq!(previous_power_of_two(1073741824), 1073741824);
        assert_eq!(previous_power_of_two(2147483647), 1073741824);
        assert_eq!(next_power_of_two(1073741824), 1073741824);
    }
}
