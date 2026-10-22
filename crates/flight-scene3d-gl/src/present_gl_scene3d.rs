use flight_camera::Camera3D;
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, begin_gl_render_pass, end_gl_render_pass,
    present_gl_render_target, GlRenderPassOptions,
};
use flight_scene3d::Node3D;

use crate::render_gl_scene3d::render_gl_scene3d;
use crate::types::Scene3DLightsLike;

pub fn present_gl_scene3d(
    state: &GlRenderState,
    target: &GlTextureRenderTarget,
    scene: &Node3D,
    camera: &Camera3D,
    lights: &Scene3DLightsLike,
) {
    let pass = begin_gl_render_pass(
        state,
        target,
        &GlRenderPassOptions {
            color: [0.0, 0.0, 0.0, 0.0],
            depth: 1.0,
            stencil: 0,
        },
    );
    render_gl_scene3d(&pass, scene, camera, lights);
    end_gl_render_pass(&pass);
    present_gl_render_target(state, target);
}
