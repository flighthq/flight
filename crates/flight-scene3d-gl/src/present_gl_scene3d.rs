use flight_camera::Camera3D;
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, RenderTargetClear,
    begin_gl_render_pass, end_gl_render_pass, present_gl_render_target,
};
use flight_scene3d::Node3D;

use crate::render_gl_scene3d::render_gl_scene3d;
use crate::types::Scene3DLightsLike;

pub fn present_gl_scene3d(
    state: &mut GlRenderState,
    target: &GlTextureRenderTarget,
    scene: &Node3D,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
) {
    let clear = RenderTargetClear {
        color: Some([0.0, 0.0, 0.0, 0.0]),
        colors: None,
        depth: Some(1.0),
        stencil: Some(0),
    };
    let pass = begin_gl_render_pass(state, target, Some(&clear), None).unwrap();
    render_gl_scene3d(state, scene, camera, lights);
    end_gl_render_pass(state, &pass).unwrap();
    let _ = present_gl_render_target(state, target, None);
}
