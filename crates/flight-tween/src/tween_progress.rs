//! flight-compiler: target-native

// flight-lint: allow-file(contract-vocabulary) D22 Tween<T> requires T: ?Sized + Send + Sync + 'static for Arc<RwLock<>> thread-safety
use flight_signals::emit_signal;

use crate::internal::{get_tween_normalized_progress, initialize_tween};
use crate::types::{ErasedTweenHandle, Tween, erase_tween_handle, write_tween_ops_values};

// flight-lint: allow(f32) normalized 0-1 tween progress (bounded)
pub fn get_tween_progress<T: ?Sized + Send + Sync + 'static>(tween: &Tween<T>) -> f32 {
    return get_tween_progress_erased(&erase_tween_handle(tween));
}

// flight-lint: allow(f32) normalized 0-1 tween progress (bounded)
pub(crate) fn get_tween_progress_erased(handle: &ErasedTweenHandle) -> f32 {
    let inner = handle.data.read().unwrap();
    if inner.common.complete {
        return 1.0;
    }
    let active_elapsed = inner.common.elapsed - inner.common.delay;
    if active_elapsed <= 0.0 {
        return 0.0;
    }
    return get_tween_normalized_progress(active_elapsed, inner.common.duration);
}

pub fn invalidate_tween<T: ?Sized + Send + Sync + 'static>(tween: &Tween<T>) {
    invalidate_tween_erased(&erase_tween_handle(tween));
}

pub(crate) fn invalidate_tween_erased(handle: &ErasedTweenHandle) {
    let mut inner = handle.data.write().unwrap();
    inner.common.initialized = false;
    inner.common.complete = false;
    inner.common.elapsed = 0.0;
}

pub fn restart_tween<T: ?Sized + Send + Sync + 'static>(tween: &Tween<T>, include_delay: bool) {
    restart_tween_erased(&erase_tween_handle(tween), include_delay);
}

pub(crate) fn restart_tween_erased(handle: &ErasedTweenHandle, include_delay: bool) {
    let mut inner = handle.data.write().unwrap();
    inner.common.initialized = false;
    inner.common.complete = false;
    inner.common.elapsed = if include_delay {
        0.0
    } else {
        inner.common.delay
    };
}

pub fn seek_tween<T: ?Sized + Send + Sync + 'static>(tween: &Tween<T>, time_seconds: f64) {
    seek_tween_erased(&erase_tween_handle(tween), time_seconds);
}

pub(crate) fn seek_tween_erased(handle: &ErasedTweenHandle, time_seconds: f64) {
    if !handle.data.read().unwrap().common.initialized {
        initialize_tween(handle);
    }

    let (max_elapsed, delay, duration, reverse, ease, snapping, on_update, on_complete) = {
        let inner = handle.data.read().unwrap();
        (
            inner.common.delay + inner.common.duration,
            inner.common.delay,
            inner.common.duration,
            inner.common.reverse,
            inner.common.ease,
            inner.common.snapping,
            inner.common.on_update.clone(),
            inner.common.on_complete.clone(),
        )
    };

    let clamped_elapsed = time_seconds.max(0.0).min(max_elapsed);
    handle.data.write().unwrap().common.elapsed = clamped_elapsed;

    let active_elapsed = clamped_elapsed - delay;
    if active_elapsed <= 0.0 {
        return;
    }

    let t = get_tween_normalized_progress(active_elapsed, duration);
    let effective_t = if reverse { 1.0 - t } else { t };
    let eased_t = ease(effective_t);

    {
        let inner = handle.data.read().unwrap();
        write_tween_ops_values(&inner, eased_t, snapping);
    }

    emit_signal(&on_update, &());

    if t >= 1.0 && !handle.data.read().unwrap().common.complete {
        handle.data.write().unwrap().common.complete = true;
        emit_signal(&on_complete, &());
    }
}

// flight-lint: allow(f32) normalized 0-1 tween progress (bounded)
pub fn set_tween_progress<T: ?Sized + Send + Sync + 'static>(tween: &Tween<T>, progress: f32) {
    set_tween_progress_erased(&erase_tween_handle(tween), progress);
}

// flight-lint: allow(f32) normalized 0-1 tween progress (bounded)
pub(crate) fn set_tween_progress_erased(handle: &ErasedTweenHandle, progress: f32) {
    let clamped = progress.max(0.0).min(1.0);
    let (delay, duration) = {
        let inner = handle.data.read().unwrap();
        (inner.common.delay, inner.common.duration)
    };
    let target_elapsed = delay + f64::from(clamped) * duration;
    seek_tween_erased(handle, target_elapsed);
}
