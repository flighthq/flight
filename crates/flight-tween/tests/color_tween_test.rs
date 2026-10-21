use std::any::Any;
use std::collections::HashMap;
use std::rc::Rc;

use flight_tween::*;

fn linear_ease(t: f32) -> f32 {
    t
}

fn get_prop(target: &TweenTarget, key: &str) -> f32 {
    *target.props.read().unwrap().get(key).unwrap_or(&0.0)
}

mod create_color_tween {
    use super::*;

    #[test]
    fn reaches_the_target_color_after_full_duration() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("color".to_string(), 0xff0000_u32 as f32)]));
        create_color_tween(&manager, &target, "color", 1000.0, 0x0000ff, None);
        update_tweens(&manager, 1000.0);
        assert_eq!(get_prop(&target, "color"), 0x0000ff as f32);
    }

    #[test]
    fn starts_from_the_current_color_value() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("color".to_string(), 0x00ff00_u32 as f32)]));
        create_color_tween(
            &manager,
            &target,
            "color",
            1000.0,
            0xff0000,
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(get_prop(&target, "color"), 0xff0000 as f32);
    }

    #[test]
    fn writes_an_integer_color_on_each_update() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("color".to_string(), 0x000000_u32 as f32)]));
        create_color_tween(
            &manager,
            &target,
            "color",
            1000.0,
            0xffffff,
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 500.0);
        let color = get_prop(&target, "color");
        assert_eq!(color, color.round());
    }

    #[test]
    fn interpolates_components_independently_at_the_midpoint() {
        let manager = create_tween_manager(None);
        // red: r=255 g=0 b=0
        let target = create_tween_target(HashMap::from([("color".to_string(), 0xff0000_u32 as f32)]));
        // blue: r=0 g=0 b=255
        create_color_tween(
            &manager,
            &target,
            "color",
            1000.0,
            0x0000ff,
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 500.0);
        // midpoint: r~128, g=0, b~128
        let color = get_prop(&target, "color") as u32;
        let r = (color >> 16) & 0xff;
        let b = color & 0xff;
        assert!((r as f32 - 128.0).abs() < 1.0);
        assert!((b as f32 - 128.0).abs() < 1.0);
    }

    #[test]
    fn registers_the_component_proxy_against_the_user_target_for_manager_queries_and_stops() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("color".to_string(), 0xff0000_u32 as f32)]));
        let tween = create_color_tween(&manager, &target, "color", 1000.0, 0x0000ff, None);

        let tweens_of = get_tweens_of(&manager, &target);
        assert!(tweens_of.iter().any(|t| *t == tween));
        assert!(has_tweens_of(&manager, &target));

        stop_tweens(&manager, &target, None, None);
        assert!(tween.data.borrow().complete);
    }

    #[test]
    fn registers_the_user_property_for_overwrite_targeted_stop_and_property_kill() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("color".to_string(), 0xff0000_u32 as f32)]));
        let numeric_tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("color".to_string(), 0x00ff00 as f32)]),
            None,
        );
        let color_tween = create_color_tween(&manager, &target, "color", 1000.0, 0x0000ff, None);

        // The color tween's overwrite should have marked the numeric tween complete
        assert!(numeric_tween.data.borrow().complete);

        // Targeted stop by property
        stop_tweens(
            &manager,
            &target,
            Some(&HashMap::from([("color".to_string(), 0.0)])),
            None,
        );
        assert!(color_tween.data.borrow().complete);

        // Kill by property
        let next_color_tween = create_color_tween(&manager, &target, "color", 1000.0, 0xffffff, None);
        kill_tweens_of_property(&manager, "color");
        assert!(next_color_tween.data.borrow().complete);
    }

    #[test]
    fn does_not_affect_the_target_before_any_update() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("color".to_string(), 0xabcdef_u32 as f32)]));
        create_color_tween(&manager, &target, "color", 1000.0, 0x000000, None);
        assert_eq!(get_prop(&target, "color"), 0xabcdef_u32 as f32);
    }
}
