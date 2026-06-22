//! Tween creation and control functions.
//!
//! In Rust, `Tween` is not generic over the target type: the target is
//! identified by a raw pointer cast to `u64`, and the property map is
//! represented as `Vec<TweenPropertyDetail>` with string keys. Callers apply
//! updated values from `TweenPropertyDetail` back to their own data.
//!
//! Each `TweenPropertyDetail` is created with its `change` field pre-seeded to
//! the desired end value; `initialize_tween` later converts that to a delta
//! against the snapshotted start value.
//!
//! `create_tween` inserts the tween into the manager and returns the index
//! within `manager.tweens[target_ptr]` at which the tween was placed.
//! Callers that need to interact with a specific tween post-creation should
//! hold onto the `(target_ptr, index)` pair, or use `stop_tweens` /
//! `pause_tweens` by target.

use flighthq_signals::emit_signal;
use flighthq_types::{StopTweenOptions, Tween, TweenManager, TweenOptions, TweenPropertyDetail};

use crate::internal::initialize_tween;

/// Apply a property map immediately to the target (no animation).
///
/// Stops any active tweens on the same target that overlap the given property
/// keys before applying. `target_ptr` is the target object's address cast to
/// `u64`, used as a map key. `properties` is a list of `(key, value)` pairs.
///
/// The caller is responsible for writing the property values to the actual
/// target object; this function only stops the conflicting tweens.
pub fn apply_tween(manager: &mut TweenManager, target_ptr: u64, properties: &[(String, f32)]) {
    let keys: Vec<String> = properties.iter().map(|(k, _)| k.clone()).collect();
    stop_tweens(manager, target_ptr, Some(&keys), None);
}

/// Create and register a tween on `target_ptr` for the given `duration` (seconds).
///
/// `target_ptr` is the target object address cast to `u64`, used as the map key.
/// `goals` is a list of `(property_key, end_value)` pairs. Each goal's end value
/// is pre-seeded into the property's `change` field, becoming a delta once the
/// tween is initialized against the target's snapshotted start values.
///
/// When `options.overwrite` is `true` (the default), any existing tweens on
/// the same target that share a property key are marked complete before the
/// new tween is registered.
///
/// Returns the index within `manager.tweens[target_ptr]` at which the new
/// tween was inserted.
pub fn create_tween(
    manager: &mut TweenManager,
    target_ptr: u64,
    duration: f32,
    goals: Vec<(String, f32)>,
    options: Option<TweenOptions>,
) -> usize {
    let overwrite = options.as_ref().map(|o| o.overwrite).unwrap_or(true);
    let tween = make_tween(manager, duration, goals, options);
    register_tween(manager, target_ptr, tween, overwrite)
}

/// Pause all tweens in the manager.
pub fn pause_all_tweens(manager: &mut TweenManager) {
    for list in manager.tweens.values_mut() {
        for tween in list.iter_mut() {
            tween.paused = true;
        }
    }
}

/// Pause a single tween.
pub fn pause_tween(tween: &mut Tween) {
    tween.paused = true;
}

/// Pause all tweens for a specific target.
pub fn pause_tweens(manager: &mut TweenManager, target_ptr: u64) {
    if let Some(list) = manager.tweens.get_mut(&target_ptr) {
        for tween in list.iter_mut() {
            tween.paused = true;
        }
    }
}

/// Remove all tweens from the manager without completing them.
pub fn reset_all_tweens(manager: &mut TweenManager) {
    manager.tweens.clear();
}

/// Resume all tweens in the manager.
pub fn resume_all_tweens(manager: &mut TweenManager) {
    for list in manager.tweens.values_mut() {
        for tween in list.iter_mut() {
            tween.paused = false;
        }
    }
}

/// Resume a single tween.
pub fn resume_tween(tween: &mut Tween) {
    tween.paused = false;
}

/// Resume all tweens for a specific target.
pub fn resume_tweens(manager: &mut TweenManager, target_ptr: u64) {
    if let Some(list) = manager.tweens.get_mut(&target_ptr) {
        for tween in list.iter_mut() {
            tween.paused = false;
        }
    }
}

/// Stop all tweens in the manager.
///
/// Returns the per-target final property values applied when
/// `options.complete` is `true`; empty otherwise. Each entry is
/// `(target_ptr, key, value)`.
pub fn stop_all_tweens(
    manager: &mut TweenManager,
    options: Option<&StopTweenOptions>,
) -> Vec<(u64, String, f32)> {
    let mut applied = Vec::new();
    for (target, list) in manager.tweens.iter_mut() {
        for tween in list.iter_mut() {
            for (key, value) in stop_tween(tween, options) {
                applied.push((*target, key, value));
            }
        }
    }
    applied
}

/// Stop a single tween, optionally snapping it to its final or initial values.
///
/// Returns the final `(key, value)` pairs applied to the target when
/// `options.complete` is `true`; an empty `Vec` otherwise.
///
/// A `complete` stop only produces correct values when the tween has already
/// been initialized (or starts from `0`), since Rust cannot snapshot the
/// target's current values here. Already-running tweens carry their `start`
/// values, so this is the common case.
pub fn stop_tween(tween: &mut Tween, options: Option<&StopTweenOptions>) -> Vec<(String, f32)> {
    let do_complete = options.map(|o| o.complete).unwrap_or(false);
    let do_send_event = options.map(|o| o.send_event).unwrap_or(true);

    let mut applied = Vec::new();
    if do_complete {
        if !tween.initialized {
            // No current values available; treat start as 0 and `change` as the
            // pre-seeded end value (delta from 0).
            initialize_tween(tween, &[]);
        }
        let effective_t = if tween.reverse { 0.0 } else { 1.0 };
        let eased_t = (tween.ease)(effective_t);
        for detail in &tween.properties {
            let mut value = detail.start + detail.change * eased_t;
            if tween.snapping {
                value = value.round();
            }
            applied.push((detail.key.clone(), value));
        }
        if do_send_event {
            emit_signal(&tween.on_complete, &());
        }
    }

    tween.complete = true;
    applied
}

/// Stop all tweens for a specific target, optionally filtered by property set.
///
/// `property_filter` when `Some`, restricts stopping to tweens that overlap the
/// given keys. When `None`, all tweens on the target are stopped.
///
/// Returns the final `(target_ptr, key, value)` triples applied when
/// `options.complete` is `true`; empty otherwise.
pub fn stop_tweens(
    manager: &mut TweenManager,
    target_ptr: u64,
    property_filter: Option<&[String]>,
    options: Option<&StopTweenOptions>,
) -> Vec<(u64, String, f32)> {
    let mut applied = Vec::new();
    let Some(list) = manager.tweens.get_mut(&target_ptr) else {
        return applied;
    };
    for tween in list.iter_mut() {
        if let Some(filter) = property_filter {
            let overlaps = tween
                .properties
                .iter()
                .any(|d| filter.iter().any(|k| *k == d.key));
            if !overlaps {
                continue;
            }
        }
        for (key, value) in stop_tween(tween, options) {
            applied.push((target_ptr, key, value));
        }
    }
    applied
}

fn make_tween(
    manager: &TweenManager,
    duration: f32,
    goals: Vec<(String, f32)>,
    options: Option<TweenOptions>,
) -> Tween {
    // Pre-seed each property's `change` field with the desired end value.
    let properties: Vec<TweenPropertyDetail> = goals
        .into_iter()
        .map(|(key, end)| TweenPropertyDetail {
            change: end,
            key,
            start: 0.0,
        })
        .collect();

    let mut tween = Tween {
        duration,
        properties,
        ..Tween::default()
    };

    if let Some(options) = options {
        if let Some(delay) = options.delay {
            tween.delay = delay;
        }
        tween.ease = options
            .ease
            .unwrap_or_else(|| std::sync::Arc::clone(&manager.default_ease));
        tween.reflect = options.reflect;
        tween.repeat = options.repeat;
        tween.reverse = options.reverse;
        tween.smart_rotation = options.smart_rotation;
        tween.snapping = options.snapping;
    } else {
        tween.ease = std::sync::Arc::clone(&manager.default_ease);
    }

    tween
}

fn register_tween(
    manager: &mut TweenManager,
    target_ptr: u64,
    tween: Tween,
    overwrite: bool,
) -> usize {
    let list = manager.tweens.entry(target_ptr).or_default();
    if overwrite {
        let new_keys: Vec<&str> = tween.properties.iter().map(|d| d.key.as_str()).collect();
        for existing in list.iter_mut() {
            let overlaps = existing
                .properties
                .iter()
                .any(|d| new_keys.contains(&d.key.as_str()));
            if overlaps {
                existing.complete = true;
            }
        }
    }
    list.push(tween);
    list.len() - 1
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tween_manager::create_tween_manager;
    use crate::update_tweens::update_tweens;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use flighthq_signals::connect_signal;

    fn linear_opts() -> TweenOptions {
        TweenOptions {
            ease: Some(Arc::new(|t| t)),
            overwrite: true,
            ..Default::default()
        }
    }

    #[test]
    fn apply_tween_stops_conflicting_tweens() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        apply_tween(&mut m, 1, &[("x".into(), 50.0)]);
        assert!(m.tweens[&1][0].complete);
    }

    #[test]
    fn create_tween_inserts_into_manager() {
        let mut m = create_tween_manager(None);
        let idx = create_tween(&mut m, 1, 1.0, vec![], None);
        assert_eq!(idx, 0);
        assert_eq!(m.tweens.get(&1).map(|v| v.len()), Some(1));
    }

    #[test]
    fn create_tween_overwrite_true_stops_existing_overlap() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 200.0)], None);
        assert!(m.tweens[&1][0].complete);
    }

    #[test]
    fn create_tween_overwrite_false_keeps_existing() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        let opts = TweenOptions {
            overwrite: false,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 200.0)], Some(opts));
        assert!(!m.tweens[&1][0].complete);
    }

    #[test]
    fn create_tween_non_overlapping_not_stopped() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        create_tween(&mut m, 1, 1.0, vec![("y".into(), 200.0)], None);
        assert!(!m.tweens[&1][0].complete);
    }

    #[test]
    fn create_tween_defaults() {
        let mut m = create_tween_manager(None);
        let idx = create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        let t = &m.tweens[&1][idx];
        assert!(!t.complete);
        assert_eq!(t.elapsed, 0.0);
        assert!(!t.paused);
        assert_eq!(t.repeat, 0);
        assert!(!t.reflect);
        assert!(!t.reverse);
        assert!(!t.smart_rotation);
        assert!(!t.snapping);
    }

    #[test]
    fn create_tween_preallocates_properties() {
        let mut m = create_tween_manager(None);
        let idx = create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0), ("y".into(), 200.0)], None);
        let keys: Vec<&str> = m.tweens[&1][idx]
            .properties
            .iter()
            .map(|p| p.key.as_str())
            .collect();
        assert_eq!(m.tweens[&1][idx].properties.len(), 2);
        assert!(keys.contains(&"x"));
        assert!(keys.contains(&"y"));
    }

    #[test]
    fn pause_all_tweens_pauses_every_tween() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![], None);
        create_tween(&mut m, 2, 2.0, vec![], None);
        pause_all_tweens(&mut m);
        for list in m.tweens.values() {
            for t in list {
                assert!(t.paused);
            }
        }
    }

    #[test]
    fn pause_tween_sets_paused() {
        let mut t = Tween::default();
        pause_tween(&mut t);
        assert!(t.paused);
    }

    #[test]
    fn pause_tweens_pauses_only_target() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![], None);
        create_tween(&mut m, 2, 1.0, vec![], None);
        pause_tweens(&mut m, 1);
        assert!(m.tweens[&1][0].paused);
        assert!(!m.tweens[&2][0].paused);
    }

    #[test]
    fn reset_all_tweens_clears_without_completing() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        reset_all_tweens(&mut m);
        assert_eq!(m.tweens.len(), 0);
    }

    #[test]
    fn resume_all_tweens_clears_paused() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![], None);
        pause_all_tweens(&mut m);
        resume_all_tweens(&mut m);
        for list in m.tweens.values() {
            for t in list {
                assert!(!t.paused);
            }
        }
    }

    #[test]
    fn resume_tween_clears_paused() {
        let mut t = Tween::default();
        pause_tween(&mut t);
        resume_tween(&mut t);
        assert!(!t.paused);
    }

    #[test]
    fn resume_tweens_resumes_only_target() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![], None);
        pause_tweens(&mut m, 1);
        resume_tweens(&mut m, 1);
        assert!(!m.tweens[&1][0].paused);
    }

    #[test]
    fn stop_all_tweens_marks_complete() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        stop_all_tweens(&mut m, None);
        assert!(m.tweens[&1][0].complete);
    }

    #[test]
    fn stop_tween_marks_complete() {
        let mut t = Tween::default();
        stop_tween(&mut t, None);
        assert!(t.complete);
    }

    #[test]
    fn stop_tween_does_not_jump_to_end_by_default() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear_opts()));
        let deltas = update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        let x = deltas.iter().find(|(_, k, _)| k == "x").unwrap().2;
        assert!((x - 50.0).abs() < 1e-3);
        // stop without complete returns no applied values.
        let applied = stop_tween(&mut m.tweens.get_mut(&1).unwrap()[0], None);
        assert!(applied.is_empty());
    }

    #[test]
    fn stop_tween_complete_jumps_to_end() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], Some(linear_opts()));
        update_tweens(&mut m, 0.5, &mut |_, _| vec![("x".into(), 0.0)]);
        let opts = StopTweenOptions {
            complete: true,
            send_event: true,
        };
        let applied = stop_tween(&mut m.tweens.get_mut(&1).unwrap()[0], Some(&opts));
        assert_eq!(applied[0].1, 100.0);
    }

    #[test]
    fn stop_tween_complete_fires_on_complete() {
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
        let opts = StopTweenOptions {
            complete: true,
            send_event: true,
        };
        stop_tween(&mut m.tweens.get_mut(&1).unwrap()[0], Some(&opts));
        assert_eq!(fired.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn stop_tween_complete_send_event_false_suppresses() {
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
        let opts = StopTweenOptions {
            complete: true,
            send_event: false,
        };
        let applied = stop_tween(&mut m.tweens.get_mut(&1).unwrap()[0], Some(&opts));
        assert_eq!(fired.load(Ordering::SeqCst), 0);
        assert_eq!(applied[0].1, 100.0);
    }

    #[test]
    fn stop_tweens_stops_all_for_target() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        let opts = TweenOptions {
            overwrite: false,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("y".into(), 100.0)], Some(opts));
        stop_tweens(&mut m, 1, None, None);
        assert!(m.tweens[&1][0].complete);
        assert!(m.tweens[&1][1].complete);
    }

    #[test]
    fn stop_tweens_filters_by_property() {
        let mut m = create_tween_manager(None);
        create_tween(&mut m, 1, 1.0, vec![("x".into(), 100.0)], None);
        let opts = TweenOptions {
            overwrite: false,
            ..Default::default()
        };
        create_tween(&mut m, 1, 1.0, vec![("y".into(), 100.0)], Some(opts));
        let filter = vec!["x".to_string()];
        stop_tweens(&mut m, 1, Some(&filter), None);
        assert!(m.tweens[&1][0].complete);
        assert!(!m.tweens[&1][1].complete);
    }
}
