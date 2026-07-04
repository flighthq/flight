//! IBL (image-based lighting) bake pass.
//!
//! Ports `@flighthq/scene-gl` `glEnvironmentIblBake.ts`: bakes an Environment's
//! source radiance cubemap into the split-sum IBL set (diffuse irradiance,
//! roughness-mipped prefiltered specular, and the 2D BRDF integration LUT).

use flighthq_render_gl::GlRenderState;
use flighthq_types::lighting::Environment;

use crate::gl_scene_runtime::GlSceneRuntime;

/// Bakes an Environment's source cubemap into the split-sum IBL set and stores
/// it on the scene runtime.
///
/// Stub: the full port requires the IBL bake shader programs and the cubemap
/// face rendering loop.
pub fn bake_environment_ibl(
    _state: &mut GlRenderState,
    _scene: &mut GlSceneRuntime,
    _environment: &Environment,
) {
    // Intentionally empty: the IBL bake requires the irradiance, prefiltered,
    // and BRDF LUT shader programs, fullscreen-quad VAOs, and the per-face
    // render loop. These are GPU-only operations.
}

/// Frees the IBL bake shader programs cached for a state.
pub fn destroy_gl_bake_programs(_state: &mut GlRenderState, _scene: &mut GlSceneRuntime) {
    // Intentionally empty: the bake program cache is part of the
    // GlSceneRuntime and freed when the runtime is dropped.
}
