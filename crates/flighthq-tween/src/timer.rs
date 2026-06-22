//! Timer utility — a zero-target tween used as a delay/interval trigger.

use flighthq_types::{TweenManager, TweenOptions};

use crate::tween::create_tween;

/// Creates a timer tween: a tween with no target properties, used purely for
/// its `on_complete` / `on_update` signals as a delay or repeating interval.
///
/// `duration` is in seconds. The tween is stored in the manager under a
/// sentinel target pointer (`0`); the caller connects listeners via
/// `manager.tweens[&0][idx].on_complete`.
///
/// Returns the index within `manager.tweens[0]` at which the timer was placed.
pub fn create_tween_timer(
    manager: &mut TweenManager,
    duration: f32,
    options: Option<TweenOptions>,
) -> usize {
    // A timer is a tween on a sentinel target with no properties.
    create_tween(manager, 0, duration, vec![], options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tween_manager::create_tween_manager;
    use crate::update_tweens::update_tweens;
    use flighthq_signals::connect_signal;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn create_tween_timer_inserts_into_manager() {
        let mut m = create_tween_manager(None);
        let idx = create_tween_timer(&mut m, 2.0, None);
        assert_eq!(idx, 0);
        let tween = &m.tweens[&0][0];
        assert_eq!(tween.duration, 2.0);
        assert!(tween.properties.is_empty());
    }

    #[test]
    fn create_tween_timer_fires_on_complete_after_duration() {
        let mut m = create_tween_manager(None);
        create_tween_timer(&mut m, 1.0, None);
        let fired = Arc::new(AtomicUsize::new(0));
        let f = fired.clone();
        let _g = connect_signal(
            &m.tweens[&0][0].on_complete,
            Arc::new(move |_: &()| {
                f.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        update_tweens(&mut m, 1.0, &mut |_, _| vec![]);
        assert_eq!(fired.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn create_tween_timer_does_not_fire_before_duration() {
        let mut m = create_tween_manager(None);
        create_tween_timer(&mut m, 1.0, None);
        let fired = Arc::new(AtomicUsize::new(0));
        let f = fired.clone();
        let _g = connect_signal(
            &m.tweens[&0][0].on_complete,
            Arc::new(move |_: &()| {
                f.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        update_tweens(&mut m, 0.5, &mut |_, _| vec![]);
        assert_eq!(fired.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn create_tween_timer_respects_delay() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            delay: Some(0.5),
            ..Default::default()
        };
        create_tween_timer(&mut m, 1.0, Some(opts));
        let fired = Arc::new(AtomicUsize::new(0));
        let f = fired.clone();
        let _g = connect_signal(
            &m.tweens[&0][0].on_complete,
            Arc::new(move |_: &()| {
                f.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        update_tweens(&mut m, 1.0, &mut |_, _| vec![]);
        assert_eq!(fired.load(Ordering::SeqCst), 0);
        update_tweens(&mut m, 0.5, &mut |_, _| vec![]);
        assert_eq!(fired.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn create_tween_timer_independent_targets_share_sentinel() {
        let mut m = create_tween_manager(None);
        let a = create_tween_timer(&mut m, 1.0, None);
        let b = create_tween_timer(&mut m, 1.0, None);
        assert_ne!(a, b);
        assert_eq!(m.tweens[&0].len(), 2);
    }

    #[test]
    fn create_tween_timer_repeat_infinite_keeps_running() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            repeat: -1,
            ..Default::default()
        };
        create_tween_timer(&mut m, 1.0, Some(opts));
        let ticks = Arc::new(AtomicUsize::new(0));
        let t = ticks.clone();
        let _g = connect_signal(
            &m.tweens[&0][0].on_repeat,
            Arc::new(move |_: &()| {
                t.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        update_tweens(&mut m, 1.0, &mut |_, _| vec![]);
        update_tweens(&mut m, 1.0, &mut |_, _| vec![]);
        update_tweens(&mut m, 1.0, &mut |_, _| vec![]);
        assert_eq!(ticks.load(Ordering::SeqCst), 3);
        assert!(!m.tweens[&0][0].complete);
    }
}
