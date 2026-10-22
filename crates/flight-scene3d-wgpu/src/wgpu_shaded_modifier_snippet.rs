use flight_entity::Kind;
use flight_render_wgpu::WgpuRenderState;

use crate::types::WgpuModifierSnippet;
use crate::wgpu_scene3d_runtime::{get_wgpu_scene3d_runtime, get_wgpu_scene3d_runtime_mut};

pub fn register_wgpu_modifier_snippet(state: &WgpuRenderState, snippet: WgpuModifierSnippet) {
    let kind = snippet.kind.clone();
    get_wgpu_scene3d_runtime_mut(state, |rt| {
        rt.modifier_snippets.insert(kind, snippet);
    });
}

pub fn has_wgpu_modifier_snippet(state: &WgpuRenderState, kind: &Kind) -> bool {
    return get_wgpu_scene3d_runtime(state, |rt| rt.modifier_snippets.contains_key(kind));
}

pub fn resolve_wgpu_modifier_snippet<R>(
    state: &WgpuRenderState,
    kind: &Kind,
    f: impl FnOnce(Option<&WgpuModifierSnippet>) -> R,
) -> R {
    return get_wgpu_scene3d_runtime(state, |rt| f(rt.modifier_snippets.get(kind)));
}
