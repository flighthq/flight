use std::sync::Arc;

use flight_effects::{
    ADVANCED_BLEND_MODE_COLOR, ADVANCED_BLEND_MODE_COLOR_BURN, ADVANCED_BLEND_MODE_COLOR_DODGE,
    ADVANCED_BLEND_MODE_DARKEN, ADVANCED_BLEND_MODE_DIFFERENCE, ADVANCED_BLEND_MODE_EXCLUSION,
    ADVANCED_BLEND_MODE_HARD_LIGHT, ADVANCED_BLEND_MODE_HUE, ADVANCED_BLEND_MODE_LIGHTEN,
    ADVANCED_BLEND_MODE_LUMINOSITY, ADVANCED_BLEND_MODE_OVERLAY, ADVANCED_BLEND_MODE_SATURATION,
    ADVANCED_BLEND_MODE_SOFT_LIGHT, EffectRef, create_blend_effect,
};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

const ADVANCED_BLEND_MODES: [&str; 13] = [
    ADVANCED_BLEND_MODE_COLOR,
    ADVANCED_BLEND_MODE_COLOR_BURN,
    ADVANCED_BLEND_MODE_COLOR_DODGE,
    ADVANCED_BLEND_MODE_DARKEN,
    ADVANCED_BLEND_MODE_DIFFERENCE,
    ADVANCED_BLEND_MODE_EXCLUSION,
    ADVANCED_BLEND_MODE_HARD_LIGHT,
    ADVANCED_BLEND_MODE_HUE,
    ADVANCED_BLEND_MODE_LIGHTEN,
    ADVANCED_BLEND_MODE_LUMINOSITY,
    ADVANCED_BLEND_MODE_OVERLAY,
    ADVANCED_BLEND_MODE_SATURATION,
    ADVANCED_BLEND_MODE_SOFT_LIGHT,
];

mod apply_blend_effect_to_wgpu {
    use super::*;

    #[test]
    fn blends_the_layer_over_the_registered_backdrop() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let backdrop = create_test_target(&state, 16, 8);
        register_wgpu_blend_effect_backdrop(&mut state, "scene", backdrop.clone());
        let effect = create_blend_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.mode = ADVANCED_BLEND_MODE_HUE.to_string();
            effect.backdrop_key = Some("scene".to_string());
            effect.opacity = Some(0.5);
        }
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_blend_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        let ints = recorded_effect_uniform_ints(&records);
        assert_eq!(ints[0][0], 7);
        assert_eq!(recorded_effect_uniforms(&records)[0][1], 0.5);
        assert_eq!(ints[0][2], 1);
        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
        let sets = recorded_set_bind_groups(&records);
        assert_ne!(sets[1].bind_group, sets[2].bind_group);
    }

    // A missing backdrop binds the layer twice and gates the shader to passthrough.
    #[test]
    fn passes_the_layer_through_when_no_backdrop_is_registered() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let effect = create_blend_effect();
        effect.write().unwrap().backdrop_key = Some("missing".to_string());
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_blend_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        assert_eq!(recorded_effect_uniform_ints(&records)[0][2], 0);
        assert_eq!(recorded_effect_uniforms(&records)[0][1], 1.0);
        let sets = recorded_set_bind_groups(&records);
        assert_eq!(sets[1].bind_group, sets[2].bind_group);
    }
}

mod get_wgpu_blend_effect_backdrop {
    use super::*;

    #[test]
    fn returns_none_for_none_and_missing_keys() {
        let state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_blend_effect_backdrop(&state, None).is_none());
        assert!(get_wgpu_blend_effect_backdrop(&state, Some("missing")).is_none());
    }

    #[test]
    fn isolates_registered_targets_per_state() {
        let mut first = create_wgpu_render_state_for_test(None);
        let second = create_wgpu_render_state_for_test(None);
        let target = create_test_target(&first, 4, 4);
        register_wgpu_blend_effect_backdrop(&mut first, "scene", target.clone());
        assert!(
            get_wgpu_blend_effect_backdrop(&first, Some("scene"))
                .is_some_and(|found| Arc::ptr_eq(&found, &target))
        );
        assert!(get_wgpu_blend_effect_backdrop(&second, Some("scene")).is_none());
    }
}

mod get_wgpu_blend_effect_mode_index {
    use super::*;

    #[test]
    fn assigns_the_seven_separable_modes_indices_0_through_6() {
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_OVERLAY), 0);
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_HARD_LIGHT), 1);
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_SOFT_LIGHT), 2);
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_DIFFERENCE), 3);
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_EXCLUSION), 4);
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_COLOR_DODGE), 5);
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_COLOR_BURN), 6);
    }

    #[test]
    fn assigns_the_hsl_modes_indices_7_through_10() {
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_HUE), 7);
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_SATURATION), 8);
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_COLOR), 9);
        assert_eq!(get_wgpu_blend_effect_mode_index(ADVANCED_BLEND_MODE_LUMINOSITY), 10);
    }

    #[test]
    fn maps_every_canonical_mode_uniquely_and_unknown_values_to_passthrough() {
        let mut indices: Vec<i32> = ADVANCED_BLEND_MODES
            .iter()
            .map(|mode| get_wgpu_blend_effect_mode_index(mode))
            .collect();
        assert!(!indices.contains(&-1));
        indices.sort();
        indices.dedup();
        assert_eq!(indices.len(), ADVANCED_BLEND_MODES.len());
        assert_eq!(get_wgpu_blend_effect_mode_index("acme.Unknown"), -1);
    }

    // The index table and the shader's branch switch are two hand-maintained lists that must agree.
    #[test]
    fn has_a_shader_branch_for_every_index_the_table_assigns() {
        for mode in ADVANCED_BLEND_MODES {
            let index = get_wgpu_blend_effect_mode_index(mode);
            assert!(index >= 0);
            assert!(
                WGPU_BLEND_FRAGMENT_WGSL.contains(&format!("mode == {index}")),
                "{mode} maps to index {index} with no shader branch"
            );
        }
    }
}

mod register_wgpu_blend_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_blend_effect() {
        let mut state = create_wgpu_render_state_for_test(None);
        register_wgpu_blend_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_blend_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "BlendEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod register_wgpu_blend_effect_backdrop {
    use super::*;

    #[test]
    fn is_last_write_wins() {
        let mut state = create_wgpu_render_state_for_test(None);
        let first = create_test_target(&state, 4, 4);
        let second = create_test_target(&state, 4, 4);
        register_wgpu_blend_effect_backdrop(&mut state, "scene", first);
        register_wgpu_blend_effect_backdrop(&mut state, "scene", second.clone());
        assert!(
            get_wgpu_blend_effect_backdrop(&state, Some("scene"))
                .is_some_and(|found| Arc::ptr_eq(&found, &second))
        );
    }
}

mod unregister_wgpu_blend_effect_backdrop {
    use super::*;

    #[test]
    fn removes_present_targets_and_reports_absent_keys() {
        let mut state = create_wgpu_render_state_for_test(None);
        let target = create_test_target(&state, 4, 4);
        register_wgpu_blend_effect_backdrop(&mut state, "scene", target);
        assert!(unregister_wgpu_blend_effect_backdrop(&mut state, "scene"));
        assert!(!unregister_wgpu_blend_effect_backdrop(&mut state, "scene"));
        assert!(get_wgpu_blend_effect_backdrop(&state, Some("scene")).is_none());
    }
}

mod wgpu_blend_effect_runner {
    use super::*;

    #[test]
    fn draws_the_context_source_into_the_context_dest() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_blend_effect();
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
            wgpu_blend_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
        assert_eq!(recorded_draw_sources(&records), vec![source.read().unwrap().view.clone()]);
    }
}

mod wgpu_blend_fragment_wgsl {
    use super::*;

    #[test]
    fn binds_both_layer_and_backdrop_textures_and_emits_the_separable_and_hsl_blend_helpers() {
        assert!(WGPU_BLEND_FRAGMENT_WGSL.contains("@group(1) @binding(0) var layerTexture"));
        assert!(WGPU_BLEND_FRAGMENT_WGSL.contains("@group(2) @binding(0) var backdropTexture"));
        assert!(WGPU_BLEND_FRAGMENT_WGSL.contains("fn sepChannel"));
        assert!(WGPU_BLEND_FRAGMENT_WGSL.contains("fn setLum"));
        assert!(WGPU_BLEND_FRAGMENT_WGSL.contains("fn setSat"));
        assert!(WGPU_BLEND_FRAGMENT_WGSL.contains("if (mode == 10)"));
    }

    #[test]
    fn un_premultiplies_inputs_and_writes_premultiplied_source_over_output() {
        assert!(WGPU_BLEND_FRAGMENT_WGSL.contains("layer.rgb / layer.a"));
        assert!(WGPU_BLEND_FRAGMENT_WGSL.contains("back.rgb / back.a"));
        assert!(WGPU_BLEND_FRAGMENT_WGSL.contains("sourceAlpha + backdropAlpha * (1.0 - sourceAlpha)"));
        assert!(
            WGPU_BLEND_FRAGMENT_WGSL
                .contains("mixed * sourceAlpha + cb * backdropAlpha * (1.0 - sourceAlpha)")
        );
    }
}
