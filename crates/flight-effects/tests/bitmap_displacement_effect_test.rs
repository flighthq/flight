use std::sync::{Arc, RwLock};

use flight_bitmap::ImageChannel;
use flight_texture::create_texture_2d;

use super::*;

mod bitmap_displacement_effect_defaults {
    use super::*;

    #[test]
    fn participates_in_the_known_effect_kind_catalog() {
        assert!(get_effect_kinds().contains(&"BitmapDisplacementEffect"));
    }

    #[test]
    fn uses_red_green_channels_zero_scale_and_wrapping_edges() {
        let mut defaults = EffectDefaults::new();
        get_effect_defaults(&mut defaults, "BitmapDisplacementEffect");
        assert_eq!(defaults.get("componentX"), Some(&EffectValue::Number(0.0)));
        assert_eq!(defaults.get("componentY"), Some(&EffectValue::Number(1.0)));
        assert_eq!(
            defaults.get("edgeMode"),
            Some(&EffectValue::Text("wrap".to_string()))
        );
        assert_eq!(defaults.get("scaleX"), Some(&EffectValue::Number(0.0)));
        assert_eq!(defaults.get("scaleY"), Some(&EffectValue::Number(0.0)));
    }
}

mod create_bitmap_displacement_effect {
    use super::*;

    #[test]
    fn accepts_a_null_map_as_the_loading_sentinel() {
        assert!(
            create_bitmap_displacement_effect()
                .read()
                .unwrap()
                .map
                .is_none()
        );
    }

    #[test]
    fn carries_explicit_channel_scale_and_edge_options() {
        let effect = create_bitmap_displacement_effect();
        let map = Arc::new(RwLock::new(create_texture_2d(None)));
        let mut guard = effect.write().unwrap();
        guard.map = Some(map.clone());
        guard.component_x = Some(ImageChannel::Alpha);
        guard.component_y = Some(ImageChannel::Blue);
        guard.edge_mode = Some(BitmapDisplacementEffectEdgeMode::Clamp);
        guard.scale_x = Some(-12.0);
        guard.scale_y = Some(7.0);
        assert!(Arc::ptr_eq(guard.map.as_ref().unwrap(), &map));
        assert_eq!(guard.component_x, Some(ImageChannel::Alpha));
        assert_eq!(guard.component_y, Some(ImageChannel::Blue));
        assert_eq!(
            guard.edge_mode,
            Some(BitmapDisplacementEffectEdgeMode::Clamp)
        );
        assert_eq!(guard.scale_x, Some(-12.0));
        assert_eq!(guard.scale_y, Some(7.0));
    }

    #[test]
    fn keeps_bitmap_map_displacement_distinct_from_procedural_displacement() {
        let effect = create_bitmap_displacement_effect();
        assert_effect_kind(&effect, "BitmapDisplacementEffect");
        assert_ne!(
            effect.read().unwrap().effect_fields().kind,
            create_displacement_effect()
                .read()
                .unwrap()
                .effect_fields()
                .kind,
        );
    }
}

mod get_bitmap_displacement_effect_padding {
    use super::*;

    #[test]
    fn uses_half_the_absolute_signed_scale_on_each_axis() {
        let effect = create_bitmap_displacement_effect();
        let mut guard = effect.write().unwrap();
        guard.scale_x = Some(-9.0);
        guard.scale_y = Some(6.25);
        drop(guard);
        let mut out = zero_padding();
        get_bitmap_displacement_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 4.0,
                left: 5.0,
                right: 5.0,
                top: 4.0
            }
        );
    }
}

mod initialize_bitmap_displacement_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_bitmap_displacement_effect() {
        let mut effect: BitmapDisplacementEffect = flight_entity::allocate_entity();
        initialize_bitmap_displacement_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "BitmapDisplacementEffect");
    }
}

mod register_bitmap_displacement_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_bitmap_displacement_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "BitmapDisplacementEffect"));
        assert!(!has_padding_resolver(&other, "BitmapDisplacementEffect"));
    }
}
