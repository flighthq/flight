//! Environment skybox draw pass.
//!
//! Ports `@flighthq/scene-gl` `glEnvironmentSkybox.ts`.

use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;
use flighthq_types::lighting::Environment;

use crate::gl_scene_runtime::GlSceneRuntime;

/// Draws the environment's radiance cubemap as the scene backdrop.
///
/// Stub: the full port requires the skybox shader program, fullscreen-quad VAO,
/// and the inverse view-projection computation.
pub fn draw_gl_environment_skybox(
    _state: &mut GlRenderState,
    _scene: &mut GlSceneRuntime,
    _environment: &Environment,
    _camera: &Camera,
    _aspect: f32,
) {
    // Intentionally empty: skybox draw requires a compiled skybox program
    // and the environment source cube texture.
}
