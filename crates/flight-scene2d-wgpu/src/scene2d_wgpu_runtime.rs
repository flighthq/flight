//! Access to this package's per-state record (the source's module WeakMaps keyed by state), held in
//! render-wgpu's opaque `scene2d_runtime` slot (D5), and the D17 narrowing of host 2D contexts.

use std::sync::Arc;

use flight_entity::Ref;
use flight_host::CanvasRenderingContext2D;
use flight_node::{Node, NodeRef};
use flight_render_wgpu::{
    WgpuRenderState, get_wgpu_render_state_runtime, get_wgpu_render_state_runtime_mut,
};

use crate::types::*;

// Recovers the typed handle of a node published as `Ref<T>` (the source's `renderProxy.source as
// T`, keeping object identity), or `None` for another kind.
pub(crate) fn downcast_wgpu_node_ref<T: Node>(node: &NodeRef) -> Option<Ref<T>> {
    if !node.read().unwrap().as_any().is::<T>() {
        return None;
    }
    let raw = Arc::into_raw(node.clone());
    // SAFETY: every node handle is published as `Arc<RwLock<T>>` and unsized to
    // `Arc<RwLock<dyn Node>>`; the check above proves the allocation's concrete type is `T`, so
    // dropping the vtable metadata recovers the original sized pointer of the same allocation.
    return Some(unsafe { Arc::from_raw(raw as *const std::sync::RwLock<T>) });
}

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

// The private narrowing of a host 2D context handle to its drawing members. A foreign payload is a
// host-provider programming error: the source's context type admits no other value.
pub(crate) fn narrow_canvas_2d_context(
    context: &CanvasRenderingContext2D,
) -> Arc<dyn Canvas2DContext> {
    return context
        .handle
        .downcast_ref::<Arc<dyn Canvas2DContext>>()
        .expect("CanvasRenderingContext2D handle must carry an Arc<dyn flight_scene2d_wgpu::Canvas2DContext>")
        .clone();
}
