use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_signals::create_signal;

use crate::types::{
    EasingFunction, ErasedTweenHandle, ErasedTweenInner, ErasedTweenRef, PropertyState,
    TweenCommon, TweenManager, TweenOptions, TweenProp, Tween, TypedTweenOps,
    erased_has_property, erased_target_key,
};

pub(crate) fn initialize_tween(handle: &ErasedTweenHandle) {
    let mut inner = handle.data.write().unwrap();
    let smart_rotation = inner.common.smart_rotation;
    inner.ops.initialize(smart_rotation);
    inner.common.initialized = true;
}

pub(crate) fn add_tween_to_manager(
    manager: &TweenManager,
    handle: &ErasedTweenHandle,
    overwrite: bool,
    registration_target_key: Option<usize>,
    registration_property_keys: Option<&[String]>,
) {
    if let Some(keys) = registration_property_keys {
        handle.data.write().unwrap().registration_property_keys = Some(keys.to_vec());
    }

    let key = match registration_target_key {
        Some(k) => k,
        None => erased_target_key(handle),
    };

    let mut manager_data = manager.data.write().unwrap();
    let list = match manager_data.tweens.iter_mut().find(|(k, _)| *k == key) {
        Some((_, list)) => list,
        None => {
            manager_data.tweens.push((key, Vec::new()));
            &mut manager_data.tweens.last_mut().unwrap().1
        }
    };

    if overwrite {
        let keys_to_check: Vec<String> = match registration_property_keys {
            Some(keys) => keys.to_vec(),
            None => handle.data.read().unwrap().ops.property_keys(),
        };

        for i in (0..list.len()).rev() {
            let existing = &list[i];
            let mut overlaps = false;
            for k in &keys_to_check {
                if erased_has_property(existing, k) {
                    overlaps = true;
                    break;
                }
            }
            if overlaps {
                existing.data.write().unwrap().common.complete = true;
            }
        }
    }

    list.push(handle.clone());
}

pub fn make_tween<T: Send + Sync + 'static>(
    target: &Ref<T>,
    duration: f32,
    props: &[TweenProp<T>],
    options: Option<&TweenOptions>,
    default_ease: EasingFunction,
) -> Tween<T> {
    let ease = options.and_then(|o| o.ease).unwrap_or(default_ease);

    let properties: Vec<PropertyState<T>> = props
        .iter()
        .map(|p| PropertyState {
            get: p.get,
            key: p.key.to_string(),
            to: p.to,
            start: 0.0,
            change: 0.0,
        })
        .collect();

    let ops = TypedTweenOps {
        target: target.clone(),
        properties,
    };

    let inner: ErasedTweenRef = Arc::new(RwLock::new(ErasedTweenInner {
        common: TweenCommon {
            complete: false,
            delay: options.and_then(|o| o.delay).unwrap_or(0.0),
            duration,
            ease,
            elapsed: 0.0,
            initialized: false,
            on_complete: create_signal(),
            on_repeat: create_signal(),
            on_update: create_signal(),
            on_yoyo: create_signal(),
            paused: false,
            reflect: options.and_then(|o| o.reflect).unwrap_or(false),
            repeat: options.and_then(|o| o.repeat).unwrap_or(0),
            reverse: options.and_then(|o| o.reverse).unwrap_or(false),
            smart_rotation: options.and_then(|o| o.smart_rotation).unwrap_or(false),
            snapping: options.and_then(|o| o.snapping).unwrap_or(false),
        },
        ops: Box::new(ops),
        registration_property_keys: None,
    }));

    return Tween::new(inner);
}

