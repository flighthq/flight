
use flight_signals::emit_signal;

use crate::internal::initialize_tween;
use crate::types::{Tween, TweenManager};

pub fn complete_tween(tween: &Tween) {
    if tween.data.read().unwrap().complete {
        return;
    }
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

    tween.data.write().unwrap().complete = true;
    emit_signal(&on_complete, &());
}

fn update_tween(tween: &Tween, delta_time: f32) {
    if tween.data.read().unwrap().paused || tween.data.read().unwrap().complete {
        return;
    }

    tween.data.write().unwrap().elapsed += delta_time;

    let active_elapsed = {
        let td = tween.data.read().unwrap();
        td.elapsed - td.delay
    };

    if active_elapsed <= 0.0 {
        return;
    }

    if !tween.data.read().unwrap().initialized {
        initialize_tween(tween);
    }

    let (t, writes, on_update, on_complete, on_yoyo, on_repeat, repeat, reflect, reverse, target) = {
        let td = tween.data.read().unwrap();
        let t = (active_elapsed / td.duration).min(1.0);
        let effective_t = if td.reverse { 1.0 - t } else { t };
        let eased_t = (td.ease)(effective_t);
        let writes: Vec<(String, f32)> = td
            .properties
            .iter()
            .map(|d| {
                let mut value = d.start + d.change * eased_t;
                if td.snapping {
                    value = value.round();
                }
                (d.key.clone(), value)
            })
            .collect();
        (
            t,
            writes,
            td.on_update.clone(),
            td.on_complete.clone(),
            td.on_yoyo.clone(),
            td.on_repeat.clone(),
            td.repeat,
            td.reflect,
            td.reverse,
            td.target.clone(),
        )
    };

    {
        let mut target_props = target.props.write().unwrap();
        for (key, value) in &writes {
            target_props.insert(key.clone(), *value);
        }
    }

    emit_signal(&on_update, &());

    if t >= 1.0 {
        if repeat == 0 {
            tween.data.write().unwrap().complete = true;
            emit_signal(&on_complete, &());
        } else {
            if reflect {
                tween.data.write().unwrap().reverse = !reverse;
                emit_signal(&on_yoyo, &());
            }
            {
                let mut td = tween.data.write().unwrap();
                td.elapsed = td.delay;
                if td.repeat > 0 {
                    td.repeat -= 1;
                }
            }
            emit_signal(&on_repeat, &());
        }
    }
}

pub fn update_tweens(manager: &TweenManager, delta_time: f32) {
    let target_keys: Vec<usize> = manager.data.read().unwrap().tweens.iter().map(|(k, _)| *k).collect();

    for key in target_keys {
        let list_len = match manager.data.read().unwrap().tweens.iter().find(|(k, _)| *k == key) {
            Some((_, list)) => list.len(),
            None => continue,
        };

        let mut i = list_len as i32 - 1;
        while i >= 0 {
            let idx = i as usize;

            let tween = match manager.data.read().unwrap().tweens.iter().find(|(k, _)| *k == key) {
                Some((_, list)) if idx < list.len() => list[idx].clone(),
                _ => {
                    i -= 1;
                    continue;
                }
            };

            if tween.data.read().unwrap().complete {
                if let Some((_, list)) = manager.data.write().unwrap().tweens.iter_mut().find(|(k, _)| *k == key) {
                    if idx < list.len() {
                        list.remove(idx);
                    }
                }
            } else {
                update_tween(&tween, delta_time);
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
            manager.data.write().unwrap().tweens.retain(|(k, _)| *k != key);
        }
    }
}
