use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use crate::internal::{clear_timeout, now_ms, set_timeout};
use crate::slot::{connect_signal, disconnect_signal};
use crate::types::{Signal, SignalThrottleOptions, SlotFn};

/// Connects a frame-tick signal to a slot at a reduced frame rate. The slot
/// receives the total accumulated `delta_time` (in ms) since the last fire,
/// not the individual source deltas. Returns a cleanup function that
/// disconnects the internal handler.
///
/// This is specialized to `(delta_time: f64) => void` frame-tick signals and
/// accumulates time rather than forwarding source args. For a payload-preserving
/// throttle over any signal shape, use `connect_signal_throttled`.
pub fn connect_signal_at_frame_rate(
    source: &Signal,
    fps: f64,
    slot: SlotFn,
) -> Box<dyn Fn()> {
    let period = 1000.0 / fps;
    let elapsed: Rc<RefCell<f64>> = Rc::new(RefCell::new(0.0));

    let handler: SlotFn = {
        let elapsed = elapsed.clone();
        let slot = slot.clone();
        Rc::new(move |args: Rc<dyn Any>| {
            let delta = *args.downcast_ref::<f64>().unwrap();
            let mut e = elapsed.borrow_mut();
            *e += delta;
            if *e >= period {
                let total = *e;
                *e %= period;
                slot(Rc::new(total));
            }
        })
    };

    connect_signal(source, handler.clone(), None);

    let source_cleanup = source.clone();
    let handler_cleanup = handler;
    return Box::new(move || {
        disconnect_signal(&source_cleanup, &handler_cleanup);
    });
}

/// Connects a slot to a signal with debounce semantics: the slot fires only
/// after the signal has been quiet for `delay_ms` milliseconds. Each emission
/// resets the timer. Returns a cleanup function.
///
/// `leading: true` fires immediately on the first invocation and suppresses
/// subsequent calls until the delay window expires. `trailing: true` (default)
/// fires at the end of the quiet period with the most recent args.
pub fn connect_signal_debounced(
    source: &Signal,
    delay_ms: f64,
    slot: SlotFn,
    options: Option<&SignalThrottleOptions>,
) -> Box<dyn Fn()> {
    let leading = options.and_then(|o| o.leading).unwrap_or(false);
    let trailing = options.and_then(|o| o.trailing).unwrap_or(true);

    let timer_id: Rc<RefCell<Option<usize>>> = Rc::new(RefCell::new(None));
    let last_args: Rc<RefCell<Option<Rc<dyn Any>>>> = Rc::new(RefCell::new(None));
    let leading_fired: Rc<RefCell<bool>> = Rc::new(RefCell::new(false));

    let handler: SlotFn = {
        let slot = slot.clone();
        let timer_id = timer_id.clone();
        let last_args = last_args.clone();
        let leading_fired = leading_fired.clone();
        Rc::new(move |args: Rc<dyn Any>| {
            *last_args.borrow_mut() = Some(args.clone());

            if leading && timer_id.borrow().is_none() && !*leading_fired.borrow() {
                *leading_fired.borrow_mut() = true;
                slot(args);
            }

            // Clear existing timer
            if let Some(id) = *timer_id.borrow() {
                clear_timeout(id);
            }

            // Set new timer
            let slot_timer = slot.clone();
            let timer_id_timer = timer_id.clone();
            let last_args_timer = last_args.clone();
            let leading_fired_timer = leading_fired.clone();

            let id = set_timeout(
                Box::new(move || {
                    *timer_id_timer.borrow_mut() = None;
                    *leading_fired_timer.borrow_mut() = false;
                    if trailing {
                        let la = last_args_timer.borrow().clone();
                        if let Some(a) = la {
                            slot_timer(a);
                            *last_args_timer.borrow_mut() = None;
                        }
                    }
                }),
                delay_ms,
            );
            *timer_id.borrow_mut() = Some(id);
        })
    };

    connect_signal(source, handler.clone(), None);

    let source_cleanup = source.clone();
    let handler_cleanup = handler;
    let timer_cleanup = timer_id;
    return Box::new(move || {
        disconnect_signal(&source_cleanup, &handler_cleanup);
        if let Some(id) = *timer_cleanup.borrow() {
            clear_timeout(id);
        }
    });
}

/// Connects a slot to a signal with throttle semantics: the slot fires at most
/// once per `interval_ms` milliseconds. Unlike `connect_signal_at_frame_rate`,
/// this preserves the original signal args (payload-preserving throttle).
/// Returns a cleanup function.
///
/// `leading: true` (default) fires immediately on the first invocation; the
/// trailing call fires after the interval if additional invocations occurred
/// during the cooldown.
pub fn connect_signal_throttled(
    source: &Signal,
    interval_ms: f64,
    slot: SlotFn,
    options: Option<&SignalThrottleOptions>,
) -> Box<dyn Fn()> {
    let leading = options.and_then(|o| o.leading).unwrap_or(true);
    let trailing = options.and_then(|o| o.trailing).unwrap_or(true);

    let last_fired_at: Rc<RefCell<f64>> = Rc::new(RefCell::new(f64::NEG_INFINITY));
    let trailing_timer: Rc<RefCell<Option<usize>>> = Rc::new(RefCell::new(None));
    let last_args: Rc<RefCell<Option<Rc<dyn Any>>>> = Rc::new(RefCell::new(None));

    let handler: SlotFn = {
        let slot = slot.clone();
        let last_fired_at = last_fired_at.clone();
        let trailing_timer = trailing_timer.clone();
        let last_args = last_args.clone();
        Rc::new(move |args: Rc<dyn Any>| {
            let now = now_ms();
            let remaining = interval_ms - (now - *last_fired_at.borrow());

            if remaining <= 0.0 || remaining > interval_ms {
                // Clear trailing timer
                if let Some(id) = *trailing_timer.borrow() {
                    clear_timeout(id);
                    *trailing_timer.borrow_mut() = None;
                }

                *last_fired_at.borrow_mut() = now;

                if leading {
                    slot(args);
                } else if trailing {
                    *last_args.borrow_mut() = Some(args);
                    let slot_trail = slot.clone();
                    let last_fired_trail = last_fired_at.clone();
                    let trailing_timer_trail = trailing_timer.clone();
                    let last_args_trail = last_args.clone();
                    let id = set_timeout(
                        Box::new(move || {
                            *last_fired_trail.borrow_mut() = now_ms();
                            *trailing_timer_trail.borrow_mut() = None;
                            let la = last_args_trail.borrow().clone();
                            if let Some(a) = la {
                                slot_trail(a);
                            }
                            *last_args_trail.borrow_mut() = None;
                        }),
                        interval_ms,
                    );
                    *trailing_timer.borrow_mut() = Some(id);
                }
            } else if trailing {
                // Clear existing trailing timer
                if let Some(id) = *trailing_timer.borrow() {
                    clear_timeout(id);
                }

                *last_args.borrow_mut() = Some(args);

                let slot_trail = slot.clone();
                let last_fired_trail = last_fired_at.clone();
                let trailing_timer_trail = trailing_timer.clone();
                let last_args_trail = last_args.clone();
                let id = set_timeout(
                    Box::new(move || {
                        *last_fired_trail.borrow_mut() = now_ms();
                        *trailing_timer_trail.borrow_mut() = None;
                        let la = last_args_trail.borrow().clone();
                        if let Some(a) = la {
                            slot_trail(a);
                        }
                        *last_args_trail.borrow_mut() = None;
                    }),
                    remaining,
                );
                *trailing_timer.borrow_mut() = Some(id);
            }
        })
    };

    connect_signal(source, handler.clone(), None);

    let source_cleanup = source.clone();
    let handler_cleanup = handler;
    let trailing_cleanup = trailing_timer;
    return Box::new(move || {
        disconnect_signal(&source_cleanup, &handler_cleanup);
        if let Some(id) = *trailing_cleanup.borrow() {
            clear_timeout(id);
        }
    });
}
