use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flight_effects::{EffectRef, BevelType, EffectSourceMode, create_bevel_effect};
use flight_entity::Ref;
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

// One recorded draw: the view sampled at group 1, the pass it drew into, its pipeline, the
// pipeline's blend, and the floats of the uniform slot written before it.
struct DrawCall {
    source: Option<wgpu::TextureView>,
    dest: wgpu::TextureView,
    blend: Option<wgpu::BlendState>,
    uniforms: Vec<f32>,
}

#[allow(clippy::mutable_key_type)] // wgpu handles hash by id; their interior mutability never changes it
fn draw_calls(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> Vec<DrawCall> {
    let records = records.lock().unwrap();
    let mut views: HashMap<wgpu::BindGroup, wgpu::TextureView> = HashMap::new();
    let mut blends: HashMap<wgpu::RenderPipeline, Option<wgpu::BlendState>> = HashMap::new();
    let mut dest: Option<wgpu::TextureView> = None;
    let mut source: Option<wgpu::TextureView> = None;
    let mut blend: Option<wgpu::BlendState> = None;
    let mut uniforms: Vec<f32> = Vec::new();
    let mut out = Vec::new();
    for record in records.iter() {
        match record {
            WgpuCommandRecord::CreateBindGroup(created) => {
                if let Some(view) = created.views.first() {
                    views.insert(created.bind_group.clone(), view.clone());
                }
            }
            WgpuCommandRecord::CreateRenderPipeline(created) => {
                let target_blend = created.targets[0].as_ref().and_then(|target| target.blend);
                blends.insert(created.pipeline.clone(), target_blend);
            }
            WgpuCommandRecord::WriteBuffer(write) if write.data.len() == 256 => {
                uniforms = write
                    .data
                    .as_chunks::<4>()
                    .0
                    .iter()
                    .map(|bytes| f32::from_ne_bytes(*bytes))
                    .collect();
            }
            WgpuCommandRecord::BeginRenderPass(begin) => {
                dest = Some(begin.color_view.clone());
                source = None;
            }
            WgpuCommandRecord::SetPipeline(pipeline) => {
                blend = blends.get(pipeline).copied().flatten();
            }
            WgpuCommandRecord::SetBindGroup(set) if set.index == 1 => {
                source = views.get(&set.bind_group).cloned();
            }
            WgpuCommandRecord::Draw(_) => {
                out.push(DrawCall {
                    source: source.clone(),
                    dest: dest.clone().expect("a draw inside a pass"),
                    blend,
                    uniforms: uniforms.clone(),
                });
            }
            _ => {}
        }
    }
    return out;
}

fn is_erase_blend(blend: Option<wgpu::BlendState>) -> bool {
    return blend.is_some_and(|blend| blend.color.src_factor == wgpu::BlendFactor::Zero);
}

fn view_of(target: &Ref<WgpuTextureRenderTarget>) -> wgpu::TextureView {
    return target.read().unwrap().view.clone();
}

struct Applied {
    records: Arc<Mutex<Vec<WgpuCommandRecord>>>,
    source: Ref<WgpuTextureRenderTarget>,
    dest: Ref<WgpuTextureRenderTarget>,
    pool: WgpuRenderTargetPool,
}

fn apply(configure: impl FnOnce(&mut flight_effects::BevelEffect)) -> Applied {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 100, 50);
    let dest = create_test_target(&state, 100, 50);
    let mut pool = create_wgpu_render_target_pool();
    let effect = create_bevel_effect();
    configure(&mut effect.write().unwrap());
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_bevel_effect_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            &mut pool,
            &effect.read().unwrap(),
        );
    });
    return Applied {
        records,
        source,
        dest,
        pool,
    };
}

fn draws_into_dest(applied: &Applied) -> Vec<DrawCall> {
    let dest = view_of(&applied.dest);
    return draw_calls(&applied.records)
        .into_iter()
        .filter(|draw| draw.dest == dest)
        .collect();
}

const SOURCE_WIDTH: f32 = 100.0;
const SOURCE_HEIGHT: f32 = 50.0;

// The composite draw: the one draw into dest that samples the blurred field, not the source.
fn composite_uniforms(applied: &Applied) -> Vec<f32> {
    let source = view_of(&applied.source);
    return draws_into_dest(applied)
        .into_iter()
        .find(|draw| draw.source.as_ref() != Some(&source))
        .expect("the bevel composite draws into dest")
        .uniforms;
}

fn close(actual: f32, expected: f32) -> bool {
    return (actual - expected).abs() < 5e-7;
}

mod apply_bevel_effect_to_wgpu {
    use super::*;

    // Highlight and shadow colours are packed RGBA: the composite gets the RGB and an alpha that
    // multiplies the colour's own alpha into the `*Alpha` field.
    #[test]
    fn splits_a_packed_rgba_colour_into_composite_rgb_and_an_alpha_multiplied_by_its_alpha_field() {
        let uniforms = composite_uniforms(&apply(|effect| {
            effect.highlight_alpha = Some(0.5);
            effect.highlight_color = Some(0x9d55ff80);
            effect.shadow_alpha = Some(1.0);
            effect.shadow_color = Some(0x102030c0);
        }));

        assert!(close(uniforms[0], 0x9d as f32 / 255.0));
        assert!(close(uniforms[1], 0x55 as f32 / 255.0));
        assert!(close(uniforms[2], 0xff as f32 / 255.0));
        assert!(close(uniforms[3], 0x80 as f32 / 255.0 * 0.5));
        assert!(close(uniforms[4], 0x10 as f32 / 255.0));
        assert!(close(uniforms[5], 0x20 as f32 / 255.0));
        assert!(close(uniforms[6], 0x30 as f32 / 255.0));
        assert!(close(uniforms[7], 0xc0 as f32 / 255.0));
    }

    #[test]
    fn defaults_to_opaque_white_over_opaque_black() {
        let uniforms = composite_uniforms(&apply(|_| {}));

        assert_eq!(&uniforms[0..4], &[1.0, 1.0, 1.0, 1.0]);
        assert_eq!(&uniforms[4..8], &[0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn passes_the_light_offset_without_negation_on_either_axis() {
        let along_x = composite_uniforms(&apply(|effect| {
            effect.angle = Some(0.0);
            effect.distance = Some(10.0);
        }));
        assert!(close(along_x[8], 10.0 / SOURCE_WIDTH));
        assert!(close(along_x[9], 0.0));

        let along_y = composite_uniforms(&apply(|effect| {
            effect.angle = Some(90.0);
            effect.distance = Some(10.0);
        }));
        assert!(close(along_y[8], 0.0));
        assert!(close(along_y[9], 10.0 / SOURCE_HEIGHT));
    }

    #[test]
    fn normalises_each_offset_component_by_its_own_source_dimension() {
        let uniforms = composite_uniforms(&apply(|effect| {
            effect.angle = Some(45.0);
            effect.distance = Some(10.0);
        }));

        assert!(close(uniforms[8], 7.0 / SOURCE_WIDTH));
        assert!(close(uniforms[9], 7.0 / SOURCE_HEIGHT));
    }

    #[test]
    fn snaps_the_light_offset_to_whole_pixels_matching_the_surface_reference() {
        let uniforms = composite_uniforms(&apply(|effect| {
            effect.angle = Some(30.0);
            effect.distance = Some(10.0);
        }));

        assert!((uniforms[8] * SOURCE_WIDTH - 9.0).abs() < 1e-5);
        assert!((uniforms[9] * SOURCE_HEIGHT - 5.0).abs() < 1e-5);
    }

    #[test]
    fn maps_each_bevel_type_to_its_clip_mode() {
        assert_eq!(composite_uniforms(&apply(|effect| effect.bevel_type = Some(BevelType::Inner)))[11], 1.0);
        assert_eq!(composite_uniforms(&apply(|effect| effect.bevel_type = Some(BevelType::Outer)))[11], 2.0);
        assert_eq!(composite_uniforms(&apply(|effect| effect.bevel_type = Some(BevelType::Full)))[11], 0.0);
        // The default is inner, which is the one a caller gets without asking.
        assert_eq!(composite_uniforms(&apply(|_| {}))[11], 1.0);
    }

    #[test]
    fn draws_the_source_under_the_bevel_for_draw_mode_and_erases_it_for_knockout() {
        let drawn = apply(|effect| effect.source_mode = Some(EffectSourceMode::Draw));
        let source = view_of(&drawn.source);
        let source_draws: Vec<DrawCall> = draws_into_dest(&drawn)
            .into_iter()
            .filter(|draw| draw.source.as_ref() == Some(&source))
            .collect();
        assert_eq!(source_draws.len(), 1);
        assert!(!is_erase_blend(source_draws[0].blend));

        let knocked_out = apply(|effect| effect.source_mode = Some(EffectSourceMode::Knockout));
        let source = view_of(&knocked_out.source);
        let source_draws: Vec<DrawCall> = draws_into_dest(&knocked_out)
            .into_iter()
            .filter(|draw| draw.source.as_ref() == Some(&source))
            .collect();
        assert_eq!(source_draws.len(), 1);
        assert!(is_erase_blend(source_draws[0].blend));
    }

    // The field is built with a NEUTRAL tint at strength 1: `strength` is the per-pixel gradient
    // intensity in the composite, not something baked into the blurred silhouette.
    #[test]
    fn builds_the_alpha_field_with_a_neutral_tint_and_passes_strength_to_the_composite_instead() {
        let applied = apply(|effect| effect.strength = Some(3.0));
        let tint = &draw_calls(&applied.records)[0];

        assert_eq!(&tint.uniforms[0..5], &[1.0, 1.0, 1.0, 1.0, 1.0]);
        assert_eq!(composite_uniforms(&applied)[10], 3.0);
    }

    #[test]
    fn releases_every_scratch_target_it_acquired() {
        let applied = apply(|_| {});

        assert_eq!(applied.pool.free.len(), 3);
    }
}

mod register_wgpu_bevel_effect {
    use super::*;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "BevelEffect").is_none());
        register_wgpu_bevel_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_bevel_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "BevelEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_bevel_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass_and_returns_its_scratch_targets() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_bevel_effect();
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
            wgpu_bevel_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert!(draw_calls(&records).iter().any(|draw| draw.dest == view_of(&dest)));
        assert_eq!(pool.free.len(), 3);
    }
}
