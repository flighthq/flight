
use flight_signals::emit_signal;

use crate::internal::initialize_tween;
use crate::types::Tween;

pub fn get_tween_progress(tween: &Tween) -> f32 {
    let td = tween.data.read().unwrap();
    if td.complete {
        return 1.0;
    }
    let active_elapsed = td.elapsed - td.delay;
    if active_elapsed <= 0.0 {
        return 0.0;
    }
    return (active_elapsed / td.duration).min(1.0);
}

pub fn invalidate_tween(tween: &Tween) {
    let mut td = tween.data.write().unwrap();
    td.initialized = false;
    td.complete = false;
    td.elapsed = 0.0;
}

pub fn restart_tween(tween: &Tween, include_delay: bool) {
    let mut td = tween.data.write().unwrap();
    td.initialized = false;
    td.complete = false;
    td.elapsed = if include_delay { 0.0 } else { td.delay };
}

pub fn seek_tween(tween: &Tween, time_seconds: f32) {
    if !tween.data.read().unwrap().initialized {
        initialize_tween(tween);
    }

    let (max_elapsed, delay, duration, reverse, ease, snapping, properties_snapshot, target, on_update, on_complete) = {
        let td = tween.data.read().unwrap();
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
    tween.data.write().unwrap().elapsed = clamped_elapsed;

    let active_elapsed = clamped_elapsed - delay;
    if active_elapsed <= 0.0 {
        return;
    }

    let t = (active_elapsed / duration).min(1.0);
    let effective_t = if reverse { 1.0 - t } else { t };
    let eased_t = ease(effective_t);

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

    {
        let mut target_props = target.props.write().unwrap();
        for (key, value) in &writes {
            target_props.insert(key.clone(), *value);
        }
    }

    emit_signal(&on_update, &());

    if t >= 1.0 && !tween.data.read().unwrap().complete {
        tween.data.write().unwrap().complete = true;
        emit_signal(&on_complete, &());
    }
}

pub fn set_tween_progress(tween: &Tween, progress: f32) {
    let clamped = progress.max(0.0).min(1.0);
    let (delay, duration) = {
        let td = tween.data.read().unwrap();
        (td.delay, td.duration)
    };
    let target_elapsed = delay + clamped * duration;
    seek_tween(tween, target_elapsed);
}
