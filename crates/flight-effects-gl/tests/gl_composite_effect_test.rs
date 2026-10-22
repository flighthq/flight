mod apply_composite_effect_to_gl {
    use flight_effects::{COMPOSITE_OPERATOR_DESTINATION_OUT, create_composite_effect};
    use flight_effects_gl::contract::apply_composite_effect_to_gl;

    use crate::gl_test_helper::{
        clear_calls, draws, last_uniform, make_state, make_texture_target,
    };

    // A missing backdrop composites over transparent: the layer is bound to both units and
    // `u_hasBackdrop` gates unit 1 off.
    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let source = make_texture_target(&state, 8.0, 8.0);
        let dest = make_texture_target(&state, 8.0, 8.0);
        let effect = create_composite_effect();
        effect.write().unwrap().operator = COMPOSITE_OPERATOR_DESTINATION_OUT.to_string();
        clear_calls();
        apply_composite_effect_to_gl(&mut state, &source, &dest, &effect.read().unwrap()).unwrap();
        let recorded = draws();
        assert_eq!(recorded.len(), 1);
        let layer = source.texture.0.get() as i32;
        assert_eq!(&recorded[0].textures[0..2], &[layer, layer]);
        assert_eq!(last_uniform("u_operator"), vec![5.0]);
        assert_eq!(last_uniform("u_hasBackdrop"), vec![0.0]);
    }
}

mod get_composite_effect_operator_index {
    use flight_effects::{
        COMPOSITE_OPERATOR_CLEAR, COMPOSITE_OPERATOR_COPY, COMPOSITE_OPERATOR_DESTINATION_ATOP,
        COMPOSITE_OPERATOR_DESTINATION_IN, COMPOSITE_OPERATOR_DESTINATION_OUT,
        COMPOSITE_OPERATOR_DESTINATION_OVER, COMPOSITE_OPERATOR_SOURCE_ATOP,
        COMPOSITE_OPERATOR_SOURCE_IN, COMPOSITE_OPERATOR_SOURCE_OUT,
        COMPOSITE_OPERATOR_SOURCE_OVER, COMPOSITE_OPERATOR_XOR,
    };
    use flight_effects_gl::contract::get_composite_effect_operator_index;

    #[test]
    fn assigns_source_over_index_0_and_the_erase_mask_operators_their_shader_indices() {
        assert_eq!(
            get_composite_effect_operator_index(COMPOSITE_OPERATOR_SOURCE_OVER),
            0
        );
        assert_eq!(
            get_composite_effect_operator_index(COMPOSITE_OPERATOR_DESTINATION_OUT),
            5
        );
        assert_eq!(
            get_composite_effect_operator_index(COMPOSITE_OPERATOR_DESTINATION_IN),
            3
        );
        assert_eq!(
            get_composite_effect_operator_index(COMPOSITE_OPERATOR_CLEAR),
            10
        );
    }

    #[test]
    fn maps_a_unique_index_to_every_operator() {
        let mut indices: Vec<i32> = [
            COMPOSITE_OPERATOR_CLEAR,
            COMPOSITE_OPERATOR_COPY,
            COMPOSITE_OPERATOR_DESTINATION_ATOP,
            COMPOSITE_OPERATOR_DESTINATION_IN,
            COMPOSITE_OPERATOR_DESTINATION_OUT,
            COMPOSITE_OPERATOR_DESTINATION_OVER,
            COMPOSITE_OPERATOR_SOURCE_ATOP,
            COMPOSITE_OPERATOR_SOURCE_IN,
            COMPOSITE_OPERATOR_SOURCE_OUT,
            COMPOSITE_OPERATOR_SOURCE_OVER,
            COMPOSITE_OPERATOR_XOR,
        ]
        .iter()
        .map(|operator| get_composite_effect_operator_index(operator))
        .collect();
        let count = indices.len();
        indices.sort();
        indices.dedup();
        assert_eq!(indices.len(), count);
    }

    #[test]
    fn falls_back_to_source_over_0_for_an_unknown_vendor_operator() {
        assert_eq!(get_composite_effect_operator_index("acme.custom"), 0);
    }
}

mod gl_composite_effect_runner {
    use flight_effects::create_composite_effect;
    use flight_effects_gl::contract::gl_composite_effect_runner;

    use crate::gl_test_helper::{clear_calls, draws, make_state};
    use crate::with_effect_context;

    #[test]
    fn is_a_function() {
        let mut state = make_state();
        let effect = create_composite_effect();
        clear_calls();
        with_effect_context(&mut state, 8.0, 8.0, |ctx| {
            gl_composite_effect_runner(ctx, &*effect.read().unwrap())
        })
        .unwrap();
        assert_eq!(draws().len(), 1);
    }
}

mod register_gl_composite_effect {
    use flight_effects_gl::contract::{
        GlEffectRunner, get_gl_effect_runner, gl_composite_effect_runner,
        register_gl_composite_effect,
    };

    use crate::gl_test_helper::make_state;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = make_state();
        register_gl_composite_effect(&mut state);
        let runner = get_gl_effect_runner(&state, "CompositeEffect").unwrap();
        assert!(std::ptr::fn_addr_eq(
            runner,
            gl_composite_effect_runner as GlEffectRunner
        ));
    }
}
