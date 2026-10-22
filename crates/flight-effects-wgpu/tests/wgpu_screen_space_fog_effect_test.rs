use flight_effects::{EffectRef, create_screen_space_fog_effect};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

fn apply_and_record(
    effect: &flight_entity::Ref<flight_effects::ScreenSpaceFogEffect>,
) -> (Vec<Vec<f32>>, Vec<wgpu::TextureView>, wgpu::TextureView) {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 32, 16);
    let dest = create_test_target(&state, 32, 16);
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_screen_space_fog_effect_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &effect.read().unwrap(),
        );
    });
    let dest_view = dest.read().unwrap().view.clone();
    return (
        recorded_effect_uniforms(&records),
        recorded_pass_views(&records),
        dest_view,
    );
}

mod apply_screen_space_fog_effect_to_wgpu {
    use super::*;

    #[test]
    fn unpacks_the_default_fog_color_after_the_padded_density_slot() {
        let (uniforms, views, dest) = apply_and_record(&create_screen_space_fog_effect());
        assert_eq!(uniforms[0][0], 1.0);
        assert_eq!(&uniforms[0][1..4], &[0.0, 0.0, 0.0]);
        assert_eq!(uniforms[0][4], 0xc8 as f32 / 255.0);
        assert_eq!(uniforms[0][5], 0xd2 as f32 / 255.0);
        assert_eq!(uniforms[0][6], 0xdc as f32 / 255.0);
        assert_eq!(views, vec![dest]);
    }

    #[test]
    fn unpacks_an_authored_packed_rgba_color_and_density() {
        let effect = create_screen_space_fog_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.color = Some(0xff8000ff);
            effect.density = Some(0.5);
        }
        let (uniforms, _, _) = apply_and_record(&effect);
        assert_eq!(uniforms[0][0], 0.5);
        assert_eq!(&uniforms[0][4..7], &[1.0, 0x80 as f32 / 255.0, 0.0]);
    }
}

mod register_wgpu_screen_space_fog_effect {
    use super::*;

    #[test]
    fn registers_the_default_runner_under_its_kind_on_only_the_supplied_state() {
        let mut state = create_wgpu_render_state_for_test(None);
        let other = create_wgpu_render_state_for_test(None);
        register_wgpu_screen_space_fog_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_screen_space_fog_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "ScreenSpaceFogEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        assert!(get_wgpu_effect_runner(&other, "ScreenSpaceFogEffect").is_none());
    }
}

mod wgpu_screen_space_fog_effect_runner {
    use super::*;

    #[test]
    fn draws_the_context_source_into_the_context_dest() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 8, 8);
        let dest = create_test_target(&state, 8, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_screen_space_fog_effect();
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
            wgpu_screen_space_fog_effect_runner(&mut context, &*effect.read().unwrap());
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
