use flight_entity::Ref;
use flight_host::{HostTimerCapability, TimerHandle};
use std::sync::{Arc, RwLock};
pub struct TimerFixture {
    now: f64,
    entries: Vec<TimerEntry>,
}
struct TimerEntry {
    due: f64,
    interval: Option<f64>,
    cancelled: Ref<bool>,
    callback: Arc<dyn Fn() + Send + Sync>,
}
pub fn timer_fixture() -> (Arc<HostTimerCapability>, Ref<TimerFixture>) {
    let state = Arc::new(RwLock::new(TimerFixture {
        now: 0.0,
        entries: Vec::new(),
    }));
    let timeouts = state.clone();
    let intervals = state.clone();
    let now = state.clone();
    let host = Arc::new(HostTimerCapability {
        provider: state.clone(),
        set_timeout: Arc::new(move |delay, callback| schedule(&timeouts, delay, None, callback)),
        set_interval: Arc::new(move |delay, callback| {
            schedule(&intervals, delay, Some(delay), callback)
        }),
        now_ms: Arc::new(move || now.read().unwrap().now),
    });
    return (host, state);
}
fn schedule(
    state: &Ref<TimerFixture>,
    delay: f64,
    interval: Option<f64>,
    callback: Arc<dyn Fn() + Send + Sync>,
) -> TimerHandle {
    let cancelled = Arc::new(RwLock::new(false));
    let flag = cancelled.clone();
    let mut state = state.write().unwrap();
    let due = state.now + delay;
    state.entries.push(TimerEntry {
        due,
        interval,
        cancelled,
        callback,
    });
    return TimerHandle {
        cancel: Arc::new(move || *flag.write().unwrap() = true),
    };
}
pub fn advance_timers(state: &Ref<TimerFixture>, duration: f64) {
    let target = state.read().unwrap().now + duration;
    loop {
        let callback = {
            let mut state = state.write().unwrap();
            let next = state
                .entries
                .iter()
                .enumerate()
                .filter(|(_, entry)| !*entry.cancelled.read().unwrap() && entry.due <= target)
                .min_by(|(_, a), (_, b)| a.due.total_cmp(&b.due))
                .map(|(index, _)| index);
            let Some(index) = next else {
                state.now = target;
                break;
            };
            state.now = state.entries[index].due;
            let entry = &mut state.entries[index];
            let callback = entry.callback.clone();
            if let Some(interval) = entry.interval {
                entry.due += interval;
            } else {
                *entry.cancelled.write().unwrap() = true;
            }
            callback
        };
        callback();
    }
}
