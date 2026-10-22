use super::*;

mod create_convolution_effect {
    use super::*;

    #[test]
    fn carries_optional_fields() {
        let effect = create_convolution_effect();
        let mut guard = effect.write().unwrap();
        guard.matrix = vec![1.0];
        guard.matrix_x = 1.0;
        guard.matrix_y = 1.0;
        guard.bias = Some(8.0);
        guard.preserve_alpha = Some(false);
        assert_eq!(guard.bias, Some(8.0));
        assert_eq!(guard.preserve_alpha, Some(false));
    }

    #[test]
    fn carries_required_fields() {
        let matrix = vec![0.0, 1.0, 0.0, 1.0, -4.0, 1.0, 0.0, 1.0, 0.0];
        let effect = create_convolution_effect();
        let mut guard = effect.write().unwrap();
        guard.matrix = matrix.clone();
        guard.matrix_x = 3.0;
        guard.matrix_y = 3.0;
        assert_eq!(guard.matrix_x, 3.0);
        assert_eq!(guard.matrix_y, 3.0);
        assert_eq!(guard.matrix, matrix);
    }

    #[test]
    fn tags_the_intent_type() {
        assert_effect_kind(&create_convolution_effect(), "ConvolutionEffect");
    }
}

mod get_convolution_effect_padding {
    use super::*;

    #[test]
    fn preserves_the_exact_asymmetric_reach_of_even_kernels() {
        let effect = create_convolution_effect();
        let mut guard = effect.write().unwrap();
        guard.matrix = vec![1.0, 1.0];
        guard.matrix_x = 2.0;
        guard.matrix_y = 1.0;
        drop(guard);
        let mut out = zero_padding();
        get_convolution_effect_padding(&mut out, &effect.read().unwrap());
        assert_eq!(
            out,
            EffectPadding {
                bottom: 0.0,
                left: 0.0,
                right: 1.0,
                top: 0.0
            }
        );
    }
}

mod initialize_convolution_effect {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_convolution_effect() {
        let mut effect: ConvolutionEffect = flight_entity::allocate_entity();
        initialize_convolution_effect(&mut effect);
        assert_eq!(effect.effect_fields().kind, "ConvolutionEffect");
    }
}

mod register_convolution_effect_padding_resolver {
    use super::*;

    #[test]
    fn registers_the_convolution_footprint_on_only_the_supplied_state() {
        let mut state = fresh_render_state();
        let other = fresh_render_state();
        register_convolution_effect_padding_resolver(&mut state);
        assert!(has_padding_resolver(&state, "ConvolutionEffect"));
        assert!(!has_padding_resolver(&other, "ConvolutionEffect"));
    }
}
