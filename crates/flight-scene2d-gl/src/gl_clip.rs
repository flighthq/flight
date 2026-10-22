// flight-lint: allow-file(contract-vocabulary) D17 clip hooks are backend-typed dispatch tables over thread-bound render-gl state

use flight_node::NodeRef;
use flight_render::{RenderProxy2D, Scene2DClipHooks};
use flight_render_gl::{GlClipForm, GlRenderState};

use crate::gl_clip_contours::{pop_gl_clip_contours, push_gl_clip_contours};
use crate::gl_clip_rectangle::{pop_gl_clip_rectangle, push_gl_clip_rectangle};

static WEBGL_CLIP_HOOKS: Scene2DClipHooks<GlRenderState> = Scene2DClipHooks {
    finalize: finalize_gl_clip,
    pop_clip: pop_gl_clip,
    push_clip: push_gl_clip,
};

// Clip support installs the unified clip hooks. Masks are retired — a former mask is now a path
// ClipRegion, realized by the contour stencil.
pub fn enable_gl_clip_support(state: &mut GlRenderState) {
    state.registries.clip_hooks = Some(&WEBGL_CLIP_HOOKS);
}

fn finalize_gl_clip(state: &mut GlRenderState) {
    while !state.gl_runtime.borrow().clip_forms.is_empty() {
        pop_one_gl_clip(state);
    }
}

fn node_clip(source: &NodeRef) -> Option<flight_entity::Ref<flight_clip::ClipRegion>> {
    return source
        .read()
        .unwrap()
        .as_clip_node()
        .and_then(|node| node.clip_view().clip.clone());
}

fn pop_gl_clip(state: &mut GlRenderState, data: &RenderProxy2D<GlRenderState>, source: &NodeRef) {
    let has_clip = node_clip(source).is_some();
    let target = (data.clip_depth as usize).saturating_sub(usize::from(has_clip));
    while state.gl_runtime.borrow().clip_forms.len() > target {
        pop_one_gl_clip(state);
    }
}

// A clip is realized as a scissor (rect form) or stencil-then-cover (contour form). These are
// independent hardware gates that AND together when nested. `clip_forms` records each pushed clip's
// form so the depth-driven unwind un-installs the right gate.
fn pop_one_gl_clip(state: &mut GlRenderState) {
    let form = state.gl_runtime.borrow_mut().clip_forms.pop();
    if form == Some(GlClipForm::Contour) {
        pop_gl_clip_contours(state);
    } else {
        pop_gl_clip_rectangle(state);
    }
}

fn push_gl_clip(state: &mut GlRenderState, data: &RenderProxy2D<GlRenderState>, source: &NodeRef) {
    let Some(clip) = node_clip(source) else {
        return;
    };
    let clip = clip.read().unwrap();
    match &clip.contours {
        None => {
            push_gl_clip_rectangle(state, &clip.rect, &data.transform_2d);
            state
                .gl_runtime
                .borrow_mut()
                .clip_forms
                .push(GlClipForm::Rect);
        }
        Some(contours) => {
            push_gl_clip_contours(state, contours, clip.winding, &data.transform_2d);
            state
                .gl_runtime
                .borrow_mut()
                .clip_forms
                .push(GlClipForm::Contour);
        }
    }
}
