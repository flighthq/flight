//! This package's per-state and per-context records (the source's module WeakMaps keyed by
//! `GlRenderState` / `GlContext`), held in render-gl's opaque `scene2d_runtime` /
//! `scene2d_context_runtime` slots (D5: explicit state, no hidden globals).

use std::cell::RefMut;

use flight_render_gl::GlRenderState;

use crate::types::{Scene2DGlContextRuntime, Scene2DGlRuntime};

// The context's package record, created on first use.
pub(crate) fn ensure_scene2d_gl_context_runtime(
    state: &GlRenderState,
) -> RefMut<'_, Scene2DGlContextRuntime> {
    let context = state.context_state.runtime_state.borrow_mut();
    return RefMut::map(context, |context| {
        let slot = &mut context.scene2d_context_runtime;
        if slot
            .as_ref()
            .is_none_or(|value| !value.is::<Scene2DGlContextRuntime>())
        {
            *slot = Some(Box::new(Scene2DGlContextRuntime::default()));
        }
        return slot
            .as_mut()
            .and_then(|value| value.downcast_mut::<Scene2DGlContextRuntime>())
            .expect("the scene2d-gl context slot holds a Scene2DGlContextRuntime");
    });
}

// The state's package record, created on first use.
pub(crate) fn ensure_scene2d_gl_runtime(state: &GlRenderState) -> RefMut<'_, Scene2DGlRuntime> {
    let runtime = state.gl_runtime.borrow_mut();
    return RefMut::map(runtime, |runtime| {
        let slot = &mut runtime.scene2d_runtime;
        if slot
            .as_ref()
            .is_none_or(|value| !value.is::<Scene2DGlRuntime>())
        {
            *slot = Some(Box::new(Scene2DGlRuntime::default()));
        }
        return slot
            .as_mut()
            .and_then(|value| value.downcast_mut::<Scene2DGlRuntime>())
            .expect("the scene2d-gl state slot holds a Scene2DGlRuntime");
    });
}
