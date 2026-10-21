use flight_signals::contract::null_signal_emit;

mod null_signal_emit {
    use super::*;

    #[test]
    fn does_nothing() {
        null_signal_emit();
    }
}
