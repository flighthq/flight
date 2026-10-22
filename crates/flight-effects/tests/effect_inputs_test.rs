use super::*;

#[derive(Default)]
struct TestEffect {
    fields: EffectFields,
}

flight_effects::impl_effect!(TestEffect);

mod get_effect_inputs {
    use super::*;

    #[test]
    fn returns_depth_for_bokeh_depth_of_field_effect() {
        assert_eq!(
            get_effect_inputs(&effect_ref(create_bokeh_depth_of_field_effect())),
            &[EffectInput::Depth]
        );
    }

    #[test]
    fn returns_depth_for_ssao_effect() {
        assert_eq!(
            get_effect_inputs(&effect_ref(create_ssao_effect())),
            &[EffectInput::Depth]
        );
    }

    #[test]
    fn returns_empty_slice_for_effects_that_need_only_the_color_buffer() {
        assert!(get_effect_inputs(&effect_ref(create_vignette_effect())).is_empty());
    }

    #[test]
    fn returns_empty_slice_for_unknown_kind() {
        let mut effect: TestEffect = flight_entity::allocate_entity();
        initialize_effect(&mut effect, "acme.UnknownEffect");
        assert!(get_effect_inputs(&owned_effect(effect)).is_empty());
    }

    #[test]
    fn returns_hdr_for_bloom_effect() {
        assert_eq!(
            get_effect_inputs(&effect_ref(create_bloom_effect())),
            &[EffectInput::Hdr]
        );
    }

    #[test]
    fn returns_hdr_for_tone_map_effect() {
        assert_eq!(
            get_effect_inputs(&effect_ref(create_tone_map_effect())),
            &[EffectInput::Hdr]
        );
    }

    #[test]
    fn returns_temporal_for_taa_effect() {
        assert_eq!(
            get_effect_inputs(&effect_ref(create_taa_effect())),
            &[EffectInput::Temporal]
        );
    }
}

mod get_effect_kinds {
    use super::*;

    #[test]
    fn kinds_are_in_alphabetical_order() {
        for pair in get_effect_kinds().windows(2) {
            assert!(pair[0] < pair[1]);
        }
    }

    #[test]
    fn returns_a_slice_containing_known_effect_kinds() {
        let kinds = get_effect_kinds();
        for kind in [
            "BloomEffect",
            "ToneMapEffect",
            "SsaoEffect",
            "VignetteEffect",
        ] {
            assert!(kinds.contains(&kind));
        }
    }

    #[test]
    fn returns_the_same_reference_as_effect_kinds() {
        assert!(std::ptr::eq(get_effect_kinds(), EFFECT_KINDS));
    }
}
