use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flight_effects::{EffectRef, EffectSourceMode, create_gradient_glow_effect};
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
}

#[allow(clippy::mutable_key_type)] // wgpu handles hash by id; their interior mutability never changes it
fn draw_calls(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> Vec<DrawCall> {
    let records = records.lock().unwrap();
    let mut views: HashMap<wgpu::BindGroup, wgpu::TextureView> = HashMap::new();
    let mut blends: HashMap<wgpu::RenderPipeline, Option<wgpu::BlendState>> = HashMap::new();
    let mut dest: Option<wgpu::TextureView> = None;
    let mut source: Option<wgpu::TextureView> = None;
    let mut blend: Option<wgpu::BlendState> = None;
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

fn apply(configure: impl FnOnce(&mut flight_effects::GradientGlowEffect)) -> Applied {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 32, 16);
    let dest = create_test_target(&state, 32, 16);
    let mut pool = create_wgpu_render_target_pool();
    let effect = create_gradient_glow_effect();
    configure(&mut effect.write().unwrap());
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_gradient_glow_effect_to_wgpu(
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

fn with_stops(effect: &mut flight_effects::GradientGlowEffect) {
    effect.alphas = vec![1.0, 1.0];
    effect.colors = vec![0x000000, 0xffffff];
    effect.ratios = vec![0.0, 255.0];
}

mod apply_gradient_glow_effect_to_wgpu {
    use super::*;

    // The glow is the ramp lookup of the blurred silhouette, composited before the source.
    #[test]
    fn composites_the_ramp_lookup_then_draws_the_source_by_default() {
        let applied = apply(with_stops);
        let draws = draws_into_dest(&applied);
        let s0 = view_of(&applied.pool.free[0]);

        assert_eq!(draws.len(), 2);
        assert_eq!(draws[0].source.as_ref(), Some(&s0));
        assert_eq!(draws[1].source.as_ref(), Some(&view_of(&applied.source)));
        assert!(!is_erase_blend(draws[1].blend));
    }

    #[test]
    fn looks_the_glow_colour_up_through_a_two_group_ramp_pass() {
        let applied = apply(with_stops);
        let sets = recorded_set_bind_groups(&applied.records);

        assert!(sets.iter().any(|set| set.index == 2));
        assert!(!sets.iter().any(|set| set.index == 3));
    }

    #[test]
    fn erases_the_source_silhouette_when_source_mode_is_knockout() {
        let applied = apply(|effect| {
            with_stops(effect);
            effect.source_mode = Some(EffectSourceMode::Knockout);
        });
        let draws = draws_into_dest(&applied);

        assert_eq!(draws.len(), 2);
        assert!(is_erase_blend(draws[1].blend));
    }

    #[test]
    fn releases_every_scratch_target_it_acquired() {
        let applied = apply(with_stops);

        assert_eq!(applied.pool.free.len(), 3);
    }
}

mod register_wgpu_gradient_glow_effect {
    use super::*;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "GradientGlowEffect").is_none());
        register_wgpu_gradient_glow_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_gradient_glow_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "GradientGlowEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_gradient_glow_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass_and_returns_its_scratch_targets() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_gradient_glow_effect();
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
            wgpu_gradient_glow_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert!(draw_calls(&records).iter().any(|draw| draw.dest == view_of(&dest)));
        assert_eq!(pool.free.len(), 3);
    }
}
