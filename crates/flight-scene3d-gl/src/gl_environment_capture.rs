// flight-lint: allow-file(contract-vocabulary) D17 captures render into a native glow cube target on thread-bound render-gl state

use std::panic::{AssertUnwindSafe, catch_unwind, resume_unwind};

use flight_camera::{
    Camera3D, Projection, create_camera_3d, create_perspective_projection,
    get_cube_capture_face_camera_3d,
};
use flight_entity::throw_error;
use flight_geometry::Vector3;
use flight_lighting::Scene3DLightsLike;
use flight_node::NodeRef;
use flight_render_gl::{
    GlCubeRenderTarget, GlRenderState, begin_gl_cube_render_face, end_gl_cube_render_face,
};
use glow::{HasContext, NativeTexture};

use crate::gl_environment_skybox::render_gl_environment_skybox;
use crate::gl_scene3d_runtime::get_gl_scene3d_runtime;
use crate::render_gl_scene3d::render_gl_scene3d;
use crate::types::GlEnvironmentCaptureOptions;

// The per-state reusable capture camera (TS module WeakMap keyed by state), lent out for one capture
// and returned to the runtime slot afterwards.
fn get_gl_environment_capture_camera(state: &GlRenderState) -> Camera3D {
    if let Some(camera) = get_gl_scene3d_runtime(state)
        .environment_capture_camera
        .take()
    {
        return camera;
    }
    let mut camera = create_camera_3d();
    camera.far = DEFAULT_ENVIRONMENT_CAPTURE_FAR;
    camera.near = DEFAULT_ENVIRONMENT_CAPTURE_NEAR;
    let projection = create_perspective_projection();
    {
        let mut perspective = projection.write().unwrap();
        perspective.aspect = 1.0;
        perspective.fov_y = std::f32::consts::PI * 0.5;
    }
    camera.projection = Projection::Perspective(projection);
    return camera;
}

// Returns the backend-native cubemap produced by render_gl_environment_capture. The handle can be bound
// directly for GL-only sampling; bake_gl_environment_capture_ibl is the higher-level bridge into
// Flight's state-scoped PBR image-based-lighting path.
pub fn get_gl_environment_capture_texture(target: &GlCubeRenderTarget) -> NativeTexture {
    return target.texture;
}

// Renders `scene` synchronously into all six faces of `cube_target` from `position`. Face cameras use
// the camera package's canonical +X, -X, +Y, -Y, +Z, -Z orientations and a square 90-degree field of
// view. The caller owns capture cadence; one call always completes all six faces.
pub fn render_gl_environment_capture(
    state: &mut GlRenderState,
    position: &Vector3,
    scene: &NodeRef,
    lights: &Scene3DLightsLike,
    cube_target: &mut GlCubeRenderTarget,
    options: Option<&GlEnvironmentCaptureOptions>,
) {
    // SAFETY: a state query on the state's owning GL thread.
    let previous_active_texture =
        unsafe { state.gl.get_parameter_i32(glow::ACTIVE_TEXTURE) } as u32;
    let mut camera = get_gl_environment_capture_camera(state);
    camera.near = options
        .and_then(|options| options.near)
        .unwrap_or(DEFAULT_ENVIRONMENT_CAPTURE_NEAR);
    camera.far = options
        .and_then(|options| options.far)
        .unwrap_or(DEFAULT_ENVIRONMENT_CAPTURE_FAR);

    let excluded = options.and_then(|options| options.exclude_node.clone());
    let excluded_enabled = excluded
        .as_ref()
        .map(|node| node.read().unwrap().node_fields().enabled);
    let environment = options.and_then(|options| options.environment.clone());
    // Exclusion is a synchronous draw-only override. Direct assignment deliberately avoids publishing
    // node-change signals for a state that never becomes observable outside this bracket.
    if let Some(node) = &excluded {
        node.write().unwrap().node_fields_mut().enabled = false;
    }
    let result = catch_unwind(AssertUnwindSafe(|| {
        for face in 0..6 {
            get_cube_capture_face_camera_3d(&mut camera, position, face);
            let pass = begin_gl_cube_render_face(state, cube_target, face)
                .unwrap_or_else(|error| throw_error(&error));
            let drawn = catch_unwind(AssertUnwindSafe(|| {
                if let Some(environment) = &environment {
                    render_gl_environment_skybox(state, &environment.read().unwrap(), &camera, 1.0);
                }
                render_gl_scene3d(
                    state,
                    &pass,
                    Some(&mut *cube_target),
                    scene,
                    &camera,
                    lights,
                    None,
                );
            }));
            let ended = end_gl_cube_render_face(state, &pass);
            if let Err(payload) = drawn {
                resume_unwind(payload);
            }
            if let Err(error) = ended {
                throw_error(&error);
            }
        }
    }));
    if let (Some(node), Some(enabled)) = (&excluded, excluded_enabled) {
        node.write().unwrap().node_fields_mut().enabled = enabled;
    }
    // SAFETY: restoring the unit captured above on the same context.
    unsafe { state.gl.active_texture(previous_active_texture) };
    // The face camera returns to its per-state slot for the next capture.
    get_gl_scene3d_runtime(state).environment_capture_camera = Some(camera);
    if let Err(payload) = result {
        resume_unwind(payload);
    }
}

const DEFAULT_ENVIRONMENT_CAPTURE_FAR: f32 = 1000.0;
const DEFAULT_ENVIRONMENT_CAPTURE_NEAR: f32 = 0.1;
