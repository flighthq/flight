use flight_entity::Ref;
use flight_signals::emit_signal;

use crate::internal::{add_tween_to_manager, initialize_tween, make_tween};
use crate::tween_manager::default_manager;
use crate::types::{
    ErasedTweenHandle, StopTweenOptions, Tween, TweenContext, TweenManager, TweenOptions,
    TweenProp, erased_has_property, target_key_from_ref,
};

pub fn create_tween<T: Send + Sync + 'static>(
    manager: &TweenManager,
    target: &Ref<T>,
    duration: f32,
    props: &[TweenProp<T>],
    options: Option<&TweenOptions>,
) -> Tween<T> {
    let default_ease = manager.data.read().unwrap().default_ease;
    let tween = make_tween(target, duration, props, options, default_ease);
    let overwrite = options.and_then(|o| o.overwrite).unwrap_or(true);
    let handle = tween.to_erased();
    add_tween_to_manager(manager, &handle, overwrite, None, None);
    return tween;
}

// flight-lint: allow(conform-extra) D5 explicit-context form of the TS createTween overload using the module default manager
pub fn create_tween_default<T: Send + Sync + 'static>(
    context: &TweenContext,
    target: &Ref<T>,
    duration: f32,
    props: &[TweenProp<T>],
    options: Option<&TweenOptions>,
) -> Tween<T> {
    let manager = default_manager(context);
    return create_tween(&manager, target, duration, props, options);
}

// flight-lint: allow(conform-params) D22 TweenProp<T> fn-pointer accessors replace TS NumericProps<T> property_map
pub fn apply_tween<T: Send + Sync + 'static>(
    manager: &TweenManager,
    target: &Ref<T>,
    props: &[TweenProp<T>],
) {
    let key = target_key_from_ref(target);
    stop_tweens_by_key(manager, key, Some(props), None);
    let mut t = target.write().unwrap();
    for prop in props {
        *(prop.get)(&mut t) = prop.to;
    }
}

pub fn get_active_tween_count(manager: &TweenManager) -> usize {
    let manager_data = manager.data.read().unwrap();
    let mut count = 0;
    for (_, list) in manager_data.tweens.iter() {
        count += list.len();
    }
    return count;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn get_tween_delay<T: Send + Sync + 'static>(tween: &Tween<T>) -> f32 {
    return tween.data.read().unwrap().common.delay;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn get_tween_duration<T: Send + Sync + 'static>(tween: &Tween<T>) -> f32 {
    return tween.data.read().unwrap().common.duration;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn get_tween_elapsed<T: Send + Sync + 'static>(tween: &Tween<T>) -> f32 {
    return tween.data.read().unwrap().common.elapsed;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn get_tween_on_complete<T: Send + Sync + 'static>(
    tween: &Tween<T>,
) -> flight_signals::Signal<()> {
    return tween.data.read().unwrap().common.on_complete.clone();
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn get_tween_on_repeat<T: Send + Sync + 'static>(
    tween: &Tween<T>,
) -> flight_signals::Signal<()> {
    return tween.data.read().unwrap().common.on_repeat.clone();
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn get_tween_on_update<T: Send + Sync + 'static>(
    tween: &Tween<T>,
) -> flight_signals::Signal<()> {
    return tween.data.read().unwrap().common.on_update.clone();
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn get_tween_on_yoyo<T: Send + Sync + 'static>(tween: &Tween<T>) -> flight_signals::Signal<()> {
    return tween.data.read().unwrap().common.on_yoyo.clone();
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn get_tween_property_keys<T: Send + Sync + 'static>(tween: &Tween<T>) -> Vec<String> {
    return tween.data.read().unwrap().ops.property_keys();
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn get_tween_repeat<T: Send + Sync + 'static>(tween: &Tween<T>) -> i32 {
    return tween.data.read().unwrap().common.repeat;
}

pub fn get_tweens_of<T: Send + Sync + 'static>(
    manager: &TweenManager,
    target: &Ref<T>,
) -> Vec<Tween<T>> {
    let key = target_key_from_ref(target);
    let manager_data = manager.data.read().unwrap();
    return manager_data
        .tweens
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, list)| list.iter().map(|h| Tween::new(h.data.clone())).collect())
        .unwrap_or_default();
}

pub fn has_tweens_of<T: Send + Sync + 'static>(manager: &TweenManager, target: &Ref<T>) -> bool {
    let key = target_key_from_ref(target);
    let manager_data = manager.data.read().unwrap();
    return match manager_data.tweens.iter().find(|(k, _)| *k == key) {
        Some((_, list)) => !list.is_empty(),
        None => false,
    };
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn is_tween_complete<T: Send + Sync + 'static>(tween: &Tween<T>) -> bool {
    return tween.data.read().unwrap().common.complete;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn is_tween_initialized<T: Send + Sync + 'static>(tween: &Tween<T>) -> bool {
    return tween.data.read().unwrap().common.initialized;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn is_tween_paused<T: Send + Sync + 'static>(tween: &Tween<T>) -> bool {
    return tween.data.read().unwrap().common.paused;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn is_tween_reflect<T: Send + Sync + 'static>(tween: &Tween<T>) -> bool {
    return tween.data.read().unwrap().common.reflect;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn is_tween_reverse<T: Send + Sync + 'static>(tween: &Tween<T>) -> bool {
    return tween.data.read().unwrap().common.reverse;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn is_tween_smart_rotation<T: Send + Sync + 'static>(tween: &Tween<T>) -> bool {
    return tween.data.read().unwrap().common.smart_rotation;
}

// flight-lint: allow(conform-extra) D18 free-function accessor backing Tween<T> sugar method
pub fn is_tween_snapping<T: Send + Sync + 'static>(tween: &Tween<T>) -> bool {
    return tween.data.read().unwrap().common.snapping;
}

pub fn kill_tweens_of_property(manager: &TweenManager, key: &str) {
    let manager_data = manager.data.read().unwrap();
    for (_, list) in manager_data.tweens.iter() {
        for handle in list.iter() {
            if erased_has_property(handle, key) {
                handle.data.write().unwrap().common.complete = true;
            }
        }
    }
}

pub fn pause_all_tweens(manager: &TweenManager) {
    let manager_data = manager.data.read().unwrap();
    for (_, list) in manager_data.tweens.iter() {
        for handle in list.iter() {
            handle.data.write().unwrap().common.paused = true;
        }
    }
}

pub fn pause_tween<T: Send + Sync + 'static>(tween: &Tween<T>) {
    tween.data.write().unwrap().common.paused = true;
}

pub fn pause_tweens<T: Send + Sync + 'static>(manager: &TweenManager, target: &Ref<T>) {
    let key = target_key_from_ref(target);
    let manager_data = manager.data.read().unwrap();
    if let Some((_, list)) = manager_data.tweens.iter().find(|(k, _)| *k == key) {
        for handle in list.iter() {
            handle.data.write().unwrap().common.paused = true;
        }
    }
}

pub fn reset_all_tweens(manager: &TweenManager) {
    manager.data.write().unwrap().tweens.clear();
}

pub fn resume_all_tweens(manager: &TweenManager) {
    let manager_data = manager.data.read().unwrap();
    for (_, list) in manager_data.tweens.iter() {
        for handle in list.iter() {
            handle.data.write().unwrap().common.paused = false;
        }
    }
}

pub fn resume_tween<T: Send + Sync + 'static>(tween: &Tween<T>) {
    tween.data.write().unwrap().common.paused = false;
}

pub fn resume_tweens<T: Send + Sync + 'static>(manager: &TweenManager, target: &Ref<T>) {
    let key = target_key_from_ref(target);
    let manager_data = manager.data.read().unwrap();
    if let Some((_, list)) = manager_data.tweens.iter().find(|(k, _)| *k == key) {
        for handle in list.iter() {
            handle.data.write().unwrap().common.paused = false;
        }
    }
}

pub fn stop_all_tweens(manager: &TweenManager, options: Option<&StopTweenOptions>) {
    let all_handles: Vec<ErasedTweenHandle> = {
        let md = manager.data.read().unwrap();
        md.tweens
            .iter()
            .flat_map(|(_, list)| list.iter().cloned())
            .collect()
    };
    for handle in &all_handles {
        stop_tween_erased(handle, options);
    }
}

pub fn stop_tween<T: Send + Sync + 'static>(tween: &Tween<T>, options: Option<&StopTweenOptions>) {
    stop_tween_erased(&tween.to_erased(), options);
}

pub(crate) fn stop_tween_erased(handle: &ErasedTweenHandle, options: Option<&StopTweenOptions>) {
    let do_complete = options.and_then(|o| o.complete).unwrap_or(false);
    let do_send_event = options.and_then(|o| o.send_event).unwrap_or(true);

    if do_complete {
        {
            let inner = handle.data.read().unwrap();
            if !inner.common.initialized {
                drop(inner);
                initialize_tween(handle);
            }
        }

        let on_complete = {
            let inner = handle.data.read().unwrap();
            let effective_t = if inner.common.reverse { 0.0 } else { 1.0 };
            let eased_t = (inner.common.ease)(effective_t);
            inner.ops.write_values(eased_t, inner.common.snapping);
            inner.common.on_complete.clone()
        };

        if do_send_event {
            emit_signal(&on_complete, &());
        }
    }

    handle.data.write().unwrap().common.complete = true;
}

// flight-lint: allow(conform-params) D22 TweenProp<T> fn-pointer accessors replace TS NumericProps<T> property_map
pub fn stop_tweens<T: Send + Sync + 'static>(
    manager: &TweenManager,
    target: &Ref<T>,
    props: Option<&[TweenProp<T>]>,
    options: Option<&StopTweenOptions>,
) {
    let key = target_key_from_ref(target);
    stop_tweens_by_key(manager, key, props, options);
}

fn stop_tweens_by_key<T: Send + Sync + 'static>(
    manager: &TweenManager,
    key: usize,
    props: Option<&[TweenProp<T>]>,
    options: Option<&StopTweenOptions>,
) {
    let handles: Vec<ErasedTweenHandle> = {
        let manager_data = manager.data.read().unwrap();
        match manager_data.tweens.iter().find(|(k, _)| *k == key) {
            Some((_, list)) => list.clone(),
            None => return,
        }
    };

    for handle in handles.iter() {
        if let Some(props) = props {
            let mut overlaps = false;
            for p in props {
                if erased_has_property(handle, p.key) {
                    overlaps = true;
                    break;
                }
            }
            if !overlaps {
                continue;
            }
        }
        stop_tween_erased(handle, options);
    }
}
