use flight_effects::{EffectRef, create_motion_blur_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

fn create_velocity_texture(state: &WgpuRenderState) -> wgpu::Texture {
    let native = get_wgpu_render_state_native_device(state);
    return native.device.create_texture(&wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 32,
            height: 16,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba16Float,
        usage: wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    });
}

mod apply_motion_blur_effect_to_wgpu {
    use super::*;

    // Without a velocity buffer the source binds as both inputs and the shader copies through.
    #[test]
    fn copies_through_with_the_source_bound_twice_when_velocity_is_absent() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let effect = create_motion_blur_effect();
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_motion_blur_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                None,
                &effect.read().unwrap(),
            );
        });

        assert_eq!(&recorded_effect_uniforms(&records)[0][0..5], &[1.0, 16.0, 32.0, 16.0, 0.0]);
        let sets = recorded_set_bind_groups(&records);
        assert_eq!(sets[1].bind_group, sets[2].bind_group);
        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
    }

    #[test]
    fn binds_the_velocity_texture_as_the_second_source_when_present() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let velocity = create_velocity_texture(&state);
        let effect = create_motion_blur_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.intensity = Some(2.0);
            effect.samples = Some(8.0);
        }
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            apply_motion_blur_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                Some(&velocity),
                &effect.read().unwrap(),
            );
        });

        assert_eq!(&recorded_effect_uniforms(&records)[0][0..5], &[2.0, 8.0, 32.0, 16.0, 1.0]);
        let sets = recorded_set_bind_groups(&records);
        assert_eq!(
            sets.iter().map(|set| set.index).collect::<Vec<u32>>(),
            vec![0, 1, 2]
        );
        assert_ne!(sets[1].bind_group, sets[2].bind_group);
        assert_eq!(recorded_draw_sources(&records), vec![source.read().unwrap().view.clone()]);
    }
}

mod register_wgpu_motion_blur_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_its_kind_on_only_the_supplied_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        register_wgpu_motion_blur_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_motion_blur_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "MotionBlurEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "MotionBlurEffect").is_none());
    }
}

mod wgpu_motion_blur_effect_runner {
    use super::*;

    // The runner feeds the context's scene velocity texture through the velocity seam.
    #[test]
    fn feeds_the_context_scene_velocity_texture() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let velocity = create_velocity_texture(&state);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_motion_blur_effect();
        let records = record_test_commands(&state);

        with_test_frame(&mut state, |state| {
            let mut context = WgpuEffectContext {
                state,
                source: source.clone(),
                dest: dest.clone(),
                pool: &mut pool,
                scene_depth_texture: None,
                scene_velocity_texture: Some(velocity.clone()),
            };
            wgpu_motion_blur_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(recorded_effect_uniforms(&records)[0][4], 1.0);
        assert_eq!(recorded_pass_views(&records), vec![dest.read().unwrap().view.clone()]);
    }
}
