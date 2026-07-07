//! Environment source cubemap upload.
//!
//! Ports `@flighthq/scene-gl` `glEnvironmentCube.ts`.

use flighthq_render_gl::GlRenderState;
use flighthq_types::lighting::Environment;

use crate::gl_scene_runtime::GlSceneRuntime;

/// Uploads an Environment's source radiance cubemap to a GL cubemap texture,
/// caching it on the scene runtime. Returns `None` when the environment has no
/// complete cube.
pub fn ensure_gl_environment_source_cube(
    _state: &mut GlRenderState,
    scene: &mut GlSceneRuntime,
    _environment: &Environment,
) -> Option<glow::Texture> {
    if let Some(cube) = scene.environment_source_cube {
        return Some(cube);
    }
    // Stub: full port requires CubeTexture face upload from Environment.
    // The six faces must be uploaded via gl.texImage2D per face.
    None
}

/// The cubemap face target for a face index (0..6).
pub fn get_gl_cube_face_target(face: u32) -> u32 {
    glow::TEXTURE_CUBE_MAP_POSITIVE_X + face
}
