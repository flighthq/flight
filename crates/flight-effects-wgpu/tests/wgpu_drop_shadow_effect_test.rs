use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flight_effects::{EffectRef, EffectSourceMode, create_drop_shadow_effect};
use flight_effects_wgpu::contract::*;
use flight_entity::Ref;
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

fn apply(configure: impl FnOnce(&mut flight_effects::DropShadowEffect)) -> Applied {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, 32, 16);
    let dest = create_test_target(&state, 32, 16);
    let mut pool = create_wgpu_render_target_pool();
    let effect = create_drop_shadow_effect();
    configure(&mut effect.write().unwrap());
    let records = record_test_commands(&state);
    with_test_frame(&mut state, |state| {
        apply_drop_shadow_effect_to_wgpu(
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

mod apply_drop_shadow_effect_to_wgpu {
    use super::*;

    #[test]
    fn draws_the_source_by_default() {
        let applied = apply(|_| {});
        let source = view_of(&applied.source);
        let draws = draws_into_dest(&applied);

        assert!(
            draws
                .iter()
                .any(|draw| draw.source.as_ref() == Some(&source) && !is_erase_blend(draw.blend))
        );
        assert!(!draws.iter().any(|draw| is_erase_blend(draw.blend)));
    }

    #[test]
    fn hides_the_source_when_source_mode_is_hide() {
        let applied = apply(|effect| effect.source_mode = Some(EffectSourceMode::Hide));
        let source = view_of(&applied.source);
        let draws = draws_into_dest(&applied);

        assert!(
            !draws
                .iter()
                .any(|draw| draw.source.as_ref() == Some(&source))
        );
        assert!(!draws.iter().any(|draw| is_erase_blend(draw.blend)));
    }

    #[test]
    fn erases_the_source_silhouette_when_source_mode_is_knockout() {
        let applied = apply(|effect| effect.source_mode = Some(EffectSourceMode::Knockout));
        let source = view_of(&applied.source);
        let draws = draws_into_dest(&applied);

        assert!(
            !draws
                .iter()
                .any(|draw| draw.source.as_ref() == Some(&source) && !is_erase_blend(draw.blend))
        );
        assert!(
            draws
                .iter()
                .any(|draw| draw.source.as_ref() == Some(&source) && is_erase_blend(draw.blend))
        );
    }

    #[test]
    fn clears_the_destination_and_returns_every_scratch_target() {
        let applied = apply(|_| {});
        let begins = recorded_pass_begins(&applied.records);
        let first_into_dest = begins
            .iter()
            .find(|begin| begin.color_view == view_of(&applied.dest))
            .unwrap();

        assert!(matches!(
            first_into_dest.color,
            WgpuColorLoadRecord::Clear(_)
        ));
        assert_eq!(applied.pool.free.len(), 3);
    }

    // The shadow blit samples `uv + offset`, so a screen-space shift down-right offsets the sample
    // up-left: the offset uniform is negated and normalized by the source extent.
    #[test]
    fn offsets_the_blurred_shadow_by_angle_and_distance() {
        let applied = apply(|effect| {
            effect.angle = Some(0.0);
            effect.distance = Some(8.0);
            effect.source_mode = Some(EffectSourceMode::Hide);
        });
        let draws = draws_into_dest(&applied);

        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].uniforms[0], -8.0 / 32.0);
        assert!(draws[0].uniforms[1].abs() < 1e-6);
    }
}

mod register_wgpu_drop_shadow_effect {
    use super::*;

    #[test]
    fn is_a_separately_importable_registration_primitive() {
        let mut state = create_wgpu_render_state_for_test(None);
        assert!(get_wgpu_effect_runner(&state, "DropShadowEffect").is_none());
        register_wgpu_drop_shadow_effect(&mut state);
        let expected: WgpuEffectRunner = wgpu_drop_shadow_effect_runner;
        assert!(
            get_wgpu_effect_runner(&state, "DropShadowEffect")
                .is_some_and(|runner| std::ptr::fn_addr_eq(runner, expected))
        );
    }
}

mod wgpu_drop_shadow_effect_runner {
    use super::*;

    #[test]
    fn routes_the_runner_context_through_to_the_pass_and_returns_its_scratch_targets() {
        let mut state = create_wgpu_render_state_for_test(None);
        let source = create_test_target(&state, 16, 8);
        let dest = create_test_target(&state, 16, 8);
        let mut pool = create_wgpu_render_target_pool();
        let effect: EffectRef = create_drop_shadow_effect();
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
            wgpu_drop_shadow_effect_runner(&mut context, &*effect.read().unwrap());
        });

        assert!(
            draw_calls(&records)
                .iter()
                .any(|draw| draw.dest == view_of(&dest))
        );
        assert_eq!(pool.free.len(), 3);
    }
}
