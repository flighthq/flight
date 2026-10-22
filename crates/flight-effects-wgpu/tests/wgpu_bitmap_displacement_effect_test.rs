use std::sync::{Arc, RwLock};

use flight_bitmap::{ImageChannel, create_bitmap};
use flight_effects::{
    BitmapDisplacementEffect, BitmapDisplacementEffectEdgeMode, EffectRef,
    create_bitmap_displacement_effect,
};
use flight_effects_wgpu::contract::*;
use flight_entity::Ref;
use flight_render_wgpu::*;
use flight_texture::{
    CreateTexture2DOptions, CreateTextureCommonOptions, CreateTextureOptions, Texture, Texture2D,
    TextureColorSpace, TextureSourceRef, create_texture,
};

use crate::support::*;

fn create_map() -> Ref<Texture2D> {
    let bitmap: TextureSourceRef = Arc::new(RwLock::new(create_bitmap(4, 4, Some(0x80ff40ff))));
    let texture = create_texture(Some(&CreateTextureOptions::Texture2D(
        CreateTexture2DOptions {
            common: CreateTextureCommonOptions {
                color_space: Some(TextureColorSpace::Linear),
                ..test_default()
            },
            source: Some(bitmap),
        },
    )));
    let Texture::Texture2D(texture) = texture else {
        panic!("a 2D texture");
    };
    return Arc::new(RwLock::new(texture));
}

fn create_effect(map: Option<Ref<Texture2D>>) -> Ref<BitmapDisplacementEffect> {
    let effect = create_bitmap_displacement_effect();
    effect.write().unwrap().map = map;
    return effect;
}

// A state whose bitmap sources resolve, so a bitmap-backed map realizes into a sampleable entry.
fn create_resolving_state() -> WgpuRenderState {
    let mut state = create_wgpu_render_state_for_test(None);
    register_wgpu_bitmap_texture_resolver(&mut state);
    return state;
}

fn apply(
    state: &mut WgpuRenderState,
    effect: &Ref<BitmapDisplacementEffect>,
) -> (Ref<WgpuTextureRenderTarget>, Ref<WgpuTextureRenderTarget>) {
    let source = create_test_target(state, 128, 64);
    let dest = create_test_target(state, 128, 64);
    with_test_frame(state, |state| {
        apply_bitmap_displacement_effect_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &effect.read().unwrap(),
        );
    });
    return (source, dest);
}

mod apply_bitmap_displacement_effect_to_wgpu {
    use super::*;

    #[test]
    fn binds_source_and_resolved_map_views_in_one_pass() {
        let mut state = create_resolving_state();
        let effect = create_effect(Some(create_map()));
        let records = record_test_commands(&state);

        let (source, _dest) = apply(&mut state, &effect);

        let sets = recorded_set_bind_groups(&records);
        assert_eq!(
            sets.iter().map(|set| set.index).collect::<Vec<u32>>(),
            vec![0, 1, 2]
        );
        let created = recorded_bind_groups(&records);
        let source_group = created
            .iter()
            .find(|group| group.views[0] == source.read().unwrap().view)
            .expect("a bind group over the source view");
        assert_eq!(sets[1].bind_group, source_group.bind_group);
        assert_ne!(sets[2].bind_group, source_group.bind_group);
        assert_eq!(recorded_draws(&records).len(), 1);
    }

    #[test]
    fn maps_channels_signed_scales_dimensions_and_edge_modes_into_uniforms() {
        let mut state = create_resolving_state();
        let effect = create_effect(Some(create_map()));
        {
            let mut effect = effect.write().unwrap();
            effect.component_x = Some(ImageChannel::Alpha);
            effect.component_y = Some(ImageChannel::Blue);
            effect.edge_mode = Some(BitmapDisplacementEffectEdgeMode::Clamp);
            effect.scale_x = Some(-14.0);
            effect.scale_y = Some(9.0);
        }
        let records = record_test_commands(&state);

        apply(&mut state, &effect);
        effect.write().unwrap().edge_mode = Some(BitmapDisplacementEffectEdgeMode::Wrap);
        apply(&mut state, &effect);

        let floats = recorded_effect_uniforms(&records);
        let ints = recorded_effect_uniform_ints(&records);
        assert_eq!(&floats[0][0..4], &[-14.0, 9.0, 128.0, 64.0]);
        assert_eq!(
            &ints[0][4..7],
            &[ImageChannel::Alpha as i32, ImageChannel::Blue as i32, 0]
        );
        assert_eq!(ints[1][6], 1);
    }

    #[test]
    fn ships_channel_mapping_centred_offset_wrap_clamp_and_top_left_vertical_displacement() {
        assert!(
            BITMAP_DISPLACEMENT_FRAGMENT_WGSL.contains("sampleChannel(mapSample, uni.componentX)")
        );
        assert!(
            BITMAP_DISPLACEMENT_FRAGMENT_WGSL.contains("sampleChannel(mapSample, uni.componentY)")
        );
        assert!(BITMAP_DISPLACEMENT_FRAGMENT_WGSL.contains("(mapped - vec2f(0.5)) * uni.scale"));
        assert!(BITMAP_DISPLACEMENT_FRAGMENT_WGSL.contains("fract(displaced)"));
        assert!(
            BITMAP_DISPLACEMENT_FRAGMENT_WGSL.contains("clamp(displaced, vec2f(0.0), vec2f(1.0))")
        );
        assert!(BITMAP_DISPLACEMENT_FRAGMENT_WGSL.contains("uv.y + displacement.y"));
    }

    #[test]
    fn copies_through_when_the_map_is_absent_or_unresolved() {
        // No bitmap resolver is registered, so the map cannot realize.
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);

        apply(&mut state, &create_effect(Some(create_map())));
        apply(&mut state, &create_effect(None));

        assert_eq!(recorded_draws(&records).len(), 2);
        // Each copy binds only the source group: the passthrough has no map group.
        let sets = recorded_set_bind_groups(&records);
        assert!(sets.iter().all(|set| set.index < 2));
    }
}

mod initialize_wgpu_effect_pipeline {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_wgpu_effect_pipeline() {
        let mut state = create_wgpu_render_state_for_test(None);
        let fragment = r#"
struct Uniforms { _u : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;
        let mut pipeline = create_wgpu_effect_pipeline(&mut state, fragment, None);
        let other =
            create_wgpu_effect_pipeline(&mut state, fragment, Some(WgpuEffectBlendMode::Erase));

        initialize_wgpu_effect_pipeline(
            &mut pipeline,
            WgpuEffectBlendMode::Replace,
            other.pipeline.clone(),
        );

        assert_eq!(pipeline.blend_mode, WgpuEffectBlendMode::Replace);
        assert_eq!(pipeline.pipeline, other.pipeline);
    }
}

mod is_wgpu_bitmap_displacement_effect_resolvable {
    use super::*;

    #[test]
    fn exposes_the_missing_map_sentinel() {
        let mut resolving = create_resolving_state();
        let with_map: EffectRef = create_effect(Some(create_map()));
        let without_map: EffectRef = create_effect(None);
        assert!(is_wgpu_bitmap_displacement_effect_resolvable(
            &mut resolving,
            &*with_map.read().unwrap()
        ));
        assert!(!is_wgpu_bitmap_displacement_effect_resolvable(
            &mut resolving,
            &*without_map.read().unwrap()
        ));

        let mut unresolving = create_wgpu_render_state_for_test(None);
        assert!(!is_wgpu_bitmap_displacement_effect_resolvable(
            &mut unresolving,
            &*with_map.read().unwrap()
        ));
    }
}

mod register_wgpu_bitmap_displacement_effect {
    use super::*;

    #[test]
    fn registers_both_the_runner_and_per_instance_map_resolver() {
        let mut state = create_wgpu_render_state_for_test(None);

        register_wgpu_bitmap_displacement_effect(&mut state);

        let expected: WgpuEffectRunner = wgpu_bitmap_displacement_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "BitmapDisplacementEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
        let without_map: EffectRef = create_effect(None);
        assert!(!is_wgpu_effect_resolvable(
            &mut state,
            &*without_map.read().unwrap()
        ));
    }
}

mod wgpu_bitmap_displacement_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass() {
        let mut state = create_resolving_state();
        let source = create_test_target(&state, 128, 64);
        let dest = create_test_target(&state, 128, 64);
        let mut pool = create_wgpu_render_target_pool();
        let effect = create_effect(Some(create_map()));
        {
            let mut effect = effect.write().unwrap();
            effect.scale_x = Some(3.0);
            effect.scale_y = Some(4.0);
        }
        let effect: EffectRef = effect;
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
            wgpu_bitmap_displacement_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert_eq!(&recorded_effect_uniforms(&records)[0][0..2], &[3.0, 4.0]);
    }
}
