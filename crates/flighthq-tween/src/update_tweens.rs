//! Per-frame tween update loop.

use flighthq_signals::emit_signal;
use flighthq_types::{Tween, TweenManager};

use crate::internal::initialize_tween;

/// Advance a single tween to its final or initial state immediately.
///
/// Emits `on_complete` and marks the tween as complete. Has no effect if the
/// tween is already complete.
///
/// `current_values` provides the current numeric values for each property key
/// so that `start` values can be snapshotted if the tween has not yet been
/// initialized.
///
/// Returns the final `(key, value)` pairs applied to properties (empty when the
/// tween was already complete).
pub fn complete_tween(tween: &mut Tween, current_values: &[(String, f32)]) -> Vec<(String, f32)> {
    if tween.complete {
        return Vec::new();
    }
    if !tween.initialized {
        initialize_tween(tween, current_values);
    }
    let effective_t = if tween.reverse { 0.0 } else { 1.0 };
    let eased_t = (tween.ease)(effective_t);
    let mut applied = Vec::with_capacity(tween.properties.len());
    for detail in &tween.properties {
        let mut value = detail.start + detail.change * eased_t;
        if tween.snapping {
            value = value.round();
        }
        applied.push((detail.key.clone(), value));
    }
    tween.complete = true;
    emit_signal(&tween.on_complete, &());
    applied
}

/// Advance all tweens in the manager by `delta_time` seconds.
///
/// Because Rust cannot write property values back to arbitrary target objects
/// by string key, `update_tweens` returns the per-target property deltas the
/// caller must apply. Each entry in the returned `Vec` is:
///
/// ```text
/// (target_ptr: u64, key: String, value: f32)
/// ```
///
/// The caller matches `target_ptr` back to its owned data and sets the field.
/// Completed tweens are removed from `manager.tweens` automatically.
///
/// `current_values_fn` is called once per uninitialized tween to snapshot
/// starting property values. It receives the target pointer and the property
/// keys that need current values.
pub fn update_tweens(
    manager: &mut TweenManager,
    delta_time: f32,
    current_values_fn: &mut dyn FnMut(u64, &[String]) -> Vec<(String, f32)>,
) -> Vec<(u64, String, f32)> {
    let mut applied = Vec::new();
    let mut empty_targets = Vec::new();

    for (target, list) in manager.tweens.iter_mut() {
        // Iterate from the back so completed tweens can be removed in place,
        // matching the TS splice-from-end loop.
        let mut i = list.len();
        while i > 0 {
            i -= 1;
            if list[i].complete {
                list.remove(i);
            } else {
                update_tween(*target, &mut list[i], delta_time, current_values_fn, &mut applied);
            }
        }
        if list.is_empty() {
            empty_targets.push(*target);
        }
    }

    for target in empty_targets {
        manager.tweens.remove(&target);
    }

    applied
}

fn update_tween(
    target: u64,
    tween: &mut Tween,
    delta_time: f32,
    current_values_fn: &mut dyn FnMut(u64, &[String]) -> Vec<(String, f32)>,
    applied: &mut Vec<(u64, String, f32)>,
) {
    if tween.paused || tween.complete {
        return;
    }

    tween.elapsed += delta_time;

    let active_elapsed = tween.elapsed - tween.delay;
    if active_elapsed <= 0.0 {
        return;
    }

    if !tween.initialized {
        let keys: Vec<String> = tween.properties.iter().map(|d| d.key.clone()).collect();
        let current_values = current_values_fn(target, &keys);
        initialize_tween(tween, &current_values);
    }

    let t = (active_elapsed / tween.duration).min(1.0);
    let effective_t = if tween.reverse { 1.0 - t } else { t };
    let eased_t = (tween.ease)(effective_t);

    for detail in &tween.properties {
        let mut value = detail.start + detail.change * eased_t;
        if tween.snapping {
            value = value.round();
        }
        applied.push((target, detail.key.clone(), value));
    }

    emit_signal(&tween.on_update, &());

    if t >= 1.0 {
        if tween.repeat == 0 {
            tween.complete = true;
            emit_signal(&tween.on_complete, &());
        } else {
            if tween.reflect {
                tween.reverse = !tween.reverse;
            }
            tween.elapsed = tween.delay;
            if tween.repeat > 0 {
                tween.repeat -= 1;
            }
            emit_signal(&tween.on_repeat, &());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tween::{create_tween, pause_tween, resume_tween};
    use crate::tween_manager::create_tween_manager;
    use flighthq_signals::connect_signal;
    use flighthq_types::TweenOptions;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn linear() -> TweenOptions {
        TweenOptions {
            ease: Some(Arc::new(|t| t)),
            ..Default::default()
        }
    }

    fn value_of(applied: &[(u64, String, f32)], key: &str) -> Option<f32> {
        applied.iter().rev().find(|(_, k, _)| k == key).map(|(_, _, v)| *v)
    }

    #[test]
    fn complete_tween_jumps_to_end_and_marks_complete() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear()));
        let applied = complete_tween(&mut m.tweens.get_mut(&1).unwrap()[0], &[("x".into(), 0.0)]);
        assert_eq!(applied[0].1, 100.0);
        assert!(m.tweens[&1][0].complete);
    }

    #[test]
    fn complete_tween_emits_on_complete() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        let fired = Arc::new(AtomicUsize::new(0));
        let f = fired.clone();
        let _g = connect_signal(
            &m.tweens[&1][0].on_complete,
            Arc::new(move |_: &()| {
                f.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        complete_tween(&mut m.tweens.get_mut(&1).unwrap()[0], &[("x".into(), 0.0)]);
        assert_eq!(fired.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn complete_tween_works_uninitialized() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear()));
        assert!(!m.tweens[&1][0].initialized);
        let applied = complete_tween(&mut m.tweens.get_mut(&1).unwrap()[0], &[("x".into(), 25.0)]);
        assert_eq!(applied[0].1, 100.0);
    }

    #[test]
    fn complete_tween_reverse_lands_on_start() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            reverse: true,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(opts));
        let applied = complete_tween(&mut m.tweens.get_mut(&1).unwrap()[0], &[("x".into(), 0.0)]);
        assert_eq!(applied[0].1, 0.0);
        assert!(m.tweens[&1][0].complete);
    }

    #[test]
    fn complete_tween_is_noop_when_already_complete() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear()));
        complete_tween(&mut m.tweens.get_mut(&1).unwrap()[0], &[("x".into(), 0.0)]);
        let applied = complete_tween(&mut m.tweens.get_mut(&1).unwrap()[0], &[("x".into(), 0.0)]);
        assert!(applied.is_empty());
    }

    #[test]
    fn smart_rotation_large_positive_delta() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            smart_rotation: true,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("rotation".into(), 350.0)], Some(opts));
        let applied = update_tweens(&mut m, 0.5, &mut |_, _| vec![("rotation".into(), 0.0)]);
        assert!((value_of(&applied, "rotation").unwrap() - (-5.0)).abs() < 1e-3);
    }

    #[test]
    fn smart_rotation_large_negative_delta() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            smart_rotation: true,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("rotation".into(), -350.0)], Some(opts));
        let applied = update_tweens(&mut m, 0.5, &mut |_, _| vec![("rotation".into(), 0.0)]);
        assert!((value_of(&applied, "rotation").unwrap() - 5.0).abs() < 1e-3);
    }

    #[test]
    fn smart_rotation_from_non_zero_angle() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            smart_rotation: true,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("rotation".into(), 10.0)], Some(opts));
        let a = update_tweens(&mut m, 0.5, &mut |_, _| vec![("rotation".into(), 350.0)]);
        assert!((value_of(&a, "rotation").unwrap() - 360.0).abs() < 1e-3);
        let b = update_tweens(&mut m, 0.5, &mut |_, _| vec![]);
        assert!((value_of(&b, "rotation").unwrap() - 370.0).abs() < 1e-3);
    }

    #[test]
    fn smart_rotation_leaves_small_deltas() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            smart_rotation: true,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("rotation".into(), 90.0)], Some(opts));
        let a = update_tweens(&mut m, 0.5, &mut |_, _| vec![("rotation".into(), 0.0)]);
        assert!((value_of(&a, "rotation").unwrap() - 45.0).abs() < 1e-3);
    }

    #[test]
    fn update_tweens_returns_empty_when_no_tweens() {
        let mut m = create_tween_manager(None);
        let result = update_tweens(&mut m, 0.016, &mut |_, _| vec![]);
        assert!(result.is_empty());
    }

    #[test]
    fn update_tweens_interpolates() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear()));
        let a = update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        assert!((value_of(&a, "x").unwrap() - 50.0).abs() < 1e-3);
    }

    #[test]
    fn update_tweens_reaches_end() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear()));
        let a = update_tweens(&mut m, 1.0, &mut |_, _| vec![("x".into(), 0.0)]);
        assert_eq!(value_of(&a, "x").unwrap(), 100.0);
    }

    #[test]
    fn update_tweens_multiple_properties() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0), ("y".into(), 200.0)], Some(linear()));
        let a = update_tweens(&mut m, 1.0, &mut |_, _| vec![("x".into(), 0.0), ("y".into(), 0.0)]);
        assert_eq!(value_of(&a, "x").unwrap(), 100.0);
        assert_eq!(value_of(&a, "y").unwrap(), 200.0);
    }

    #[test]
    fn update_tweens_marks_complete() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        update_tweens(&mut m, 1.0, &mut |_, _| vec![("x".into(), 0.0)]);
        // After completion the tween is removed on the next pass; verify removal.
        update_tweens(&mut m, 0.0, &mut |_, _| vec![]);
        assert!(!m.tweens.contains_key(&1));
    }

    #[test]
    fn update_tweens_removes_completed() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        update_tweens(&mut m, 1.0, &mut |_, _| vec![("x".into(), 0.0)]);
        update_tweens(&mut m, 0.0, &mut |_, _| vec![]);
        assert!(!m.tweens.contains_key(&1));
    }

    #[test]
    fn update_tweens_emits_on_complete() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        let fired = Arc::new(AtomicUsize::new(0));
        let f = fired.clone();
        let _g = connect_signal(
            &m.tweens[&1][0].on_complete,
            Arc::new(move |_: &()| {
                f.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        update_tweens(&mut m, 1.0, &mut |_, _| vec![("x".into(), 0.0)]);
        assert_eq!(fired.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn update_tweens_emits_on_update_each_tick() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        let updates = Arc::new(AtomicUsize::new(0));
        let u = updates.clone();
        let _g = connect_signal(
            &m.tweens[&1][0].on_update,
            Arc::new(move |_: &()| {
                u.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        update_tweens(&mut m, 0.25, &mut |_, _| vec![("x".into(), 0.0)]);
        update_tweens(&mut m, 0.25, &mut |_, _| vec![]);
        assert_eq!(updates.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn update_tweens_respects_delay() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            delay: Some(0.5),
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(opts));
        let a = update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        assert!(value_of(&a, "x").is_none());
        let b = update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        assert!((value_of(&b, "x").unwrap() - 50.0).abs() < 1e-3);
    }

    #[test]
    fn update_tweens_repeats_specified_times() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            repeat: 2,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(opts));
        let repeats = Arc::new(AtomicUsize::new(0));
        let r = repeats.clone();
        let _g = connect_signal(
            &m.tweens[&1][0].on_repeat,
            Arc::new(move |_: &()| {
                r.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        update_tweens(&mut m, 1.0, &mut |_, _| vec![("x".into(), 0.0)]);
        update_tweens(&mut m, 1.0, &mut |_, _| vec![]);
        update_tweens(&mut m, 1.0, &mut |_, _| vec![]);
        assert_eq!(repeats.load(Ordering::SeqCst), 2);
        assert!(m.tweens[&1][0].complete);
    }

    #[test]
    fn update_tweens_reverse() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            reverse: true,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(opts));
        let a = update_tweens(&mut m, 0.1, &mut |_, _| vec![("x".into(), 0.0)]);
        assert!((value_of(&a, "x").unwrap() - 90.0).abs() < 1e-3);
        let b = update_tweens(&mut m, 0.9, &mut |_, _| vec![]);
        assert_eq!(value_of(&b, "x").unwrap(), 0.0);
    }

    #[test]
    fn update_tweens_reflect() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            repeat: 1,
            reflect: true,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(opts));
        let a = update_tweens(&mut m, 1.0, &mut |_, _| vec![("x".into(), 0.0)]);
        assert_eq!(value_of(&a, "x").unwrap(), 100.0);
        let b = update_tweens(&mut m, 0.25, &mut |_, _| vec![]);
        assert!((value_of(&b, "x").unwrap() - 75.0).abs() < 1e-3);
        let c = update_tweens(&mut m, 0.75, &mut |_, _| vec![]);
        assert_eq!(value_of(&c, "x").unwrap(), 0.0);
    }

    #[test]
    fn update_tweens_repeat_infinite() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            repeat: -1,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(opts));
        let repeats = Arc::new(AtomicUsize::new(0));
        let r = repeats.clone();
        let _g = connect_signal(
            &m.tweens[&1][0].on_repeat,
            Arc::new(move |_: &()| {
                r.fetch_add(1, Ordering::SeqCst);
            }),
            Default::default(),
        );
        update_tweens(&mut m, 1.0, &mut |_, _| vec![("x".into(), 0.0)]);
        update_tweens(&mut m, 1.0, &mut |_, _| vec![]);
        update_tweens(&mut m, 1.0, &mut |_, _| vec![]);
        assert_eq!(repeats.load(Ordering::SeqCst), 3);
        assert!(!m.tweens[&1][0].complete);
        assert_eq!(m.tweens[&1][0].repeat, -1);
    }

    #[test]
    fn update_tweens_snapping_rounds() {
        let mut m = create_tween_manager(None);
        let opts = TweenOptions {
            ease: Some(Arc::new(|t| t)),
            snapping: true,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(opts));
        let a = update_tweens(&mut m, 0.333, &mut |_, _| vec![("x".into(), 0.0)]);
        let v = value_of(&a, "x").unwrap();
        assert_eq!(v, v.round());
    }

    #[test]
    fn update_tweens_does_not_update_paused() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear()));
        pause_tween(&mut m.tweens.get_mut(&1).unwrap()[0]);
        let a = update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        assert!(value_of(&a, "x").is_none());
    }

    #[test]
    fn update_tweens_resumes_after_pause() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear()));
        pause_tween(&mut m.tweens.get_mut(&1).unwrap()[0]);
        update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        resume_tween(&mut m.tweens.get_mut(&1).unwrap()[0]);
        let a = update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        assert!((value_of(&a, "x").unwrap() - 50.0).abs() < 1e-3);
    }

    #[test]
    fn update_tweens_elapsed_does_not_accumulate_while_paused() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear()));
        pause_tween(&mut m.tweens.get_mut(&1).unwrap()[0]);
        update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        assert_eq!(m.tweens[&1][0].elapsed, 0.0);
        resume_tween(&mut m.tweens.get_mut(&1).unwrap()[0]);
        let a = update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        assert!((value_of(&a, "x").unwrap() - 50.0).abs() < 1e-3);
    }
}
