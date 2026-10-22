use super::*;

mod validate_effect_list {
    use super::*;

    #[test]
    fn returns_first_missing_input_in_order() {
        let effects = [
            effect_ref(create_bloom_effect()),
            effect_ref(create_ssao_effect()),
        ];
        assert_eq!(
            validate_effect_list(&effects, &[EffectInput::Hdr]),
            Some(EffectInput::Depth)
        );
    }

    #[test]
    fn returns_missing_depth_input() {
        assert_eq!(
            validate_effect_list(&[effect_ref(create_ssao_effect())], &[EffectInput::Hdr]),
            Some(EffectInput::Depth)
        );
    }

    #[test]
    fn returns_missing_hdr_input() {
        assert_eq!(
            validate_effect_list(&[effect_ref(create_tone_map_effect())], &[]),
            Some(EffectInput::Hdr)
        );
    }

    #[test]
    fn returns_none_for_an_empty_effect_list() {
        assert_eq!(validate_effect_list(&[], &[]), None);
    }

    #[test]
    fn returns_none_for_effects_that_need_only_the_color_buffer() {
        assert_eq!(
            validate_effect_list(&[effect_ref(create_vignette_effect())], &[]),
            None
        );
    }

    #[test]
    fn returns_none_when_all_required_inputs_are_available() {
        let effects = [
            effect_ref(create_bloom_effect()),
            effect_ref(create_ssao_effect()),
        ];
        assert_eq!(
            validate_effect_list(&effects, &[EffectInput::Hdr, EffectInput::Depth]),
            None
        );
    }
}
