//! Directional shadow map pass.
//!
//! Ports `@flighthq/scene-gl` `glShadowMap.ts`.

use flighthq_render_gl::GlRenderState;
use flighthq_types::camera::Camera;

use crate::gl_scene_runtime::GlSceneRuntime;

/// Renders scene depth from the light's point of view into a shadow map.
///
/// Stub: the full port requires the scene graph traversal, the shadow depth
/// program, and the render target infrastructure.
pub fn draw_gl_scene_shadow_map(
    _state: &mut GlRenderState,
    _scene: &mut GlSceneRuntime,
    _shadow_camera: &Camera,
) {
    // Intentionally empty: shadow map rendering requires the scene graph
    // traversal, the shadow depth program, and the GL render target.
}
