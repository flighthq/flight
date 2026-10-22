use std::sync::{Arc, Mutex};

use flight_input::contract::*;

fn options(delay: f64, interval: f64) -> InputKeyRepeatOptions {
    return InputKeyRepeatOptions { delay, interval };
}

fn counter() -> (Arc<Mutex<usize>>, InputRepeatCallback) {
    let count = Arc::new(Mutex::new(0));
    let captured = count.clone();
    let callback: InputRepeatCallback = Arc::new(move || *captured.lock().unwrap() += 1);
    return (count, callback);
}

mod advance_input_key_repeat_timer {
    use super::*;

    #[test]
    fn fires_the_delayed_tick_then_one_tick_per_interval() {
        let timer = create_input_key_repeat_timer(&options(500.0, 33.0));
        let (count, callback) = counter();
        start_input_key_repeat_timer(&timer, callback, 0.0);
        assert_eq!(*count.lock().unwrap(), 1);
        advance_input_key_repeat_timer(&timer, 499.0);
        assert_eq!(*count.lock().unwrap(), 1);
        advance_input_key_repeat_timer(&timer, 500.0);
        assert_eq!(*count.lock().unwrap(), 2);
        advance_input_key_repeat_timer(&timer, 533.0);
        assert_eq!(*count.lock().unwrap(), 3);
    }

    #[test]
    fn catches_up_every_due_tick_in_order() {
        let timer = create_input_key_repeat_timer(&options(10.0, 10.0));
        let (count, callback) = counter();
        start_input_key_repeat_timer(&timer, callback, 0.0);
        advance_input_key_repeat_timer(&timer, 35.0);
        assert_eq!(*count.lock().unwrap(), 4);
    }

    #[test]
    fn a_zero_interval_fires_once_per_advance() {
        let timer = create_input_key_repeat_timer(&options(0.0, 0.0));
        let (count, callback) = counter();
        start_input_key_repeat_timer(&timer, callback, 0.0);
        assert_eq!(*count.lock().unwrap(), 1);
        advance_input_key_repeat_timer(&timer, 0.0);
        assert_eq!(*count.lock().unwrap(), 2);
        advance_input_key_repeat_timer(&timer, 0.0);
        assert_eq!(*count.lock().unwrap(), 3);
    }

    #[test]
    fn does_nothing_when_stopped_or_not_yet_due() {
        let timer = create_input_key_repeat_timer(&options(100.0, 10.0));
        let (count, callback) = counter();
        advance_input_key_repeat_timer(&timer, 1000.0);
        assert_eq!(*count.lock().unwrap(), 0);
        start_input_key_repeat_timer(&timer, callback, 0.0);
        stop_input_key_repeat_timer(&timer);
        advance_input_key_repeat_timer(&timer, 1000.0);
        assert_eq!(*count.lock().unwrap(), 1);
    }
}

mod create_input_key_repeat_timer {
    use super::*;

    #[test]
    fn allocates_an_inactive_timer_with_the_supplied_timings() {
        let timer = create_input_key_repeat_timer(&options(500.0, 33.0));
        let (count, callback) = counter();
        advance_input_key_repeat_timer(&timer, 1000.0);
        assert_eq!(*count.lock().unwrap(), 0);
        start_input_key_repeat_timer(&timer, callback, 0.0);
        advance_input_key_repeat_timer(&timer, 499.0);
        assert_eq!(*count.lock().unwrap(), 1);
        advance_input_key_repeat_timer(&timer, 500.0);
        assert_eq!(*count.lock().unwrap(), 2);
        advance_input_key_repeat_timer(&timer, 533.0);
        assert_eq!(*count.lock().unwrap(), 3);
    }
}

mod initialize_input_key_repeat_timer {
    use super::*;

    #[test]
    fn resets_the_cycle_and_replaces_the_timings() {
        let timer = create_input_key_repeat_timer(&options(500.0, 33.0));
        let (count, callback) = counter();
        start_input_key_repeat_timer(&timer, callback, 0.0);
        {
            let mut locked = timer.write().unwrap();
            initialize_input_key_repeat_timer(&mut locked, &options(10.0, 5.0));
        }
        advance_input_key_repeat_timer(&timer, 100.0);
        assert_eq!(*count.lock().unwrap(), 1);
        let (new_count, new_callback) = counter();
        start_input_key_repeat_timer(&timer, new_callback, 0.0);
        advance_input_key_repeat_timer(&timer, 9.0);
        assert_eq!(*new_count.lock().unwrap(), 1);
        advance_input_key_repeat_timer(&timer, 10.0);
        assert_eq!(*new_count.lock().unwrap(), 2);
    }
}

mod start_input_key_repeat_timer {
    use super::*;

    #[test]
    fn invokes_immediately_and_restarts_the_cycle() {
        let timer = create_input_key_repeat_timer(&options(100.0, 10.0));
        let (count, callback) = counter();
        start_input_key_repeat_timer(&timer, callback, 0.0);
        assert_eq!(*count.lock().unwrap(), 1);
        let (second_count, second_callback) = counter();
        start_input_key_repeat_timer(&timer, second_callback, 50.0);
        assert_eq!(*second_count.lock().unwrap(), 1);
        advance_input_key_repeat_timer(&timer, 100.0);
        assert_eq!(*count.lock().unwrap(), 1);
        assert_eq!(*second_count.lock().unwrap(), 1);
        advance_input_key_repeat_timer(&timer, 150.0);
        assert_eq!(*second_count.lock().unwrap(), 2);
    }
}

mod stop_input_key_repeat_timer {
    use super::*;

    #[test]
    fn cancels_the_cycle_and_is_idempotent() {
        let timer = create_input_key_repeat_timer(&options(10.0, 10.0));
        let (count, callback) = counter();
        start_input_key_repeat_timer(&timer, callback, 0.0);
        stop_input_key_repeat_timer(&timer);
        stop_input_key_repeat_timer(&timer);
        advance_input_key_repeat_timer(&timer, 1000.0);
        assert_eq!(*count.lock().unwrap(), 1);
    }
}
