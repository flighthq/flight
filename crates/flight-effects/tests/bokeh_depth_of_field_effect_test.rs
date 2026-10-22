use super::*;

mod create_bokeh_depth_of_field_effect {
    use super::*;

    #[test]
    fn tags_the_intent_type() {
        let effect = create_bokeh_depth_of_field_effect();
        assert_effect_kind(&effect, "BokehDepthOfFieldEffect");
    }

    #[test]
    fn carries_options() {
        let effect = create_bokeh_depth_of_field_effect();
        let mut guard = effect.write().unwrap();
        guard.focus_distance = Some(0.5);
        guard.focus_range = Some(0.2);
        guard.max_blur = Some(4.0);
        assert_eq!(guard.focus_distance, Some(0.5));
        assert_eq!(guard.focus_range, Some(0.2));
        assert_eq!(guard.max_blur, Some(4.0));
    }
}

mod get_bokeh_depth_of_field_effect_padding {
    use super::*;

    #[test]
    fn uses_the_maximum_disc_radius_on_every_side() {
        let effect = create_bokeh_depth_of_field_effect();
        {
            let mut guard = effect.write().unwrap();
            guard.max_blur = Some(4.2);
        }
        let mut out = zero_padding();
        get_bokeh_depth_of_field_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 5.0,
                left: 5.0,
                right: 5.0,
                top: 5.0
            }
        );
    }
}

mod initialize_bokeh_depth_of_field_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_bokeh_depth_of_field_effect() {
        let mut effect: BokehDepthOfFieldEffect = flight_entity::allocate_entity();
        initialize_bokeh_depth_of_field_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "BokehDepthOfFieldEffect");
    }
}

mod register_bokeh_depth_of_field_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_bokeh_depth_of_field_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "BokehDepthOfFieldEffect"));
        assert!(!has_padding_resolver(&other, "BokehDepthOfFieldEffect"));
    }
}
