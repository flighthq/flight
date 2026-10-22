use flight_effects::{EffectRef, create_camera_motion_blur_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

fn apply_and_record(
    effect: &flight_entity::Ref<flight_effects::CameraMotionBlurEffect>,
) -> (Vec<Vec<f32>>, Vec<wgpu::TextureView>, wgpu::TextureView) {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 32, 16);
    let dest = create_test_target(&state, 32, 16);
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_camera_motion_blur_effect_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &effect.read().unwrap(),
        );
    });
    let dest_view = dest.read().unwrap().view.clone();
    return (recorded_effect_uniforms(&records), recorded_pass_views(&records), dest_view);
}

mod apply_camera_motion_blur_effect_to_wgpu {
    use super::*;

    #[test]
    fn packs_the_descriptor_defaults_into_one_pass_into_dest() {
        let (uniforms, views, dest) = apply_and_record(&create_camera_motion_blur_effect());
        assert_eq!(&uniforms[0][0..2], &[0.5, 16.0]);
        assert_eq!(views, vec![dest]);
    }

    #[test]
    fn packs_authored_intensity_and_samples() {
        let effect = create_camera_motion_blur_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.intensity = Some(0.75);
            effect.samples = Some(8.0);
        }
        let (uniforms, _, _) = apply_and_record(&effect);
        assert_eq!(&uniforms[0][0..2], &[0.75, 8.0]);
    }
}

mod register_wgpu_camera_motion_blur_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_its_kind_on_only_the_supplied_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        register_wgpu_camera_motion_blur_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_camera_motion_blur_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "CameraMotionBlurEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "CameraMotionBlurEffect").is_none());
    }
}

mod wgpu_camera_motion_blur_effect_runner {
    use super::*;

    #[test]
    fn draws_the_context_source_into_the_context_dest() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_camera_motion_blur_effect();
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
            wgpu_camera_motion_blur_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(
            recorded_pass_views(&records).last(),
            Some(&dest.read().unwrap().view.clone())
        );
        assert_eq!(recorded_draw_sources(&records)[0], source.read().unwrap().view.clone());
    }
}
