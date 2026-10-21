use std::sync::{Arc, Mutex};

use flight_hostcapability::contract::*;

#[derive(Clone)]
struct ScheduledTimer {
    callback: Arc<dyn Fn() + Send + Sync>,
    cancelled: Arc<Mutex<bool>>,
    delay_ms: f64,
    repeating: bool,
}

fn create_test_capability(
    scheduled: Arc<Mutex<Vec<ScheduledTimer>>>,
    now_ms: Arc<Mutex<f64>>,
) -> HostTimerCapability {
    let provider: ProviderRef = Arc::new(());
    HostTimerCapability {
        provider,
        set_timeout: Arc::new({
            let scheduled = scheduled.clone();
            move |delay_ms, callback| {
                let cancelled = Arc::new(Mutex::new(false));
                scheduled.lock().unwrap().push(ScheduledTimer {
                    callback,
                    cancelled: cancelled.clone(),
                    delay_ms: if delay_ms.is_nan() || delay_ms < 0.0 {
                        0.0
                    } else {
                        delay_ms
                    },
                    repeating: false,
                });
                TimerHandle {
                    cancel: Arc::new(move || *cancelled.lock().unwrap() = true),
                }
            }
        }),
        set_interval: Arc::new({
            let scheduled = scheduled.clone();
            move |delay_ms, callback| {
                let cancelled = Arc::new(Mutex::new(false));
                scheduled.lock().unwrap().push(ScheduledTimer {
                    callback,
                    cancelled: cancelled.clone(),
                    delay_ms: if delay_ms.is_nan() || delay_ms < 1.0 {
                        1.0
                    } else {
                        delay_ms
                    },
                    repeating: true,
                });
                TimerHandle {
                    cancel: Arc::new(move || *cancelled.lock().unwrap() = true),
                }
            }
        }),
        now_ms: Arc::new(move || *now_ms.lock().unwrap()),
    }
}

#[test]
fn cancellation_is_owned_without_exposing_provider_timer_ids() {
    let scheduled = Arc::new(Mutex::new(Vec::new()));
    let capability = create_test_capability(scheduled.clone(), Arc::new(Mutex::new(0.0)));
    let handle = (capability.set_timeout)(4.0, Arc::new(|| {}));
    let cloned = handle.clone();

    (cloned.cancel)();

    assert!(*scheduled.lock().unwrap()[0].cancelled.lock().unwrap());
}

#[test]
fn intervals_clamp_to_at_least_one_millisecond() {
    let scheduled = Arc::new(Mutex::new(Vec::new()));
    let capability = create_test_capability(scheduled.clone(), Arc::new(Mutex::new(0.0)));

    (capability.set_interval)(0.25, Arc::new(|| {}));
    (capability.set_interval)(f64::NAN, Arc::new(|| {}));
    (capability.set_interval)(3.5, Arc::new(|| {}));

    let scheduled = scheduled.lock().unwrap();
    assert_eq!(scheduled[0].delay_ms, 1.0);
    assert_eq!(scheduled[1].delay_ms, 1.0);
    assert_eq!(scheduled[2].delay_ms, 3.5);
    assert!(scheduled.iter().all(|timer| timer.repeating));
}

#[test]
fn now_and_provider_identity_are_supplied_by_the_explicit_context() {
    let scheduled = Arc::new(Mutex::new(Vec::new()));
    let now_ms = Arc::new(Mutex::new(17.25));
    let capability = create_test_capability(scheduled, now_ms.clone());
    let provider = capability.provider.clone();

    assert_eq!((capability.now_ms)(), 17.25);
    *now_ms.lock().unwrap() = 23.5;
    assert_eq!((capability.now_ms)(), 23.5);
    assert!(Arc::ptr_eq(&capability.provider, &provider));
}

#[test]
fn timeout_and_interval_callbacks_are_enqueued_not_run_inline() {
    let scheduled = Arc::new(Mutex::new(Vec::new()));
    let capability = create_test_capability(scheduled.clone(), Arc::new(Mutex::new(0.0)));
    let calls = Arc::new(Mutex::new(Vec::new()));

    (capability.set_timeout)(
        2.0,
        Arc::new({
            let calls = calls.clone();
            move || calls.lock().unwrap().push("timeout")
        }),
    );
    (capability.set_interval)(
        3.0,
        Arc::new({
            let calls = calls.clone();
            move || calls.lock().unwrap().push("interval")
        }),
    );

    assert!(calls.lock().unwrap().is_empty());
    let queued = scheduled.lock().unwrap().clone();
    (queued[0].callback)();
    (queued[1].callback)();
    assert_eq!(*calls.lock().unwrap(), vec!["timeout", "interval"]);
}

#[test]
fn timeouts_normalize_negative_and_nan_delays_to_zero() {
    let scheduled = Arc::new(Mutex::new(Vec::new()));
    let capability = create_test_capability(scheduled.clone(), Arc::new(Mutex::new(0.0)));

    (capability.set_timeout)(-4.0, Arc::new(|| {}));
    (capability.set_timeout)(f64::NAN, Arc::new(|| {}));
    (capability.set_timeout)(3.5, Arc::new(|| {}));

    let scheduled = scheduled.lock().unwrap();
    assert_eq!(scheduled[0].delay_ms, 0.0);
    assert_eq!(scheduled[1].delay_ms, 0.0);
    assert_eq!(scheduled[2].delay_ms, 3.5);
    assert!(scheduled.iter().all(|timer| !timer.repeating));
}
