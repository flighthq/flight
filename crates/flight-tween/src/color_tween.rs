//! flight-compiler: target-native

use std::sync::Arc;

use flight_entity::Ref;
use flight_signals::connect_signal;

use crate::internal::{add_tween_to_manager, make_tween};
use crate::types::{
    ColorComponents, Tween, TweenManager, TweenOptions, TweenProp, TweenPropertyAccessor,
    erase_tween_handle, target_key_from_ref,
};

// flight-lint: allow(conform-extra) D22 generic color tween using ColorComponents proxy
// flight-lint: allow(conform-params) D22 color tween decomposes TS property into get_color + color_key accessors
// flight-lint: allow(contract-vocabulary) D22 Tween<T> requires T: Send + Sync + 'static for Arc<RwLock<>> thread-safety
// flight-lint: allow(f32) packed 24-bit RGB color target, exact in f32 (bounded color)
pub fn create_color_tween<T: ?Sized + Send + Sync + 'static>(
    manager: &TweenManager,
    target: &Ref<T>,
    get_color: fn(&mut T) -> &mut f32,
    color_key: &str,
    duration: f64,
    to_color: u32,
    options: Option<&TweenOptions>,
) -> Tween<ColorComponents> {
    let from_color = {
        let mut t = target.write().unwrap();
        *get_color(&mut t) as u32
    };

    let components: Ref<ColorComponents> = Ref::new(std::sync::RwLock::new(ColorComponents {
        r: ((from_color >> 16) & 0xff) as f64,
        g: ((from_color >> 8) & 0xff) as f64,
        b: (from_color & 0xff) as f64,
    }));

    let props = [
        TweenProp {
            get: TweenPropertyAccessor::F64(|c: &mut ColorComponents| &mut c.r),
            key: "r",
            to: ((to_color >> 16) & 0xff) as f64,
        },
        TweenProp {
            get: TweenPropertyAccessor::F64(|c: &mut ColorComponents| &mut c.g),
            key: "g",
            to: ((to_color >> 8) & 0xff) as f64,
        },
        TweenProp {
            get: TweenPropertyAccessor::F64(|c: &mut ColorComponents| &mut c.b),
            key: "b",
            to: (to_color & 0xff) as f64,
        },
    ];

    let default_ease = manager.data.read().unwrap().default_ease;
    let tween = make_tween(&components, duration, &props, options, default_ease);
    let overwrite = options.and_then(|o| o.overwrite).unwrap_or(true);
    let handle = erase_tween_handle(&tween);
    let real_target_key = target_key_from_ref(target);
    add_tween_to_manager(
        manager,
        &handle,
        overwrite,
        Some(real_target_key),
        Some(&[color_key.to_string()]),
    );

    let target_clone = target.clone();
    let components_clone = components.clone();
    let slot: Arc<dyn Fn(&()) + Send + Sync> = Arc::new(move |_args: &()| {
        let comps = components_clone.read().unwrap();
        let r = comps.r.round() as u32 & 0xff;
        let g = comps.g.round() as u32 & 0xff;
        let b = comps.b.round() as u32 & 0xff;
        let color = (r << 16) | (g << 8) | b;
        let mut t = target_clone.write().unwrap();
        *get_color(&mut t) = color as f32;
    });

    connect_signal(&tween.data.read().unwrap().common.on_update, slot, None);

    return tween;
}
