use std::sync::{Arc, Mutex};

use crate::signal::Signal;
use crate::slot::{SlotGuard, connect_signal};

/// Connects a slot to a delta-time signal at a capped rate.
///
/// The source signal carries an elapsed-time delta as its payload (in the same
/// unit throughout, typically milliseconds). `fps` controls the maximum
/// fires-per-second: the internal handler accumulates the deltas, and when the
/// accumulated value meets or exceeds `1000 / fps` the slot fires with the
/// accumulated delta and the remainder carries over.
///
/// The returned [`SlotGuard`] keeps the connection alive; dropping it
/// disconnects automatically.
///
/// Mirrors the TS `connectSignalAtRate(source, fps, slot)`.
pub fn connect_signal_at_rate(
    source: &Signal<f32>,
    fps: f32,
    slot: impl Fn(f32) + Send + Sync + 'static,
) -> SlotGuard<f32> {
    let period = 1000.0 / fps;
    let elapsed = Arc::new(Mutex::new(0.0f32));

    connect_signal(
        source,
        Arc::new(move |delta: &f32| {
            let mut e = elapsed.lock().unwrap();
            *e += *delta;
            if *e >= period {
                slot(*e);
                *e %= period;
            }
        }),
        Default::default(),
    )
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::emitter::emit_signal;
    use crate::signal::Signal;

    #[test]
    fn connect_signal_at_rate_throttles_callbacks() {
        // 10 fps → period = 100 ms. Advance by 60 ms per step.
        let sig: Signal<f32> = Signal::new();
        let fires = Arc::new(Mutex::new(0u32));
        let f = Arc::clone(&fires);
        let _slot = connect_signal_at_rate(&sig, 10.0, move |_dt| {
            *f.lock().unwrap() += 1;
        });

        // Tick 1: elapsed = 60  → no fire
        // Tick 2: elapsed = 120 → fire (≥100 ms); remainder = 20
        // Tick 3: elapsed = 80  → no fire
        emit_signal(&sig, &60.0);
        emit_signal(&sig, &60.0);
        emit_signal(&sig, &60.0);

        assert_eq!(*fires.lock().unwrap(), 1);
    }

    #[test]
    fn connect_signal_at_rate_drop_stops_calls() {
        let sig: Signal<f32> = Signal::new();
        let fires = Arc::new(Mutex::new(0u32));
        let f = Arc::clone(&fires);
        {
            // period = 1 ms; a 2 ms delta fires immediately
            let _slot = connect_signal_at_rate(&sig, 1000.0, move |_dt| {
                *f.lock().unwrap() += 1;
            });
            emit_signal(&sig, &2.0);
        }
        // Slot dropped; this emit must not fire.
        emit_signal(&sig, &100.0);
        assert_eq!(*fires.lock().unwrap(), 1);
    }

    #[test]
    fn connect_signal_at_rate_fires_at_each_period() {
        // 1 fps → period = 1000 ms. Each 1000 ms tick fires once.
        let sig: Signal<f32> = Signal::new();
        let fires = Arc::new(Mutex::new(0u32));
        let f = Arc::clone(&fires);
        let _slot = connect_signal_at_rate(&sig, 1.0, move |_dt| {
            *f.lock().unwrap() += 1;
        });

        emit_signal(&sig, &1000.0);
        emit_signal(&sig, &1000.0);
        emit_signal(&sig, &1000.0);
        assert_eq!(*fires.lock().unwrap(), 3);
    }
}
