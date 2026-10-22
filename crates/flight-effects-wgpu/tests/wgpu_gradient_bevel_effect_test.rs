use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flight_effects::{EffectRef, EffectSourceMode, create_gradient_bevel_effect};
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

fn apply(configure: impl FnOnce(&mut flight_effects::GradientBevelEffect)) -> Applied {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 100, 50);
    let dest = create_test_target(&state, 100, 50);
    let mut pool = create_wgpu_render_target_pool();
    let effect = create_gradient_bevel_effect();
    configure(&mut effect.write().unwrap());
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_gradient_bevel_effect_to_wgpu(
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

fn with_stops(effect: &mut flight_effects::GradientBevelEffect) {
    effect.alphas = vec![1.0, 1.0];
    effect.colors = vec![0x000000, 0xffffff];
    effect.ratios = vec![0.0, 255.0];
}

// The bind-group indices each recorded pass set, in pass order.
fn pass_bind_group_indices(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> Vec<Vec<u32>> {
    let mut out: Vec<Vec<u32>> = Vec::new();
    for record in records.lock().unwrap().iter() {
        match record {
            WgpuCommandRecord::BeginRenderPass(_) => out.push(Vec::new()),
            WgpuCommandRecord::SetBindGroup(set) => out.last_mut().unwrap().push(set.index),
            _ => {}
        }
    }
    return out;
}

// The encode draw writes into the first scratch target (released first) from the second.
fn light_offset(applied: &Applied) -> Vec<f32> {
    let s0 = view_of(&applied.pool.free[0]);
    let s1 = view_of(&applied.pool.free[1]);
    let encode = draw_calls(&applied.records)
        .into_iter()
        .find(|draw| draw.dest == s0 && draw.source.as_ref() == Some(&s1))
        .expect("the encode pass");
    return encode.uniforms[0..2].to_vec();
}

fn close(actual: f32, expected: f32) -> bool {
    return (actual - expected).abs() < 5e-7;
}

mod apply_gradient_bevel_effect_to_wgpu {
    use super::*;

    // The neutral tint is packed RGBA opaque white: read as 24-bit it would be a transparent cyan
    // that zeroes the blur basis the whole bevel is built from.
    #[test]
    fn builds_the_blur_basis_with_an_opaque_white_tint_in_packed_rgba() {
        let applied = apply(with_stops);

        assert_eq!(&draw_calls(&applied.records)[0].uniforms[0..4], &[1.0, 1.0, 1.0, 1.0]);
    }

    #[test]
    fn clamps_the_strength_it_folds_into_the_basis_at_one() {
        let strong = apply(|effect| {
            with_stops(effect);
            effect.strength = Some(3.0);
        });
        assert_eq!(draw_calls(&strong.records)[0].uniforms[4], 1.0);

        let weak = apply(|effect| {
            with_stops(effect);
            effect.strength = Some(0.25);
        });
        assert_eq!(draw_calls(&weak.records)[0].uniforms[4], 0.25);
    }

    #[test]
    fn passes_the_light_offset_without_negation_on_either_axis() {
        let along_x = light_offset(&apply(|effect| {
            with_stops(effect);
            effect.angle = Some(0.0);
            effect.distance = Some(10.0);
        }));
        assert!(close(along_x[0], 10.0 / SOURCE_WIDTH));
        assert!(close(along_x[1], 0.0));

        let along_y = light_offset(&apply(|effect| {
            with_stops(effect);
            effect.angle = Some(90.0);
            effect.distance = Some(10.0);
        }));
        assert!(close(along_y[0], 0.0));
        assert!(close(along_y[1], 10.0 / SOURCE_HEIGHT));
    }

    #[test]
    fn normalises_each_offset_component_by_its_own_source_dimension_without_rounding() {
        let offset = light_offset(&apply(|effect| {
            with_stops(effect);
            effect.angle = Some(30.0);
            effect.distance = Some(10.0);
        }));

        assert!(close(offset[0], (std::f32::consts::PI / 6.0).cos() * 10.0 / SOURCE_WIDTH));
        assert!(close(offset[1], (std::f32::consts::PI / 6.0).sin() * 10.0 / SOURCE_HEIGHT));
    }

    // The ramp is cached per stop set, so asking for the descriptor's exact stops afterwards hits
    // the texture the pass built and uploads nothing new.
    #[test]
    fn looks_the_band_colour_up_from_the_descriptor_stops_unchanged() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 32, 16);
        let dest = create_test_target(&state, 32, 16);
        let mut pool = create_wgpu_render_target_pool();
        let effect = create_gradient_bevel_effect();
        {
            let mut effect = effect.write().unwrap();
            effect.alphas = vec![0.0, 0.5, 1.0];
            effect.colors = vec![0x112233, 0x445566, 0x778899];
            effect.ratios = vec![0.0, 128.0, 255.0];
        }
        with_test_frame(&mut state, |state| {
            apply_gradient_bevel_effect_to_wgpu(
                state,
                &source.read().unwrap(),
                &dest.read().unwrap(),
                &mut pool,
                &effect.read().unwrap(),
            );
        });
        let records = record_test_commands(&state);

        get_wgpu_effect_gradient_ramp_texture(
            &mut state,
            &vec![0x112233, 0x445566, 0x778899],
            &vec![0.0, 0.5, 1.0],
            &vec![0.0, 128.0, 255.0],
        );

        assert!(records.lock().unwrap().is_empty());
    }

    // Two passes, in order: encode the bevel from the blurred alpha, then look the gradient up and
    // clip. The apply pass binds four groups: uniforms, encoded, ramp, source.
    #[test]
    fn runs_the_encode_pass_then_the_four_group_apply_pass() {
        let applied = apply(with_stops);
        let passes = pass_bind_group_indices(&applied.records);
        let apply_index = passes
            .iter()
            .position(|indices| indices == &vec![0, 1, 2, 3])
            .expect("the four-group apply pass");

        assert_eq!(passes[apply_index - 1], vec![0, 1]);
    }

    #[test]
    fn gives_the_two_passes_different_uniform_slots() {
        let applied = apply(with_stops);
        let mut passes: Vec<(Vec<u32>, u32)> = Vec::new();
        for record in applied.records.lock().unwrap().iter() {
            match record {
                WgpuCommandRecord::BeginRenderPass(_) => passes.push((Vec::new(), 0)),
                WgpuCommandRecord::SetBindGroup(set) => {
                    let pass = passes.last_mut().unwrap();
                    pass.0.push(set.index);
                    if set.index == 0 {
                        pass.1 = set.offsets[0];
                    }
                }
                _ => {}
            }
        }
        let apply_index = passes
            .iter()
            .position(|pass| pass.0 == vec![0, 1, 2, 3])
            .expect("the four-group apply pass");

        assert_ne!(passes[apply_index].1, passes[apply_index - 1].1);
    }

    #[test]
    fn draws_the_source_under_the_bevel_for_draw_mode_and_erases_it_for_knockout() {
        let drawn = apply(|effect| {
            with_stops(effect);
            effect.source_mode = Some(EffectSourceMode::Draw);
        });
        let source = view_of(&drawn.source);
        let s1 = view_of(&drawn.pool.free[1]);
        let draws = draws_into_dest(&drawn);
        assert_eq!(draws.len(), 2);
        assert_eq!(draws[0].source.as_ref(), Some(&source));
        assert_eq!(draws[1].source.as_ref(), Some(&s1));

        let knocked_out = apply(|effect| {
            with_stops(effect);
            effect.source_mode = Some(EffectSourceMode::Knockout);
        });
        let source = view_of(&knocked_out.source);
        let s1 = view_of(&knocked_out.pool.free[1]);
        let draws = draws_into_dest(&knocked_out);
        assert_eq!(draws.len(), 2);
        assert_eq!(draws[0].source.as_ref(), Some(&s1));
        assert_eq!(draws[1].source.as_ref(), Some(&source));
        assert!(is_erase_blend(draws[1].blend));
        let first_into_dest = recorded_pass_begins(&knocked_out.records)
            .into_iter()
            .find(|begin| begin.color_view == view_of(&knocked_out.dest))
            .unwrap();
        assert!(matches!(first_into_dest.color, WgpuColorLoadRecord::Clear(_)));
    }

    #[test]
    fn releases_every_scratch_target_it_acquired() {
        let applied = apply(with_stops);

        assert_eq!(applied.pool.free.len(), 3);
    }
}

mod effect_vertex_wgsl_namespace_stub {
    use super::*;

    // The source stubs the shared vertex shader per test and restores it; Rust has no module
    // stubbing, so the shared shader is always the shipped one.
    #[test]
    fn is_restored_after_each_test_so_it_cannot_leak_to_other_files() {
        assert!(EFFECT_VERTEX_WGSL.contains("struct VertexOut"));
    }
}

mod register_wgpu_gradient_bevel_effect {
    use super::*;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "GradientBevelEffect").is_none());
        register_wgpu_gradient_bevel_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_gradient_bevel_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "GradientBevelEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_gradient_bevel_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass_and_returns_its_scratch_targets() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_gradient_bevel_effect();
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
            wgpu_gradient_bevel_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert!(draw_calls(&records).iter().any(|draw| draw.dest == view_of(&dest)));
        assert_eq!(pool.free.len(), 3);
    }
}
