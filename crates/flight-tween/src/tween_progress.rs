
use flight_signals::emit_signal;

use crate::internal::initialize_tween;
use crate::types::Tween;

/// Return the normalized playback progress of a tween in the range 0..1.
/// Returns 0 if the tween is still in its delay phase; returns 1 when complete.
/// Does not account for repeat; each cycle starts at 0 and ends at 1.
pub fn get_tween_progress(tween: &Tween) -> f32 {
    let td = tween.data.borrow();
    if td.complete {
        return 1.0;
    }
    let active_elapsed = td.elapsed - td.delay;
    if active_elapsed <= 0.0 {
        return 0.0;
    }
    return (active_elapsed / td.duration).min(1.0);
}

/// Drop all captured start values so the next update re-captures them from the current
/// target state. Equivalent to GSAP `invalidate()`. Resets elapsed and complete state.
pub fn invalidate_tween(tween: &Tween) {
    let mut td = tween.data.borrow_mut();
    td.initialized = false;
    td.complete = false;
    td.elapsed = 0.0;
}

/// Rewind and replay a tween from the beginning. Re-initializes start values from the
/// current target state. Optionally keeps the initial delay.
pub fn restart_tween(tween: &Tween, include_delay: bool) {
    let mut td = tween.data.borrow_mut();
    td.initialized = false;
    td.complete = false;
    td.elapsed = if include_delay { 0.0 } else { td.delay };
}

/// Jump the tween to an absolute elapsed time and immediately apply the resulting
/// property values to the target. The time is measured from the start of the tween
/// (before any delay). Clamps to 0..delay+duration.
///
/// This is alias-safe: all input values are read before any writes occur.
pub fn seek_tween(tween: &Tween, time_seconds: f32) {
    if !tween.data.borrow().initialized {
        initialize_tween(tween);
    }

    let (max_elapsed, delay, duration, reverse, ease, snapping, properties_snapshot, target, on_update, on_complete) = {
        let td = tween.data.borrow();
        (
            td.delay + td.duration,
            td.delay,
            td.duration,
            td.reverse,
            td.ease,
            td.snapping,
            td.properties.clone(),
            td.target.clone(),
            td.on_update.clone(),
            td.on_complete.clone(),
        )
    };

    let clamped_elapsed = time_seconds.max(0.0).min(max_elapsed);
    tween.data.borrow_mut().elapsed = clamped_elapsed;

    let active_elapsed = clamped_elapsed - delay;
    if active_elapsed <= 0.0 {
        return;
    }

    let t = (active_elapsed / duration).min(1.0);
    let effective_t = if reverse { 1.0 - t } else { t };
    let eased_t = ease(effective_t);

    // Compute writes (alias-safe: read all before writing)
    let writes: Vec<(String, f32)> = properties_snapshot
        .iter()
        .map(|detail| {
            let mut value = detail.start + detail.change * eased_t;
            if snapping {
                value = value.round();
            }
            (detail.key.clone(), value)
        })
        .collect();

    // Write to target
    {
        let mut target_props = target.props.write().unwrap();
        for (key, value) in &writes {
            target_props.insert(key.clone(), *value);
        }
    }

    emit_signal(&on_update, &());

    if t >= 1.0 && !tween.data.borrow().complete {
        tween.data.borrow_mut().complete = true;
        emit_signal(&on_complete, &());
    }
}

/// Set the normalized progress of a tween to a value in 0..1 and immediately apply
/// the resulting property values to the target. Safe to call before the delay has elapsed.
///
/// This is alias-safe: all input values are read before any writes occur.
pub fn set_tween_progress(tween: &Tween, progress: f32) {
    let clamped = progress.max(0.0).min(1.0);
    let (delay, duration) = {
        let td = tween.data.borrow();
        (td.delay, td.duration)
    };
    let target_elapsed = delay + clamped * duration;
    seek_tween(tween, target_elapsed);
}
