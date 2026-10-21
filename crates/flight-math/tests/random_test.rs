use flight_math::contract::{initialize_random_source, next_random};
use flight_math::*;

mod create_random_source {
    use super::*;

    #[test]
    fn produces_values_in_0_1() {
        let mut rng = create_random_source(1);
        for _ in 0..1000 {
            let v = next_random(&mut rng);
            assert!(v >= 0.0);
            assert!(v < 1.0);
        }
    }

    #[test]
    fn is_deterministic_same_seed_yields_the_same_sequence() {
        let mut a = create_random_source(0xc0ffee);
        let mut b = create_random_source(0xc0ffee);
        for _ in 0..100 {
            assert_eq!(next_random(&mut a), next_random(&mut b));
        }
    }

    #[test]
    fn different_seeds_yield_different_sequences() {
        let mut a = create_random_source(1);
        let mut b = create_random_source(2);
        let mut differs = false;
        for _ in 0..10 {
            if next_random(&mut a) != next_random(&mut b) {
                differs = true;
            }
        }
        assert!(differs);
    }

    #[test]
    fn pins_the_mulberry32_transform_with_a_known_answer_sequence() {
        let mut random = create_random_source(0xc0ffee);
        assert_eq!(
            [
                next_random(&mut random),
                next_random(&mut random),
                next_random(&mut random),
                next_random(&mut random)
            ],
            [
                0.021141508361324668_f32,
                0.6661099966149777_f32,
                0.7799714196007699_f32,
                0.7395844468846917_f32
            ],
        );
    }
}

mod initialize_random_source {
    use super::*;

    #[test]
    fn sets_the_seed_on_a_pre_allocated_source() {
        let mut rng = create_random_source(0);
        initialize_random_source(&mut rng, 42);
        let mut rng2 = create_random_source(42);
        assert_eq!(next_random(&mut rng), next_random(&mut rng2));
    }
}

mod next_random {
    use super::*;

    #[test]
    fn advances_the_state_and_returns_a_value() {
        let mut rng = create_random_source(0);
        let v1 = next_random(&mut rng);
        let v2 = next_random(&mut rng);
        assert!(v1 >= 0.0 && v1 < 1.0);
        assert!(v2 >= 0.0 && v2 < 1.0);
        assert_ne!(v1, v2);
    }
}
