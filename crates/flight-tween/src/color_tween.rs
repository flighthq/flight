use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_signals::connect_signal;

use crate::internal::{add_tween_to_manager, make_tween};
use crate::types::{Tween, TweenManager, TweenOptions, TweenTarget};

pub fn create_color_tween(
    manager: &TweenManager,
    target: &TweenTarget,
    property: &str,
    duration: f32,
    to_color: u32,
    options: Option<&TweenOptions>,
) -> Tween {
    let from_color = {
        let target_props = target.props.read().unwrap();
        *target_props.get(property).unwrap_or(&0.0) as u32
    };

    let components_map = HashMap::from([
        ("b".to_string(), (from_color & 0xff) as f32),
        ("g".to_string(), ((from_color >> 8) & 0xff) as f32),
        ("r".to_string(), ((from_color >> 16) & 0xff) as f32),
    ]);
    let components = TweenTarget {
        props: Ref::new(RwLock::new(components_map)),
    };

    let to_props = HashMap::from([
        ("b".to_string(), (to_color & 0xff) as f32),
        ("g".to_string(), ((to_color >> 8) & 0xff) as f32),
        ("r".to_string(), ((to_color >> 16) & 0xff) as f32),
    ]);

    let default_ease = manager.data.read().unwrap().default_ease;
    let tween = make_tween(&components, duration, &to_props, options, default_ease);
    let overwrite = options.and_then(|o| o.overwrite).unwrap_or(true);
    add_tween_to_manager(
        manager,
        &tween,
        overwrite,
        Some(target),
        Some(&[property.to_string()]),
    );

    let target_clone = target.clone();
    let property_owned = property.to_string();
    let components_clone = components.clone();
    let slot: Arc<dyn Fn(&()) + Send + Sync> = Arc::new(move |_args: &()| {
        let comps = components_clone.props.read().unwrap();
        let r = comps.get("r").unwrap_or(&0.0).round() as u32 & 0xff;
        let g = comps.get("g").unwrap_or(&0.0).round() as u32 & 0xff;
        let b = comps.get("b").unwrap_or(&0.0).round() as u32 & 0xff;
        let color = (r << 16) | (g << 8) | b;
        target_clone
            .props
            .write()
            .unwrap()
            .insert(property_owned.clone(), color as f32);
    });

    connect_signal(&tween.data.read().unwrap().on_update, slot, None);

    return tween;
}
