use flight_math::*;

mod create_random_source {
    use super::*;

    #[test]
    fn keeps_the_half_open_endpoint_when_a_seeded_sample_rounds_up() {
        let random = create_random_source(52078625);
        let sample = random();
        assert_eq!(sample, 1.0 - f32::EPSILON / 2.0);
        assert!(sample < 1.0);
    }

    #[test]
    fn produces_values_in_0_1() {
        let rng = create_random_source(1);
        for _ in 0..1000 {
            let v = rng();
            assert!(v >= 0.0);
            assert!(v < 1.0);
        }
    }

    #[test]
    fn is_deterministic_same_seed_yields_the_same_sequence() {
        let a = create_random_source(0xc0ffee);
        let b = create_random_source(0xc0ffee);
        for _ in 0..100 {
            assert_eq!(a(), b());
        }
    }

    #[test]
    fn different_seeds_yield_different_sequences() {
        let a = create_random_source(1);
        let b = create_random_source(2);
        let mut differs = false;
        for _ in 0..10 {
            if a() != b() {
                differs = true;
            }
        }
        assert!(differs);
    }

    #[test]
    fn pins_the_mulberry32_transform_with_a_known_answer_sequence() {
        let random = create_random_source(0xc0ffee);
        assert_eq!(
            [random(), random(), random(), random()],
            [
                0.021141508361324668_f32,
                0.6661099966149777_f32,
                0.7799714196007699_f32,
                0.7395844468846917_f32
            ],
        );
    }

    #[test]
    fn repeats_the_sequence_when_constructed_with_the_same_seed() {
        let rng = create_random_source(42);
        let rng2 = create_random_source(42);
        assert_eq!(rng(), rng2());
    }

    #[test]
    fn advances_the_state_and_returns_a_value() {
        let rng = create_random_source(0);
        let v1 = rng();
        let v2 = rng();
        assert!(v1 >= 0.0 && v1 < 1.0);
        assert!(v2 >= 0.0 && v2 < 1.0);
        assert_ne!(v1, v2);
    }

    #[test]
    fn cloned_callables_advance_the_same_stream() {
        let random = create_random_source(42);
        let shared = random.clone();
        let expected = create_random_source(42);
        assert_eq!(random(), expected());
        assert_eq!(shared(), expected());
        assert_eq!(random(), expected());
    }

    #[test]
    /// flight-compiler: rust-only — JavaScript has no shared atomic/thread execution equivalent.
    fn atomic_state_preserves_the_stream_across_threads() {
        let random = create_random_source(42);
        let workers: Vec<_> = (0..4)
            .map(|_| {
                let shared = random.clone();
                std::thread::spawn(move || (0..64).map(|_| shared()).collect::<Vec<_>>())
            })
            .collect();
        let mut actual: Vec<_> = workers
            .into_iter()
            .flat_map(|worker| worker.join().unwrap())
            .collect();
        let expected = create_random_source(42);
        let mut expected: Vec<_> = (0..256).map(|_| expected()).collect();
        actual.sort_by(f32::total_cmp);
        expected.sort_by(f32::total_cmp);
        assert_eq!(actual, expected);
    }
}
