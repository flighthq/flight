use flight_camera::{Camera3D, create_camera_3d, get_cube_capture_face_camera_3d};
use flight_geometry::Vector3;
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget,
    create_gl_texture_render_target, begin_gl_cube_render_face, end_gl_cube_render_face,
};
use glow::NativeTexture;

use crate::gl_environment_cube::get_gl_cube_face_target;

pub fn create_gl_environment_capture_target(
    state: &GlRenderState,
    size: u32,
) -> GlTextureRenderTarget {
    return create_gl_texture_render_target(state, size, size, true);
}

pub fn begin_gl_environment_capture_face(
    state: &GlRenderState,
    target: &GlTextureRenderTarget,
    face: u32,
    position: &Vector3,
    near: f32,
    far: f32,
    camera: &mut Camera3D,
) {
    get_cube_capture_face_camera_3d(camera, face, position, near, far);
    begin_gl_cube_render_face(state, target, get_gl_cube_face_target(face));
}

pub fn end_gl_environment_capture_face(
    state: &GlRenderState,
    target: &GlTextureRenderTarget,
) {
    end_gl_cube_render_face(state, target);
}
