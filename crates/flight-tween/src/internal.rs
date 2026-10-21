use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use flight_signals::create_signal;

use crate::types::{
    EasingFunction, Tween, TweenData, TweenManager, TweenOptions, TweenPropertyDetail,
    TweenTarget, target_key,
};

pub fn initialize_tween(tween: &Tween) {
    let mut tween_data = tween.data.borrow_mut();
    let smart_rotation = tween_data.smart_rotation;

    let target_props: HashMap<String, f32> = tween_data.target.props.read().unwrap().clone();

    let property_map = tween_data.property_map.clone();

    for detail in tween_data.properties.iter_mut() {
        let start = *target_props.get(&detail.key).unwrap_or(&0.0);
        let end = *property_map.get(&detail.key).unwrap_or(&0.0);
        detail.start = start;
        detail.change = end - start;
        if smart_rotation {
            let mut change = ((detail.change % 360.0) + 360.0) % 360.0;
            if change > 180.0 {
                change -= 360.0;
            }
            detail.change = change;
        }
    }
    tween_data.initialized = true;
}

pub fn make_tween(
    target: &TweenTarget,
    duration: f32,
    property_map: &HashMap<String, f32>,
    options: Option<&TweenOptions>,
    default_ease: EasingFunction,
) -> Tween {
    let keys: Vec<String> = property_map.keys().cloned().collect();
    let properties: Vec<TweenPropertyDetail> = keys
        .iter()
        .map(|key| TweenPropertyDetail {
            change: 0.0,
            key: key.clone(),
            start: 0.0,
        })
        .collect();

    let ease = options.and_then(|o| o.ease).unwrap_or(default_ease);

    return Tween {
        data: Rc::new(RefCell::new(TweenData {
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
            properties,
            property_map: property_map.clone(),
            reflect: options.and_then(|o| o.reflect).unwrap_or(false),
            repeat: options.and_then(|o| o.repeat).unwrap_or(0),
            reverse: options.and_then(|o| o.reverse).unwrap_or(false),
            smart_rotation: options.and_then(|o| o.smart_rotation).unwrap_or(false),
            snapping: options.and_then(|o| o.snapping).unwrap_or(false),
            target: target.clone(),
            registration_property_keys: None,
        })),
    };
}

pub fn add_tween_to_manager(
    manager: &TweenManager,
    tween: &Tween,
    overwrite: bool,
    registration_target: Option<&TweenTarget>,
    registration_property_keys: Option<&[String]>,
) {
    if let Some(keys) = registration_property_keys {
        tween.data.borrow_mut().registration_property_keys = Some(keys.to_vec());
    }

    let effective_target = match registration_target {
        Some(t) => t.clone(),
        None => tween.data.borrow().target.clone(),
    };
    let key = target_key(&effective_target);

    let mut manager_data = manager.data.borrow_mut();
    let list = manager_data.tweens.entry(key).or_insert_with(Vec::new);

    if overwrite {
        let keys_to_check: Vec<String> = match registration_property_keys {
            Some(keys) => keys.to_vec(),
            None => tween
                .data
                .borrow()
                .properties
                .iter()
                .map(|d| d.key.clone())
                .collect(),
        };

        for i in (0..list.len()).rev() {
            let existing = &list[i];
            let mut overlaps = false;
            for k in &keys_to_check {
                if has_tween_property(existing, k) {
                    overlaps = true;
                    break;
                }
            }
            if overlaps {
                existing.data.borrow_mut().complete = true;
            }
        }
    }

    list.push(tween.clone());
}

pub fn has_tween_property(tween: &Tween, key: &str) -> bool {
    let tween_data = tween.data.borrow();
    if let Some(ref reg_keys) = tween_data.registration_property_keys {
        return reg_keys.iter().any(|k| k == key);
    }
    return tween_data.property_map.contains_key(key);
}
