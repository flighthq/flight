use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

/// The emit implementation for a signal with no connected slots. In the IR,
/// this is represented as a no-op free function rather than a stored callable.
pub fn null_signal_emit(_args: Rc<dyn Any>) {}

// ---------------------------------------------------------------------------
// Timer utilities (platform abstraction for setTimeout / clearTimeout / Date.now)
// ---------------------------------------------------------------------------

struct TimerEntry {
    id: usize,
    fire_at: f64,
    callback: Option<Box<dyn FnOnce()>>,
}

struct TimerState {
    fake: bool,
    next_id: usize,
    timers: Vec<TimerEntry>,
    current_time: f64,
}

impl TimerState {
    fn new() -> Self {
        return TimerState {
            fake: false,
            next_id: 1,
            timers: Vec::new(),
            current_time: 0.0,
        };
    }
}

thread_local! {
    static TIMER_STATE: RefCell<TimerState> = RefCell::new(TimerState::new());
}

pub fn use_fake_timers() {
    TIMER_STATE.with(|s| {
        let mut state = s.borrow_mut();
        state.fake = true;
        state.current_time = 0.0;
        state.timers.clear();
        state.next_id = 1;
    });
}

pub fn use_real_timers() {
    TIMER_STATE.with(|s| {
        let mut state = s.borrow_mut();
        state.fake = false;
        state.timers.clear();
    });
}

pub fn set_timeout(callback: Box<dyn FnOnce()>, delay_ms: f64) -> usize {
    return TIMER_STATE.with(|s| {
        let mut state = s.borrow_mut();
        let id = state.next_id;
        state.next_id += 1;
        let fire_at = state.current_time + delay_ms;
        state.timers.push(TimerEntry {
            id,
            fire_at,
            callback: Some(callback),
        });
        return id;
    });
}

pub fn clear_timeout(id: usize) {
    TIMER_STATE.with(|s| {
        let mut state = s.borrow_mut();
        state.timers.retain(|t| t.id != id);
    });
}

pub fn now_ms() -> f64 {
    return TIMER_STATE.with(|s| {
        let state = s.borrow();
        if state.fake {
            return state.current_time;
        }
        return std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as f64;
    });
}

pub fn advance_timers_by_time(ms: f64) {
    let target_time = TIMER_STATE.with(|s| {
        let state = s.borrow();
        return state.current_time + ms;
    });

    loop {
        let callback = TIMER_STATE.with(|s| {
            let mut state = s.borrow_mut();
            let mut earliest_idx: Option<usize> = None;
            let mut earliest_time = f64::INFINITY;
            for (i, timer) in state.timers.iter().enumerate() {
                if timer.callback.is_some()
                    && timer.fire_at <= target_time
                    && timer.fire_at < earliest_time
                {
                    earliest_idx = Some(i);
                    earliest_time = timer.fire_at;
                }
            }

            if let Some(idx) = earliest_idx {
                state.current_time = earliest_time;
                let cb = state.timers[idx].callback.take();
                state.timers.remove(idx);
                return cb;
            }
            state.current_time = target_time;
            return None;
        });

        match callback {
            Some(cb) => cb(),
            None => break,
        }
    }
}
