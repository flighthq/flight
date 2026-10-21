use flight_signals::emit_signal;

use crate::internal::initialize_tween;
use crate::types::{ErasedTweenHandle, Tween, TweenManager};

pub fn complete_tween<T: Send + Sync + 'static>(tween: &Tween<T>) {
    complete_tween_erased(&tween.to_erased());
}

pub(crate) fn complete_tween_erased(handle: &ErasedTweenHandle) {
    if handle.data.read().unwrap().common.complete {
        return;
    }
    if !handle.data.read().unwrap().common.initialized {
        initialize_tween(handle);
    }

    let on_complete = {
        let inner = handle.data.read().unwrap();
        let effective_t = if inner.common.reverse { 0.0 } else { 1.0 };
        let eased_t = (inner.common.ease)(effective_t);
        inner.ops.write_values(eased_t, inner.common.snapping);
        inner.common.on_complete.clone()
    };

    handle.data.write().unwrap().common.complete = true;
    emit_signal(&on_complete, &());
}

fn update_tween(handle: &ErasedTweenHandle, delta_time: f32) {
    if handle.data.read().unwrap().common.paused || handle.data.read().unwrap().common.complete {
        return;
    }

    handle.data.write().unwrap().common.elapsed += delta_time;

    let active_elapsed = {
        let inner = handle.data.read().unwrap();
        inner.common.elapsed - inner.common.delay
    };

    if active_elapsed <= 0.0 {
        return;
    }

    if !handle.data.read().unwrap().common.initialized {
        initialize_tween(handle);
    }

    let (t, on_update, on_complete, on_yoyo, on_repeat, repeat, reflect, reverse) = {
        let inner = handle.data.read().unwrap();
        let t = (active_elapsed / inner.common.duration).min(1.0);
        let effective_t = if inner.common.reverse { 1.0 - t } else { t };
        let eased_t = (inner.common.ease)(effective_t);
        inner.ops.write_values(eased_t, inner.common.snapping);
        (
            t,
            inner.common.on_update.clone(),
            inner.common.on_complete.clone(),
            inner.common.on_yoyo.clone(),
            inner.common.on_repeat.clone(),
            inner.common.repeat,
            inner.common.reflect,
            inner.common.reverse,
        )
    };

    emit_signal(&on_update, &());

    if t >= 1.0 {
        if repeat == 0 {
            handle.data.write().unwrap().common.complete = true;
            emit_signal(&on_complete, &());
        } else {
            if reflect {
                handle.data.write().unwrap().common.reverse = !reverse;
                emit_signal(&on_yoyo, &());
            }
            {
                let mut inner = handle.data.write().unwrap();
                inner.common.elapsed = inner.common.delay;
                if inner.common.repeat > 0 {
                    inner.common.repeat -= 1;
                }
            }
            emit_signal(&on_repeat, &());
        }
    }
}

pub fn update_tweens(manager: &TweenManager, delta_time: f32) {
    let target_keys: Vec<usize> = manager
        .data
        .read()
        .unwrap()
        .tweens
        .iter()
        .map(|(k, _)| *k)
        .collect();

    for key in target_keys {
        let list_len = match manager
            .data
            .read()
            .unwrap()
            .tweens
            .iter()
            .find(|(k, _)| *k == key)
        {
            Some((_, list)) => list.len(),
            None => continue,
        };

        let mut i = list_len as i32 - 1;
        while i >= 0 {
            let idx = i as usize;

            let handle = match manager
                .data
                .read()
                .unwrap()
                .tweens
                .iter()
                .find(|(k, _)| *k == key)
            {
                Some((_, list)) if idx < list.len() => list[idx].clone(),
                _ => {
                    i -= 1;
                    continue;
                }
            };

            if handle.data.read().unwrap().common.complete {
                if let Some((_, list)) = manager
                    .data
                    .write()
                    .unwrap()
                    .tweens
                    .iter_mut()
                    .find(|(k, _)| *k == key)
                {
                    if idx < list.len() {
                        list.remove(idx);
                    }
                }
            } else {
                update_tween(&handle, delta_time);
            }

            i -= 1;
        }

        let should_remove = manager
            .data
            .read()
            .unwrap()
            .tweens
            .iter()
            .find(|(k, _)| *k == key)
            .map_or(false, |(_k, l)| l.is_empty());
        if should_remove {
            manager
                .data
                .write()
                .unwrap()
                .tweens
                .retain(|(k, _)| *k != key);
        }
    }
}
