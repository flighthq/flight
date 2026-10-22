use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_geometry::{create_matrix3, create_matrix4};
use flight_lighting::Scene3DLightBlock;
use flight_meshgeometry::{MeshGeometry, create_box_mesh_geometry};
use flight_render::Scene3DRenderProxy;
use flight_scene3d_gl::contract::*;
use flight_host::HostImageSource;
use flight_materials::UNLIT_MATERIAL_KIND;
use flight_materials::unlit_materials::create_unlit_material;
use flight_render::{CreateRenderTextureOptions, create_render_texture};
use flight_render_gl::{
    GlImageSourceToken, register_gl_image_texture_resolver, register_gl_render_texture_resolver,
};
use flight_texture::{Texture, TextureUvTransform};
use flight_video::{HostVideoCapability, advance_video_texture, create_video_resource, create_video_texture};

use crate::gl_test_helper::{calls_with, count_calls, make_gl_scene3d_state, test_default};

fn make_camera() -> Camera3D {
    let mut camera = create_camera_3d();
    camera.far = 100.0;
    camera.near = 0.1;
    let projection = create_perspective_projection();
    {
        let mut projection = projection.write().unwrap();
        projection.aspect = 1.0;
        projection.fov_y = std::f32::consts::PI / 3.0;
    }
    camera.projection = Projection::Perspective(projection);
    return camera;
}

fn no_lights() -> Scene3DLightBlock {
    return Scene3DLightBlock {
        ambient_count: 0,
        data: vec![0.0_f32; 12].into_boxed_slice(),
        directional_count: 0,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    };
}

fn make_geometry() -> MeshGeometry {
    return create_box_mesh_geometry(None, None, None);
}

fn make_proxy() -> Scene3DRenderProxy {
    let geometry = make_geometry();
    return Scene3DRenderProxy {
        alpha: None,
        color_scale_bias: None,
        color_matrix: None,
        instance_count: None,
        instance_matrices: None,
        instance_colors: None,
        joint_matrices: None,
        normal_matrices: None,
        material: Arc::new(RwLock::new(create_unlit_material())),
        normal_matrix: create_matrix3(),
        subset: geometry.subsets[0],
        world_matrix: create_matrix4(),
    };
}

fn has_call(name: &str, argument: u32) -> bool {
    return calls_with(name)
        .iter()
        .any(|call| call.integers.first() == Some(&i64::from(argument)));
}

// A host image the GL image resolver can upload (TS `createImageResource(img)` measured through the
// test dimension resolver): the handle is render-gl's mock image token.
fn make_host_image_source(width: u32, height: u32) -> Arc<HostImageSource> {
    return Arc::new(HostImageSource {
        provider: Arc::new(()),
        handle: Arc::new(GlImageSourceToken {
            height,
            pixels: Arc::new(vec![255; width as usize * height as usize * 4]),
            ready: true,
            width,
        }),
    });
}

// TS `testVideoHost`: reports the element's frame size and readiness.
fn make_test_video_host(width: f32, height: f32) -> HostVideoCapability {
    return HostVideoCapability {
        provider: Arc::new(()),
        add_ended_listener: None,
        attach_stream: None,
        can_play_type: Arc::new(|_mime| true),
        create_object_url: None,
        create_video_element: None,
        get_current_time: None,
        get_duration: None,
        get_height: Some(Arc::new(move |_element| height)),
        get_loop: None,
        get_muted: None,
        get_playback_rate: None,
        get_volume: None,
        get_width: Some(Arc::new(move |_element| width)),
        is_ready: Some(Arc::new(|_element| true)),
        load_url: None,
        pause: None,
        play: None,
        release_element: None,
        remove_ended_listener: None,
        revoke_object_url: None,
        set_current_time: None,
        set_loop: None,
        set_muted: None,
        set_playback_rate: None,
        set_volume: None,
    };
}

// TS `createVideoTexture(testVideoHost, createVideoResource({ readyState: 4, ... }))` with mipmaps off,
// advanced to its first frame.
fn make_video_texture(width: u32, height: u32) -> Arc<RwLock<Texture>> {
    let host = make_test_video_host(width as f32, height as f32);
    let mut resource = create_video_resource();
    resource.element = Some(make_host_image_source(width, height));
    let mut texture = create_video_texture(&host, &resource, None);
    texture.texture_fields_mut().sampler.mipmaps = false;
    advance_video_texture(&host, &mut texture);
    return Arc::new(RwLock::new(Texture::Texture2D(texture)));
}

mod gl_unlit_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_program_sets_depth_cull_view_projection_and_the_color_uniform() {
        let mut state = make_gl_scene3d_state();
        let material = create_unlit_material();
        (GL_UNLIT_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        assert!(count_calls("use_program") > 0);
        assert!(has_call("enable", glow::DEPTH_TEST));
        assert!(count_calls("uniform_matrix_4_f32") > 0);
        assert!(count_calls("uniform_4_f32") > 0);
    }

    #[test]
    fn binds_a_ready_dynamic_video_map_into_the_color_map_slot() {
        let mut state = make_gl_scene3d_state();
        let mut material = create_unlit_material();
        material.base_color_map = Some(make_video_texture(160, 120));
        register_gl_unlit_material(&mut state);
        register_gl_image_texture_resolver(&mut state);
        (GL_UNLIT_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        assert!(count_calls("tex_image_2d") > 0);
    }

    #[test]
    fn handles_an_unrendered_render_texture_in_the_same_color_map_slot_without_an_upload() {
        let mut state = make_gl_scene3d_state();
        let mut material = create_unlit_material();
        let mut render_texture = create_render_texture(&CreateRenderTextureOptions {
            height: 16,
            width: 16,
            ..test_default()
        });
        render_texture.texture_fields_mut().sampler.mipmaps = false;
        material.base_color_map = Some(Arc::new(RwLock::new(Texture::Texture2D(render_texture))));
        register_gl_unlit_material(&mut state);
        register_gl_render_texture_resolver(&mut state);
        let uploads = count_calls("tex_image_2d");

        (GL_UNLIT_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());

        assert_eq!(count_calls("tex_image_2d"), uploads);
        assert!(
            calls_with("bind_texture")
                .iter()
                .any(|call| call.integers[1] == 0)
        );
    }

    #[test]
    fn draw_issues_an_indexed_draw_over_the_subset_after_bind() {
        let mut state = make_gl_scene3d_state();
        let proxy = make_proxy();
        {
            let material = proxy.material.read().unwrap();
            (GL_UNLIT_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&*material), &no_lights(), &make_camera());
        }
        (GL_UNLIT_MESH_MATERIAL_RENDERER.draw)(&mut state, &proxy, &make_geometry());
        let draws = calls_with("draw_elements");
        assert!(!draws.is_empty());
        assert_eq!(draws[0].integers[1], i64::from(proxy.subset.index_count));
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_program() {
        let mut state = make_gl_scene3d_state();
        (GL_UNLIT_MESH_MATERIAL_RENDERER.draw)(&mut state, &make_proxy(), &make_geometry());
        assert_eq!(count_calls("draw_elements"), 0);
    }
}

mod register_gl_unlit_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_unlit_material_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_unlit_material(&mut state);
        assert!(
            get_gl_mesh_material_renderer(&state, &UNLIT_MATERIAL_KIND.to_string())
                .is_some_and(|renderer| std::ptr::eq(renderer, &GL_UNLIT_MESH_MATERIAL_RENDERER))
        );
    }
}
