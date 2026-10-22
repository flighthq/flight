//! The state-scoped WGSL modifier compiler registry (TS `wgpuShadedModifierSnippet.ts`):
//! last-write-wins, and an unknown kind is an expected miss that contributes nothing.

use std::sync::Arc;

use flight_registry::with_kind_map_entry;
use flight_render_wgpu::{
    WgpuModifierSnippet, WgpuRenderState, get_wgpu_render_state_runtime,
    get_wgpu_render_state_runtime_mut,
};

/// Registers a modifier snippet against its kind on this state, replacing any earlier one, and
/// bumps the state's snippet revision so composed pipelines recompile (TS
/// `registerWgpuModifierSnippet`).
pub fn register_wgpu_modifier_snippet(
    state: &mut WgpuRenderState,
    snippet: &'static WgpuModifierSnippet,
) {
    let runtime = get_wgpu_render_state_runtime_mut(state);
    runtime.registries.modifier_snippets = Arc::new(with_kind_map_entry(
        &runtime.registries.modifier_snippets,
        snippet.kind.to_string(),
        snippet,
    ));
    runtime.modifier_snippet_revision += 1;
}

/// The snippet registered for a modifier kind on this state, or `None` (TS
/// `resolveWgpuModifierSnippet`).
pub fn resolve_wgpu_modifier_snippet(
    state: &WgpuRenderState,
    kind: &str,
) -> Option<&'static WgpuModifierSnippet> {
    return get_wgpu_render_state_runtime(state)
        .registries
        .modifier_snippets
        .entries
        .get(kind)
        .copied();
}
