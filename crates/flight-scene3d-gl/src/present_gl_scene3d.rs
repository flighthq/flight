// flight-lint: allow-file(contract-vocabulary) D17 the no-effects 3D present drives thread-bound render-gl targets

use flight_render::RenderTargetClear;
use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};

use flight_camera::Camera3D;
use flight_entity::throw_error;
use flight_lighting::Scene3DLightsLike;
use flight_node::NodeRef;
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, begin_gl_render_pass,
    end_gl_render_pass, present_gl_render_target,
};

use crate::render_gl_scene3d::render_gl_scene3d;

// The no-effects 3D path, a thin composition of the generic pass + present primitives: begin a pass
// (clearing color + depth), draw the scene, end the pass (restore + resolve MSAA) even when the draw
// throws, then present (render_gl_scene3d declared the target 'linear', so present runs the sRGB encode
// to the canvas). It is an alternative to the effect pipeline, not a companion.
//
// `target` is the caller-owned linear intermediate: create it once with create_gl_texture_render_target
// (rgba16f, depth-stencil, linear) and resize it to the canvas each frame before calling.
// flight-lint: allow(conform-params) D17 the native pass needs the render state mutably and the target to declare its color space
pub fn present_gl_scene3d(
    state: &mut GlRenderState,
    target: &mut GlTextureRenderTarget,
    scene: &NodeRef,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
) {
    let clear = RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: Some(1.0),
        stencil: Some(0),
    };
    let pass = begin_gl_render_pass(state, &*target, Some(&clear), None)
        .unwrap_or_else(|error| throw_error(&error));
    let drawn = catch_unwind(AssertUnwindSafe(|| {
        render_gl_scene3d(state, &pass, Some(&mut *target), scene, camera, lights, None);
    }));
    let ended = end_gl_render_pass(state, &pass);
    if let Err(payload) = drawn {
        resume_unwind(payload);
    }
    ended.unwrap_or_else(|error| throw_error(&error));
    present_gl_render_target(state, target, None).unwrap_or_else(|error| throw_error(&error));
}
