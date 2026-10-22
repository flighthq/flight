use flight_effects::{
    COMPOSITE_OPERATOR_CLEAR, COMPOSITE_OPERATOR_COPY, COMPOSITE_OPERATOR_DESTINATION_ATOP,
    COMPOSITE_OPERATOR_DESTINATION_IN, COMPOSITE_OPERATOR_DESTINATION_OUT,
    COMPOSITE_OPERATOR_DESTINATION_OVER, COMPOSITE_OPERATOR_SOURCE_ATOP,
    COMPOSITE_OPERATOR_SOURCE_IN, COMPOSITE_OPERATOR_SOURCE_OUT, COMPOSITE_OPERATOR_SOURCE_OVER,
    COMPOSITE_OPERATOR_XOR, EffectRef, create_composite_effect,
};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

const COMPOSITE_OPERATORS: [&str; 11] = [
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
];

mod apply_composite_effect_to_wgpu {
    use super::*;

    #[test]
    fn is_the_public_webgpu_composite_entry_point() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let backdrop = create_test_target(&state, 16, 8);
        register_wgpu_blend_effect_backdrop(&mut state, "scene", backdrop);
        let effect = create_composite_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.operator = COMPOSITE_OPERATOR_DESTINATION_OUT.to_string();
            effect.backdrop_key = Some("scene".to_string());
        }
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_composite_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        let ints = recorded_effect_uniform_ints(&records);
        assert_eq!(&ints[0][0..2], &[5, 1]);
        assert_eq!(
            recorded_pass_views(&records),
            vec![dest.read().unwrap().view.clone()]
        );
        let sets = recorded_set_bind_groups(&records);
        assert_ne!(sets[1].bind_group, sets[2].bind_group);
    }

    #[test]
    fn binds_the_layer_twice_and_flags_no_backdrop_when_none_is_registered() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let effect = create_composite_effect();
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_composite_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        assert_eq!(recorded_effect_uniform_ints(&records)[0][1], 0);
        let sets = recorded_set_bind_groups(&records);
        assert_eq!(sets[1].bind_group, sets[2].bind_group);
    }
}

mod get_wgpu_composite_effect_operator_index {
    use super::*;

    #[test]
    fn assigns_every_canonical_operator_a_unique_branch_and_unknown_values_source_over() {
        let mut indices: Vec<i32> = COMPOSITE_OPERATORS
            .iter()
            .map(|operator| get_wgpu_composite_effect_operator_index(operator))
            .collect();
        indices.sort();
        indices.dedup();
        assert_eq!(indices.len(), COMPOSITE_OPERATORS.len());
        assert_eq!(
            get_wgpu_composite_effect_operator_index(COMPOSITE_OPERATOR_SOURCE_OVER),
            0
        );
        assert_eq!(
            get_wgpu_composite_effect_operator_index(COMPOSITE_OPERATOR_DESTINATION_OUT),
            5
        );
        assert_eq!(
            get_wgpu_composite_effect_operator_index(COMPOSITE_OPERATOR_CLEAR),
            10
        );
        assert_eq!(get_wgpu_composite_effect_operator_index("acme.Custom"), 0);
    }
}

mod register_wgpu_composite_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_composite_effect() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_composite_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_composite_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "CompositeEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_composite_effect_runner {
    use super::*;

    #[test]
    fn is_a_render_effect_runner() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_composite_effect();
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            let mut context = WgpuEffectContext {
                state,
                source: source.clone(),
                dest: dest.clone(),
                pool: &mut pool,
                scene_depth_texture: None,
                scene_velocity_texture: None,
            };
            wgpu_composite_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(
            recorded_pass_views(&records),
            vec![dest.read().unwrap().view.clone()]
        );
    }
}

mod wgpu_composite_fragment_wgsl {
    use super::*;

    #[test]
    fn binds_both_premultiplied_inputs_and_implements_all_porter_duff_branches() {
        assert!(WGPU_COMPOSITE_FRAGMENT_WGSL.contains("@group(1) @binding(0) var layerTexture"));
        assert!(WGPU_COMPOSITE_FRAGMENT_WGSL.contains("@group(2) @binding(0) var backdropTexture"));
        assert!(WGPU_COMPOSITE_FRAGMENT_WGSL.contains("uni.operatorIndex == 10"));
        assert!(
            WGPU_COMPOSITE_FRAGMENT_WGSL.contains("sourceFactor * layer + backdropFactor * back")
        );
    }
}
