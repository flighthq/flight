use flight_math::*;

mod random_bool {
    use super::*;

    #[test]
    fn returns_only_booleans() {
        let mut random = create_random_source(0xabcdef);
        for _ in 0..100 {
            let _v: bool = random_bool(&mut random, None);
        }
    }

    #[test]
    fn returns_true_with_probability_1() {
        let mut random = create_random_source(0xabcdef);
        for _ in 0..10 {
            assert!(random_bool(&mut random, Some(1.0)));
        }
    }

    #[test]
    fn returns_false_with_probability_0() {
        let mut random = create_random_source(0xabcdef);
        for _ in 0..10 {
            assert!(!random_bool(&mut random, Some(0.0)));
        }
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = create_random_source(0xabcdef);
        let mut b = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(random_bool(&mut a, None), random_bool(&mut b, None));
        }
    }
}

mod random_int {
    use super::*;

    #[test]
    fn returns_integers_within_min_max() {
        let mut random = create_random_source(0xabcdef);
        for _ in 0..200 {
            let v = random_int(&mut random, 0, 9);
            assert!(v >= 0);
            assert!(v <= 9);
        }
    }

    #[test]
    fn returns_min_when_min_equals_max() {
        let mut random = create_random_source(0xabcdef);
        assert_eq!(random_int(&mut random, 5, 5), 5);
    }

    #[test]
    fn throws_when_min_greater_than_max() {
        crate::assert_range_error(
            || {
                let mut random = create_random_source(0xabcdef);
                random_int(&mut random, 10, 5);
            },
            "randomInt: min must be <= max",
        );
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = create_random_source(0xabcdef);
        let mut b = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(random_int(&mut a, 0, 100), random_int(&mut b, 0, 100));
        }
    }
}

mod random_range {
    use super::*;

    #[test]
    fn returns_values_within_min_max() {
        let mut random = create_random_source(0xabcdef);
        for _ in 0..200 {
            let v = random_range(&mut random, 5.0, 10.0);
            assert!(v >= 5.0);
            assert!(v < 10.0);
        }
    }

    #[test]
    fn returns_min_when_min_equals_max() {
        let mut random = create_random_source(0xabcdef);
        assert_eq!(random_range(&mut random, 3.0, 3.0), 3.0);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = create_random_source(0xabcdef);
        let mut b = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(
                random_range(&mut a, 0.0, 100.0),
                random_range(&mut b, 0.0, 100.0)
            );
        }
    }
}

mod random_sign {
    use super::*;

    #[test]
    fn returns_only_1_or_negative_1() {
        let mut random = create_random_source(0xabcdef);
        for _ in 0..100 {
            let v = random_sign(&mut random);
            assert!(v == 1.0 || v == -1.0);
        }
    }

    #[test]
    fn produces_both_signs() {
        let mut random = create_random_source(0xabcdef);
        let mut saw_positive = false;
        let mut saw_negative = false;
        for _ in 0..100 {
            let v = random_sign(&mut random);
            if v == 1.0 {
                saw_positive = true;
            }
            if v == -1.0 {
                saw_negative = true;
            }
        }
        assert!(saw_positive);
        assert!(saw_negative);
    }

    #[test]
    fn is_deterministic_for_the_same_seed() {
        let mut a = create_random_source(0xabcdef);
        let mut b = create_random_source(0xabcdef);
        for _ in 0..20 {
            assert_eq!(random_sign(&mut a), random_sign(&mut b));
        }
    }
}
