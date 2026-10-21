use flight_particles::*;

mod create_signal {
    use super::*;

    #[test]
    fn returns_a_default_signal() {
        let s = create_signal();
        assert_eq!(s, Signal {});
    }
}
