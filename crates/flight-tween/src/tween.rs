use std::collections::HashMap;

use flight_signals::emit_signal;

use crate::internal::{add_tween_to_manager, has_tween_property, initialize_tween, make_tween};
use crate::tween_manager::default_manager;
use crate::types::{
    StopTweenOptions, Tween, TweenContext, TweenManager, TweenOptions, TweenTarget, target_key,
};

pub fn create_tween(
    manager: &TweenManager,
    target: &TweenTarget,
    duration: f32,
    property_map: &HashMap<String, f32>,
    options: Option<&TweenOptions>,
) -> Tween {
    let default_ease = manager.data.read().unwrap().default_ease;
    let tween = make_tween(target, duration, property_map, options, default_ease);
    let overwrite = options.and_then(|o| o.overwrite).unwrap_or(true);
    add_tween_to_manager(manager, &tween, overwrite, None, None);
    return tween;
}

// flight-lint: allow(conform-extra) D5 explicit-context form of the TS createTween overload using the module default manager
pub fn create_tween_default(
    context: &TweenContext,
    target: &TweenTarget,
    duration: f32,
    property_map: &HashMap<String, f32>,
    options: Option<&TweenOptions>,
) -> Tween {
    let manager = default_manager(context);
    return create_tween(&manager, target, duration, property_map, options);
}

// flight-lint: allow(hashmap-iteration) iterates input property_map parameter to apply values to target; order is not observable
pub fn apply_tween(
    manager: &TweenManager,
    target: &TweenTarget,
    property_map: &HashMap<String, f32>,
) {
    stop_tweens(manager, target, Some(property_map), None);
    let mut t = target.props.write().unwrap();
    for (key, val) in property_map.iter() {
        t.insert(key.clone(), *val);
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

pub fn get_tweens_of(manager: &TweenManager, target: &TweenTarget) -> Vec<Tween> {
    let key = target_key(target);
    let manager_data = manager.data.read().unwrap();
    return manager_data
        .tweens
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, list)| list.clone())
        .unwrap_or_default();
}

pub fn has_tweens_of(manager: &TweenManager, target: &TweenTarget) -> bool {
    let key = target_key(target);
    let manager_data = manager.data.read().unwrap();
    return match manager_data.tweens.iter().find(|(k, _)| *k == key) {
        Some((_, list)) => !list.is_empty(),
        None => false,
    };
}

pub fn kill_tweens_of_property(manager: &TweenManager, key: &str) {
    let manager_data = manager.data.read().unwrap();
    for (_, list) in manager_data.tweens.iter() {
        for tween in list.iter() {
            if has_tween_property(tween, key) {
                tween.data.write().unwrap().complete = true;
            }
        }
    }
}

pub fn pause_all_tweens(manager: &TweenManager) {
    let manager_data = manager.data.read().unwrap();
    for (_, list) in manager_data.tweens.iter() {
        for tween in list.iter() {
            tween.data.write().unwrap().paused = true;
        }
    }
}

pub fn pause_tween(tween: &Tween) {
    tween.data.write().unwrap().paused = true;
}

pub fn pause_tweens(manager: &TweenManager, target: &TweenTarget) {
    let key = target_key(target);
    let manager_data = manager.data.read().unwrap();
    if let Some((_, list)) = manager_data.tweens.iter().find(|(k, _)| *k == key) {
        for tween in list.iter() {
            tween.data.write().unwrap().paused = true;
        }
    }
}

pub fn reset_all_tweens(manager: &TweenManager) {
    manager.data.write().unwrap().tweens.clear();
}

pub fn resume_all_tweens(manager: &TweenManager) {
    let manager_data = manager.data.read().unwrap();
    for (_, list) in manager_data.tweens.iter() {
        for tween in list.iter() {
            tween.data.write().unwrap().paused = false;
        }
    }
}

pub fn resume_tween(tween: &Tween) {
    tween.data.write().unwrap().paused = false;
}

pub fn resume_tweens(manager: &TweenManager, target: &TweenTarget) {
    let key = target_key(target);
    let manager_data = manager.data.read().unwrap();
    if let Some((_, list)) = manager_data.tweens.iter().find(|(k, _)| *k == key) {
        for tween in list.iter() {
            tween.data.write().unwrap().paused = false;
        }
    }
}

pub fn stop_all_tweens(manager: &TweenManager, options: Option<&StopTweenOptions>) {
    let all_tweens: Vec<Tween> = {
        let md = manager.data.read().unwrap();
        md.tweens.iter().flat_map(|(_, list)| list.iter().cloned()).collect()
    };
    for tween in &all_tweens {
        stop_tween(tween, options);
    }
}

pub fn stop_tween(tween: &Tween, options: Option<&StopTweenOptions>) {
    let do_complete = options.and_then(|o| o.complete).unwrap_or(false);
    let do_send_event = options.and_then(|o| o.send_event).unwrap_or(true);

    if do_complete {
        if !tween.data.read().unwrap().initialized {
            initialize_tween(tween);
        }

        let on_complete = {
            let tween_data = tween.data.read().unwrap();
            let effective_t = if tween_data.reverse { 0.0 } else { 1.0 };
            let eased_t = (tween_data.ease)(effective_t);
            let mut target_props = tween_data.target.props.write().unwrap();
            for detail in tween_data.properties.iter() {
                let mut value = detail.start + detail.change * eased_t;
                if tween_data.snapping {
                    value = value.round();
                }
                target_props.insert(detail.key.clone(), value);
            }
            tween_data.on_complete.clone()
        };

        if do_send_event {
            emit_signal(&on_complete, &());
        }
    }

    tween.data.write().unwrap().complete = true;
}

// flight-lint: allow(hashmap-iteration) iterates input property_map parameter to check overlap; order is not observable
pub fn stop_tweens(
    manager: &TweenManager,
    target: &TweenTarget,
    property_map: Option<&HashMap<String, f32>>,
    options: Option<&StopTweenOptions>,
) {
    let key = target_key(target);
    let tweens: Vec<Tween> = {
        let manager_data = manager.data.read().unwrap();
        match manager_data.tweens.iter().find(|(k, _)| *k == key) {
            Some((_, list)) => list.clone(),
            None => return,
        }
    };

    for tween in tweens.iter() {
        if let Some(props) = property_map {
            let mut overlaps = false;
            for k in props.keys() {
                if has_tween_property(tween, k) {
                    overlaps = true;
                    break;
                }
            }
            if !overlaps {
                continue;
            }
        }
        stop_tween(tween, options);
    }
}
