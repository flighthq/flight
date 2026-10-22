// flight-lint: allow-file(contract-vocabulary) D17 clip hooks are backend-typed dispatch tables over render-wgpu state
//! Clip support (TS `wgpuClip.ts`). Masks are retired — a former mask is a path ClipRegion. A clip
//! is a scissor (rect) or stencil-then-cover (contour); the two are independent gates that AND when
//! nested, and the runtime's `clip_forms` records each clip's form for the unwind.

use flight_clip::ClipRegion;
use flight_entity::Ref;
use flight_node::NodeRef;
use flight_render::{RenderProxy2D, RenderState, Scene2DClipHooks};
use flight_render_wgpu::{
    WgpuClipForm, WgpuRenderState, get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};

use crate::wgpu_clip_contours::{pop_wgpu_clip_contours, push_wgpu_clip_contours};
use crate::wgpu_clip_rectangle::{pop_wgpu_clip_rectangle, push_wgpu_clip_rectangle};

static WEBGPU_CLIP_HOOKS: Scene2DClipHooks<WgpuRenderState> = Scene2DClipHooks {
    finalize: finalize_wgpu_clip,
    pop_clip: pop_wgpu_clip,
    push_clip: push_wgpu_clip,
};

/// Installs the unified clip hooks on `state` (TS `enableWgpuClipSupport`).
pub fn enable_wgpu_clip_support(state: &mut WgpuRenderState) {
    state.render_registries_mut().clip_hooks = Some(&WEBGPU_CLIP_HOOKS);
}

fn finalize_wgpu_clip(state: &mut WgpuRenderState) {
    while !get_wgpu_render_state_runtime(state).clip_forms.is_empty() {
        pop_one_wgpu_clip(state);
    }
}

fn node_clip(source: &NodeRef) -> Option<Ref<ClipRegion>> {
    return source
        .read()
        .unwrap()
        .as_clip_node()
        .and_then(|node| node.clip_view().clip.clone());
}

fn pop_one_wgpu_clip(state: &mut WgpuRenderState) {
    let form = get_wgpu_render_state_runtime_mut(state).clip_forms.pop();
    if form == Some(WgpuClipForm::Contour) {
        pop_wgpu_clip_contours(state);
    } else {
        // Pops its own scissor stack; clip_forms tracks the count.
        pop_wgpu_clip_rectangle(state);
    }
}

fn pop_wgpu_clip(
    state: &mut WgpuRenderState,
    data: &RenderProxy2D<WgpuRenderState>,
    source: &NodeRef,
) {
    let has_clip = node_clip(source).is_some();
    let target = (data.clip_depth as usize).saturating_sub(usize::from(has_clip));
    while get_wgpu_render_state_runtime(state).clip_forms.len() > target {
        pop_one_wgpu_clip(state);
    }
}

fn push_wgpu_clip(
    state: &mut WgpuRenderState,
    data: &RenderProxy2D<WgpuRenderState>,
    source: &NodeRef,
) {
    let Some(clip) = node_clip(source) else {
        return;
    };
    let clip = clip.read().unwrap();
    match &clip.contours {
        None => {
            push_wgpu_clip_rectangle(state, &clip.rect, &data.transform_2d);
            get_wgpu_render_state_runtime_mut(state)
                .clip_forms
                .push(WgpuClipForm::Rect);
        }
        Some(contours) => {
            push_wgpu_clip_contours(state, contours, clip.winding, &data.transform_2d);
            get_wgpu_render_state_runtime_mut(state)
                .clip_forms
                .push(WgpuClipForm::Contour);
        }
    }
}
