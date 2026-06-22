//! The WebGL2 3D scene draw walk.
//!
//! Ports `@flighthq/scene-gl` `drawGlScene.ts`: retrieves the prepared
//! `SceneRenderList` (`prepareSceneRender` cached per-state scratch) and, for each
//! visible `Mesh`, draws each geometry subset with the subset's resolved
//! material's registered mesh-material renderer, re-binding only when the resolved
//! renderer or material changes (the "contiguous run" contract).
//!
//! // TODO(align): this is a COMPILING STUB. A faithful port needs the 3D
//! scene-render contract that is not yet ported to the Rust crates:
//!   - `prepare_scene_render` + `SceneRenderList` (`flighthq-render`) — resolves
//!     world matrices, the camera view-projection, frustum culling, and the packed
//!     light block into the per-state visible-mesh list.
//!   - the `scene` graph's `Mesh` / `createScene` / `createMesh` API
//!     (`flighthq-scene` still exposes the old `world`/`WorldNode` graph).
//!   - `SceneLights` and `StandardPbrMaterial` (`flighthq-types` /
//!     `flighthq-materials`).
//! Until those land, this function exposes the canonical seam and performs no
//! draws. The per-subset bind/run loop, the alias-safe `boundRenderer`/
//! `boundMaterial` tracking, and `setMatrix3NormalFromMatrix4` per mesh are the
//! work to restore once the contract is available.

use flighthq_render_gl::GlRenderState;

use crate::gl_scene_runtime::GlSceneRuntime;
use crate::scene_render_contract::{Camera, SceneLightBlock};

/// Draws a prepared 3D scene on the Gl backend, drawing each visible mesh subset
/// with its registered mesh-material renderer.
///
/// // TODO(align): no-op until the 3D scene-render contract (see module docs) is
/// ported. The signature is provisional — it will take the scene root + camera +
/// `SceneLights` and run `prepare_scene_render` to obtain the visible-mesh list,
/// matching the TS `drawGlScene(state, scene, camera, lights)`.
pub fn draw_gl_scene(
    _state: &mut GlRenderState,
    _scene: &mut GlSceneRuntime,
    _camera: &Camera,
    _lights: &SceneLightBlock,
) {
    // Intentionally empty: the visible-mesh list, per-subset material resolution,
    // and the bound-run draw loop require the unported scene-render contract.
}
