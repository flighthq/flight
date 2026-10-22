use std::cell::RefCell;

use flight_camera::{Camera3D, Projection};
use flight_entity::throw_error;
use flight_geometry::create_vector3;
use flight_lighting::{Scene3DLightBlock, Scene3DLightsLike, create_scene_3d_lights};
use flight_materials::Material3D;
use flight_materials::material3d::create_material3d;
use flight_meshgeometry::create_box_mesh_geometry;
use flight_node::{Node, NodeRef};
use flight_render::Scene3DRenderProxy;
use flight_render_gl::{
    GlMeshMaterialRenderer, GlRenderState, create_gl_cube_render_target, destroy_gl_cube_render_target,
};
use flight_scene3d::{Mesh, Node3DFields, create_node3d, publish_node3d};
use flight_scene3d_gl::contract::*;
use glow::{HasContext, NativeFramebuffer};

use crate::gl_test_helper::{
    add_test_mesh, calls_with, make_gl_scene3d_state, make_test_scene, material_ref, set_viewport,
    thrown_message,
};

const CAPTURE_MATERIAL_KIND: &str = "test:EnvironmentCapture";

#[derive(Clone, Debug)]
struct CameraSnapshot {
    aspect: f32,
    far: f32,
    fov_y: f32,
    near: f32,
    view: [f32; 16],
}

thread_local! {
    static CAMERAS: RefCell<Vec<CameraSnapshot>> = const { RefCell::new(Vec::new()) };
}

fn record_camera(camera: &Camera3D) {
    let Projection::Perspective(projection) = &camera.projection else {
        throw_error("capture camera must be perspective");
    };
    let projection = projection.read().unwrap();
    let snapshot = CameraSnapshot {
        aspect: projection.aspect,
        far: camera.far,
        fov_y: projection.fov_y,
        near: camera.near,
        view: camera.view.read().unwrap().m,
    };
    CAMERAS.with(|cameras| cameras.borrow_mut().push(snapshot));
}

fn bind_capture(
    _state: &mut GlRenderState,
    _material: Option<&dyn Material3D>,
    _lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    record_camera(camera);
}

fn bind_capture_throwing(
    _state: &mut GlRenderState,
    _material: Option<&dyn Material3D>,
    _lights: &Scene3DLightBlock,
    camera: &Camera3D,
) {
    record_camera(camera);
    throw_error("capture draw failed");
}

fn draw_capture(_state: &mut GlRenderState, _proxy: &Scene3DRenderProxy, _geometry: &flight_meshgeometry::MeshGeometry) {}

static CAPTURE_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_capture,
    draw: draw_capture,
};

static THROWING_CAPTURE_RENDERER: GlMeshMaterialRenderer = GlMeshMaterialRenderer {
    bind: bind_capture_throwing,
    draw: draw_capture,
};

fn no_lights() -> Scene3DLightsLike {
    let mut lights = create_scene_3d_lights();
    lights.ambient = None;
    lights.directional = None;
    return lights;
}

const ACTIVE_TEXTURE: u32 = glow::TEXTURE0 + 5;

// A state whose caller-side GL bindings (active unit, framebuffer, viewport) are non-default, so the
// capture's restoration of each is observable.
fn make_capture_state() -> (GlRenderState, NativeFramebuffer) {
    let state = make_gl_scene3d_state();
    // SAFETY: mock GL calls on the test thread.
    let previous_framebuffer = unsafe {
        state.gl.active_texture(ACTIVE_TEXTURE);
        let framebuffer = state.gl.create_framebuffer().unwrap();
        state.gl.bind_framebuffer(glow::FRAMEBUFFER, Some(framebuffer));
        framebuffer
    };
    set_viewport(7, 8, 90, 70);
    CAMERAS.with(|cameras| cameras.borrow_mut().clear());
    return (state, previous_framebuffer);
}

fn add_capture_mesh(state: &mut GlRenderState, throw_on_bind: bool) -> (flight_entity::Ref<Mesh>, NodeRef) {
    let renderer = if throw_on_bind {
        &THROWING_CAPTURE_RENDERER
    } else {
        &CAPTURE_RENDERER
    };
    register_gl_mesh_material_renderer(state, CAPTURE_MATERIAL_KIND.to_string(), renderer);
    let scene = make_test_scene();
    // Enclose the capture position so the real frustum cull keeps this observer mesh for every face.
    let mesh = add_test_mesh(
        &scene,
        create_box_mesh_geometry(Some(100.0), Some(100.0), Some(100.0)),
        vec![Some(material_ref(create_material3d(CAPTURE_MATERIAL_KIND.to_string())))],
    );
    return (mesh, scene);
}

fn cameras() -> Vec<CameraSnapshot> {
    return CAMERAS.with(|cameras| cameras.borrow().clone());
}

fn last_integers(name: &str) -> Vec<i64> {
    return calls_with(name).last().map(|call| call.integers.clone()).unwrap_or_default();
}

mod get_gl_environment_capture_texture {
    use super::*;

    #[test]
    fn returns_the_cubemap_texture_owned_by_the_target() {
        let (state, _) = make_capture_state();
        let mut target = create_gl_cube_render_target(&state, 16.0, None).unwrap();
        assert_eq!(get_gl_environment_capture_texture(&target), target.texture);
        destroy_gl_cube_render_target(&mut target);
    }
}

mod render_gl_environment_capture {
    use super::*;

    #[test]
    fn renders_all_six_canonical_face_cameras_with_the_requested_clip_distances() {
        let (mut state, previous_framebuffer) = make_capture_state();
        let (_, scene) = add_capture_mesh(&mut state, false);
        let mut target = create_gl_cube_render_target(&state, 32.0, None).unwrap();

        render_gl_environment_capture(
            &mut state,
            &create_vector3(2.0, 3.0, 4.0),
            &scene,
            &no_lights(),
            &mut target,
            Some(&GlEnvironmentCaptureOptions {
                environment: None,
                exclude_node: None,
                far: Some(250.0),
                near: Some(0.25),
            }),
        );

        let cameras = cameras();
        assert_eq!(cameras.len(), 6);
        assert!(cameras.iter().all(|camera| camera.near == 0.25 && camera.far == 250.0));
        assert!(
            cameras
                .iter()
                .all(|camera| camera.aspect == 1.0 && camera.fov_y == std::f32::consts::PI * 0.5)
        );
        let mut views: Vec<Vec<u32>> = cameras
            .iter()
            .map(|camera| camera.view.iter().map(|value| value.to_bits()).collect())
            .collect();
        views.sort();
        views.dedup();
        assert_eq!(views.len(), 6);
        let attachments = calls_with("framebuffer_texture_2d");
        let attachments = &attachments[attachments.len() - 6..];
        let targets: Vec<i64> = attachments.iter().map(|call| call.integers[2]).collect();
        let expected: Vec<i64> = (0..6)
            .map(|face| i64::from(glow::TEXTURE_CUBE_MAP_POSITIVE_X + face))
            .collect();
        assert_eq!(targets, expected);
        assert_eq!(
            last_integers("bind_framebuffer"),
            vec![i64::from(glow::FRAMEBUFFER), i64::from(previous_framebuffer.0.get())]
        );
        assert_eq!(last_integers("viewport"), vec![7, 8, 90, 70]);
        assert_eq!(last_integers("active_texture"), vec![i64::from(ACTIVE_TEXTURE)]);
        destroy_gl_cube_render_target(&mut target);
    }

    #[test]
    fn temporarily_excludes_one_node_and_restores_its_enabled_state() {
        let (mut state, _) = make_capture_state();
        let (mesh, scene) = add_capture_mesh(&mut state, false);
        let mut target = create_gl_cube_render_target(&state, 16.0, None).unwrap();
        let excluded: NodeRef = mesh.clone();

        render_gl_environment_capture(
            &mut state,
            &create_vector3(0.0, 0.0, 0.0),
            &scene,
            &no_lights(),
            &mut target,
            Some(&GlEnvironmentCaptureOptions {
                environment: None,
                exclude_node: Some(excluded),
                far: None,
                near: None,
            }),
        );

        assert_eq!(cameras().len(), 0);
        assert!(mesh.read().unwrap().node_fields().enabled);
        destroy_gl_cube_render_target(&mut target);
    }

    #[test]
    fn restores_exclusion_and_gl_state_when_a_face_draw_throws() {
        let (mut state, previous_framebuffer) = make_capture_state();
        let (_, scene) = add_capture_mesh(&mut state, true);
        let excluded: NodeRef = publish_node3d(create_node3d::<Node3DFields>(None));
        let mut target = create_gl_cube_render_target(&state, 16.0, None).unwrap();

        let message = thrown_message(|| {
            render_gl_environment_capture(
                &mut state,
                &create_vector3(0.0, 0.0, 0.0),
                &scene,
                &no_lights(),
                &mut target,
                Some(&GlEnvironmentCaptureOptions {
                    environment: None,
                    exclude_node: Some(excluded.clone()),
                    far: None,
                    near: None,
                }),
            );
        });
        assert!(message.contains("capture draw failed"));
        assert!(excluded.read().unwrap().node_fields().enabled);
        assert_eq!(
            last_integers("bind_framebuffer"),
            vec![i64::from(glow::FRAMEBUFFER), i64::from(previous_framebuffer.0.get())]
        );
        assert_eq!(last_integers("active_texture"), vec![i64::from(ACTIVE_TEXTURE)]);
        destroy_gl_cube_render_target(&mut target);
    }
}
