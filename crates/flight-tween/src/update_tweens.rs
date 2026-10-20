use std::any::Any;
use std::rc::Rc;

use flight_signals::emit_signal;

use crate::internal::initialize_tween;
use crate::types::{Tween, TweenManager};

pub fn complete_tween(tween: &Tween) {
    if tween.data.borrow().complete {
        return;
    }
    if !tween.data.borrow().initialized {
        initialize_tween(tween);
    }

    let on_complete = {
        let tween_data = tween.data.borrow();
        let effective_t = if tween_data.reverse { 0.0 } else { 1.0 };
        let eased_t = (tween_data.ease)(effective_t);
        let mut target_props = tween_data.target.props.borrow_mut();
        for detail in tween_data.properties.iter() {
            let mut value = detail.start + detail.change * eased_t;
            if tween_data.snapping {
                value = value.round();
            }
            target_props.insert(detail.key.clone(), value);
        }
        tween_data.on_complete.clone()
    };

    tween.data.borrow_mut().complete = true;
    emit_signal(&on_complete, Rc::new(()));
}

fn update_tween(tween: &Tween, delta_time: f32) {
    if tween.data.borrow().paused || tween.data.borrow().complete {
        return;
    }

    tween.data.borrow_mut().elapsed += delta_time;

    let active_elapsed = {
        let td = tween.data.borrow();
        td.elapsed - td.delay
    };

    if active_elapsed <= 0.0 {
        return;
    }

    if !tween.data.borrow().initialized {
        initialize_tween(tween);
    }

    // Read all values needed for computation
    let (t, writes, on_update, on_complete, on_yoyo, on_repeat, repeat, reflect, reverse, target) = {
        let td = tween.data.borrow();
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

    // Write to target
    {
        let mut target_props = target.props.borrow_mut();
        for (key, value) in &writes {
            target_props.insert(key.clone(), *value);
        }
    }

    emit_signal(&on_update, Rc::new(()));

    if t >= 1.0 {
        if repeat == 0 {
            tween.data.borrow_mut().complete = true;
            emit_signal(&on_complete, Rc::new(()));
        } else {
            if reflect {
                tween.data.borrow_mut().reverse = !reverse;
                emit_signal(&on_yoyo, Rc::new(()));
            }
            {
                let mut td = tween.data.borrow_mut();
                td.elapsed = td.delay;
                if td.repeat > 0 {
                    td.repeat -= 1;
                }
            }
            emit_signal(&on_repeat, Rc::new(()));
        }
    }
}

/// Time is unit-agnostic. `delta_time` here and every duration value (`duration`,
/// `delay`, `each`) pass through unchanged in whatever unit the caller supplies.
/// The only contract is consistency: feed `update_tweens` and the duration fields
/// the same unit (all seconds, or all milliseconds, or all frames).
pub fn update_tweens(manager: &TweenManager, delta_time: f32) {
    let target_keys: Vec<usize> = manager.data.borrow().tweens.keys().cloned().collect();

    for key in target_keys {
        let list_len = match manager.data.borrow().tweens.get(&key) {
            Some(list) => list.len(),
            None => continue,
        };

        let mut i = list_len as i32 - 1;
        while i >= 0 {
            let idx = i as usize;

            let tween = match manager.data.borrow().tweens.get(&key) {
                Some(list) if idx < list.len() => list[idx].clone(),
                _ => {
                    i -= 1;
                    continue;
                }
            };

            if tween.data.borrow().complete {
                if let Some(list) = manager.data.borrow_mut().tweens.get_mut(&key) {
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
            .borrow()
            .tweens
            .get(&key)
            .map_or(false, |l| l.is_empty());
        if should_remove {
            manager.data.borrow_mut().tweens.remove(&key);
        }
    }
}
