use flight_effects::{EffectRef, create_contact_shadows_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

mod apply_contact_shadows_effect_to_wgpu {
    use super::*;

    // The SSAO pass's slot is [radius, intensity, resolution]: the contact descriptor's distance
    // and opacity arrive there.
    #[test]
    fn maps_the_contact_descriptor_into_the_shared_local_occlusion_realization() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let effect = create_contact_shadows_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.distance = Some(3.0);
            effect.opacity = Some(0.75);
            effect.samples = Some(24.0);
        }
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_contact_shadows_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        assert_eq!(
            &recorded_effect_uniforms(&records)[0][0..4],
            &[3.0, 0.75, 32.0, 16.0]
        );
        assert_eq!(
            recorded_pass_views(&records),
            vec![dest.read().unwrap().view.clone()]
        );
    }

    #[test]
    fn defaults_distance_and_opacity_from_the_contact_descriptor() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let effect = create_contact_shadows_effect();
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_contact_shadows_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &effect.read().unwrap(),
            );
        });

        assert_eq!(&recorded_effect_uniforms(&records)[0][0..2], &[0.5, 0.6]);
    }
}

mod register_wgpu_contact_shadows_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_its_kind_on_only_the_supplied_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        register_wgpu_contact_shadows_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_contact_shadows_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "ContactShadowsEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "ContactShadowsEffect").is_none());
    }
}

mod wgpu_contact_shadows_effect_runner {
    use super::*;

    #[test]
    fn draws_the_context_source_into_the_context_dest() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_contact_shadows_effect();
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
            wgpu_contact_shadows_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(
            recorded_pass_views(&records).last(),
            Some(&dest.read().unwrap().view.clone())
        );
        assert_eq!(
            recorded_draw_sources(&records)[0],
            source.read().unwrap().view.clone()
        );
    }
}
