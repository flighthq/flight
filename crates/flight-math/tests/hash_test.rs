use flight_math::*;

mod create_random_source_from_hash {
    use super::*;

    #[test]
    fn returns_a_random_source_that_produces_values_in_0_1() {
        let rng = create_random_source_from_hash(3, 7);
        for _ in 0..20 {
            let v = rng();
            assert!(v >= 0.0);
            assert!(v < 1.0);
        }
    }

    #[test]
    fn produces_different_sequences_for_different_positions() {
        let a = create_random_source_from_hash(0, 0);
        let b = create_random_source_from_hash(1, 0);
        let mut differs = false;
        for _ in 0..10 {
            if a() != b() {
                differs = true;
            }
        }
        assert!(differs);
    }

    #[test]
    fn produces_the_same_sequence_for_the_same_position() {
        let a = create_random_source_from_hash(5, 9);
        let b = create_random_source_from_hash(5, 9);
        for _ in 0..20 {
            assert_eq!(a(), b());
        }
    }
}

mod hash_2d {
    use super::*;

    #[test]
    fn returns_a_non_negative_integer() {
        let h = hash_2d(3, 7);
        assert!(h > 0 || h == 0);
    }

    #[test]
    fn is_deterministic() {
        assert_eq!(hash_2d(5, 10), hash_2d(5, 10));
    }

    #[test]
    fn differs_for_different_inputs() {
        assert_ne!(hash_2d(0, 0), hash_2d(1, 0));
        assert_ne!(hash_2d(0, 0), hash_2d(0, 1));
    }
}

mod hash_3d {
    use super::*;

    #[test]
    fn returns_a_non_negative_integer() {
        let h = hash_3d(1, 2, 3);
        assert!(h > 0 || h == 0);
    }

    #[test]
    fn is_deterministic() {
        assert_eq!(hash_3d(1, 2, 3), hash_3d(1, 2, 3));
    }

    #[test]
    fn differs_for_different_inputs() {
        assert_ne!(hash_3d(0, 0, 0), hash_3d(1, 0, 0));
        assert_ne!(hash_3d(0, 0, 0), hash_3d(0, 0, 1));
    }
}

mod hash_combine {
    use super::*;

    #[test]
    fn returns_a_number() {
        let _ = hash_combine(1, 2);
    }

    #[test]
    fn is_deterministic() {
        assert_eq!(hash_combine(100, 200), hash_combine(100, 200));
    }

    #[test]
    fn produces_different_results_for_different_seeds() {
        assert_ne!(hash_combine(1, 100), hash_combine(2, 100));
    }

    #[test]
    fn pins_the_complete_multi_term_mix_with_a_known_answer_vector() {
        assert_eq!(hash_combine(100, 200), 3347962280);
    }
}

mod hash_uint32 {
    use super::*;

    #[test]
    fn returns_a_non_negative_integer() {
        let h = hash_uint32(42);
        assert!(h > 0 || h == 0);
    }

    #[test]
    fn is_deterministic() {
        assert_eq!(hash_uint32(12345), hash_uint32(12345));
    }

    #[test]
    fn produces_different_results_for_different_inputs() {
        assert_ne!(hash_uint32(0), hash_uint32(1));
        assert_ne!(hash_uint32(100), hash_uint32(101));
    }

    #[test]
    fn handles_0() {
        let _ = hash_uint32(0);
    }
}
