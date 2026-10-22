use flight_camera::{Camera3D, create_camera_3d, get_cube_capture_face_camera_3d};
use flight_geometry::Vector3;
use flight_render_gl::{
    GlCubeRenderTarget, GlRenderState, begin_gl_cube_render_face, end_gl_cube_render_face,
};
use flight_scene3d::Node3D;
use glow::{HasContext, NativeTexture};

use crate::render_gl_scene3d::render_gl_scene3d;
use crate::types::Scene3DLightsLike;

const DEFAULT_ENVIRONMENT_CAPTURE_FAR: f32 = 1000.0;
const DEFAULT_ENVIRONMENT_CAPTURE_NEAR: f32 = 0.1;

pub struct GlEnvironmentCaptureOptions {
    pub near: Option<f32>,
    pub far: Option<f32>,
}

pub fn get_gl_environment_capture_texture(target: &GlCubeRenderTarget) -> NativeTexture {
    return target.texture;
}

pub fn render_gl_environment_capture(
    state: &mut GlRenderState,
    position: &Vector3,
    scene: &Node3D,
    lights: &Scene3DLightsLike,
    cube_target: &GlCubeRenderTarget,
    options: Option<&GlEnvironmentCaptureOptions>,
) {
    let previous_active_texture = unsafe { state.gl.get_parameter_i32(glow::ACTIVE_TEXTURE) } as u32;

    let mut camera = create_camera_3d();
    camera.near = options.and_then(|o| o.near).unwrap_or(DEFAULT_ENVIRONMENT_CAPTURE_NEAR);
    camera.far = options.and_then(|o| o.far).unwrap_or(DEFAULT_ENVIRONMENT_CAPTURE_FAR);

    for face in 0..6i32 {
        get_cube_capture_face_camera_3d(&mut camera, position, face);
        let pass = begin_gl_cube_render_face(state, cube_target, face).unwrap();
        render_gl_scene3d(state, scene, &camera, lights);
        let _ = end_gl_cube_render_face(state, &pass);
    }

    unsafe {
        state.gl.active_texture(previous_active_texture);
    }
}
