//! Access to this package's per-state record (the source's module WeakMaps keyed by state), held in
//! render-wgpu's opaque `scene2d_runtime` slot (D5).

use flight_entity::Ref;
use flight_image::{ImageResource, create_image_resolver_state, invalidate_image_resource};
use flight_render_wgpu::{
    WgpuRenderState, get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};

use crate::types::*;

// The state's package record, created on first use.
pub(crate) fn ensure_scene2d_wgpu_runtime(state: &mut WgpuRenderState) -> &mut Scene2DWgpuRuntime {
    let slot = &mut get_wgpu_render_state_runtime_mut(state).scene2d_runtime;
    if slot
        .as_ref()
        .is_none_or(|value| !value.is::<Scene2DWgpuRuntime>())
    {
        *slot = Some(Box::new(Scene2DWgpuRuntime::default()));
    }
    return slot
        .as_mut()
        .and_then(|value| value.downcast_mut::<Scene2DWgpuRuntime>())
        .expect("the scene2d-wgpu runtime slot holds a Scene2DWgpuRuntime");
}

// The state's package record when one was ever created (TS `WeakMap.get(state)`).
pub(crate) fn get_scene2d_wgpu_runtime(state: &WgpuRenderState) -> Option<&Scene2DWgpuRuntime> {
    return get_wgpu_render_state_runtime(state)
        .scene2d_runtime
        .as_ref()
        .and_then(|value| value.downcast_ref::<Scene2DWgpuRuntime>());
}

// The mutable package record when one was ever created.
pub(crate) fn get_scene2d_wgpu_runtime_mut(
    state: &mut WgpuRenderState,
) -> Option<&mut Scene2DWgpuRuntime> {
    return get_wgpu_render_state_runtime_mut(state)
        .scene2d_runtime
        .as_mut()
        .and_then(|value| value.downcast_mut::<Scene2DWgpuRuntime>());
}

// Invalidates a raster surface image (TS `invalidateImageResource`), re-measuring it through the
// state's image resolver, the explicit form of the source's module-global resolver (D5). With none
// configured the image keeps the size its host measured, as TS does with no resolver registered.
pub(crate) fn invalidate_wgpu_surface_image(state: &WgpuRenderState, image: &Ref<ImageResource>) {
    match &state.image_resolver {
        Some(resolver) => invalidate_image_resource(image, &resolver.read().unwrap()),
        None => invalidate_image_resource(image, &create_image_resolver_state()),
    }
}
