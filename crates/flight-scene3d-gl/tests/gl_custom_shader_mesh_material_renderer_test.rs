use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_camera::{Camera3D, Projection, create_camera_3d, create_perspective_projection};
use flight_geometry::{create_matrix3, create_matrix4};
use flight_lighting::Scene3DLightBlock;
use flight_meshgeometry::{MeshGeometry, create_box_mesh_geometry};
use flight_render::Scene3DRenderProxy;
use flight_scene3d_gl::contract::*;
use flight_materials::custom_shader_material::create_custom_shader_material;
use flight_materials::{CUSTOM_SHADER_MATERIAL_KIND, CustomShaderMaterial, UniformValue};
use flight_render_gl::GlCustomMaterialShaderSource;

use crate::gl_test_helper::{
    calls_with, count_calls, make_gl_scene3d_state, make_gl_scene3d_state_with, make_state_options,
    uniform_location_of,
};
use flight_entity::{Ref, allocate_entity};
use flight_render::ExternalTexture;
use flight_render_gl::{GlRenderState, GlTextureRealization, register_gl_texture_resolver};
use flight_texture::{Texture, TextureColorSpace, TextureSourceRef, TextureVariant, create_texture_2d};
use glow::HasContext;

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
        material: Arc::new(RwLock::new(make_material("test"))),
        normal_matrix: create_matrix3(),
        subset: geometry.subsets[0],
        world_matrix: create_matrix4(),
    };
}

const VERTEX_SRC: &str = "#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_tangent;
layout(location = 3) in vec2 a_uv0;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
uniform vec3 u_cameraPosition;
void main() {
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}";

const FRAGMENT_SRC: &str = "#version 300 es
precision highp float;
uniform float u_time;
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0, 0.0, u_time, 1.0);
}";

fn make_material(shader_key: &str) -> CustomShaderMaterial {
    let mut material = create_custom_shader_material();
    material.shader_key = shader_key.to_string();
    return material;
}

// A texture that resolves through `ready_resolver` without a real upload.
fn make_ready_texture() -> Ref<Texture> {
    let mut source: ExternalTexture = allocate_entity();
    source.kind = "test.ready".to_string();
    source.width = 1;
    source.height = 1;
    let source: TextureSourceRef = Arc::new(RwLock::new(source));
    let mut texture = create_texture_2d();
    texture.source = Some(source);
    return Arc::new(RwLock::new(Texture::Texture2D(texture)));
}

fn ready_resolver(
    state: &mut GlRenderState,
    _texture: &dyn TextureVariant,
    _premultiply: bool,
    _color_space: TextureColorSpace,
) -> Option<GlTextureRealization> {
    return Some(GlTextureRealization {
        straight_alpha: false,
        // SAFETY: allocation occurs on the deterministic mock context's owning thread.
        texture: unsafe { state.gl.create_texture() }.ok()?,
    });
}

fn make_source(fragment: &str, vertex: &str) -> GlCustomMaterialShaderSource {
    return GlCustomMaterialShaderSource {
        fragment: fragment.to_string(),
        vertex: vertex.to_string(),
    };
}

mod get_gl_custom_material_shader_source {
    use super::*;

    #[test]
    fn returns_the_source_registered_under_the_given_key() {
        let mut state = make_gl_scene3d_state();
        let source = make_source(FRAGMENT_SRC, VERTEX_SRC);
        register_gl_custom_material_shader(&mut state, "ripple", &source);
        assert_eq!(get_gl_custom_material_shader_source(&state, "ripple"), Some(&source));
    }

    #[test]
    fn returns_null_for_an_unregistered_key() {
        let state = make_gl_scene3d_state();
        assert!(get_gl_custom_material_shader_source(&state, "nope").is_none());
    }
}

mod gl_custom_shader_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_program_and_uploads_view_projection_and_camera_position_when_shader_is_registered() {
        let mut state = make_gl_scene3d_state();
        register_gl_custom_material_shader(&mut state, "test", &make_source(FRAGMENT_SRC, VERTEX_SRC));
        let material = make_material("test");
        (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        assert!(count_calls("use_program") > 0);
        assert!(count_calls("uniform_matrix_4_f32") > 0);
        assert!(count_calls("uniform_3_f32") > 0);
    }

    #[test]
    fn bind_uploads_custom_uniforms_from_the_material() {
        let mut state = make_gl_scene3d_state();
        register_gl_custom_material_shader(&mut state, "test", &make_source(FRAGMENT_SRC, VERTEX_SRC));
        let mut material = make_material("test");
        material.uniforms = Some(HashMap::from([
            ("u_time".to_string(), UniformValue::Scalar(0.5)),
            ("u_scale".to_string(), UniformValue::Array(vec![2.0, 3.0])),
        ]));
        (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        assert!(
            calls_with("uniform_1_f32")
                .iter()
                .any(|call| call.floats.first() == Some(&0.5))
        );
        assert!(count_calls("uniform_2_f32_slice") > 0);
    }

    // D3: the texture bag is ordered, and unit assignment follows the bag's insertion order.
    #[test]
    fn bind_assigns_texture_units_in_texture_bag_order() {
        let mut state = make_gl_scene3d_state();
        register_gl_texture_resolver(&mut state, "test.ready".to_string(), Some(ready_resolver));
        register_gl_custom_material_shader(&mut state, "test", &make_source(FRAGMENT_SRC, VERTEX_SRC));
        let mut material = make_material("test");
        material.textures = Some(vec![
            ("u_zeta".to_string(), make_ready_texture()),
            ("u_alpha".to_string(), make_ready_texture()),
        ]);
        (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        let units: Vec<(i64, i64)> = calls_with("uniform_1_i32")
            .iter()
            .map(|call| (call.integers[0], call.integers[1]))
            .collect();
        assert_eq!(
            units,
            vec![
                (i64::from(uniform_location_of("u_zeta")), 0),
                (i64::from(uniform_location_of("u_alpha")), 1),
            ]
        );
    }

    #[test]
    fn bind_is_a_no_op_sets_active_program_null_when_shader_key_is_not_registered() {
        let mut state = make_gl_scene3d_state();
        let material = make_material("missing");
        (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        assert_eq!(count_calls("use_program"), 0);
    }

    #[test]
    fn bind_is_a_no_op_when_shader_key_is_empty() {
        let mut state = make_gl_scene3d_state();
        let material = create_custom_shader_material();
        (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        assert_eq!(count_calls("use_program"), 0);
    }

    #[test]
    fn draw_issues_an_indexed_draw_over_the_subset_after_bind() {
        let mut state = make_gl_scene3d_state();
        register_gl_custom_material_shader(&mut state, "test", &make_source(FRAGMENT_SRC, VERTEX_SRC));
        let proxy = make_proxy();
        {
            let material = proxy.material.read().unwrap();
            (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&*material), &no_lights(), &make_camera());
        }
        (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.draw)(&mut state, &proxy, &make_geometry());
        let draws = calls_with("draw_elements");
        assert!(!draws.is_empty());
        assert_eq!(draws[0].integers[1], i64::from(proxy.subset.index_count));
    }

    #[test]
    fn draw_is_a_no_op_when_bind_skipped_due_to_missing_shader_key() {
        let mut state = make_gl_scene3d_state();
        let material = make_material("missing");
        (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(&mut state, Some(&material), &no_lights(), &make_camera());
        (GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.draw)(&mut state, &make_proxy(), &make_geometry());
        assert_eq!(count_calls("draw_elements"), 0);
    }
}

mod register_gl_custom_material_shader {
    use super::*;

    #[test]
    fn replaces_the_persistent_table_while_an_explicitly_copied_state_retains_its_snapshot() {
        let mut screen = make_gl_scene3d_state();
        let source = make_source("first", "first");
        let replacement = make_source("replacement", "replacement");
        register_gl_custom_material_shader(&mut screen, "ripple", &source);
        let snapshot = screen.gl_registries.custom_material_shaders.clone();
        let mut options = make_state_options();
        options.gl_registries = screen.gl_registries.clone();
        let derived = make_gl_scene3d_state_with(&options);

        get_gl_scene3d_runtime(&derived);
        register_gl_custom_material_shader(&mut screen, "ripple", &replacement);

        // D17: the derived state shares the snapshot copy-on-write (TS copies the map); either way the
        // later registration on `screen` never reaches it.
        assert!(!Arc::ptr_eq(&screen.gl_registries.custom_material_shaders, &snapshot));
        assert_eq!(snapshot.entries.get("ripple"), Some(&source));
        assert_eq!(get_gl_custom_material_shader_source(&derived, "ripple"), Some(&source));
        assert_eq!(get_gl_custom_material_shader_source(&screen, "ripple"), Some(&replacement));
    }

    #[test]
    fn stores_shader_source_retrievable_by_key() {
        let mut state = make_gl_scene3d_state();
        let source = make_source(FRAGMENT_SRC, VERTEX_SRC);
        register_gl_custom_material_shader(&mut state, "ripple", &source);
        assert_eq!(get_gl_custom_material_shader_source(&state, "ripple"), Some(&source));
    }

    #[test]
    fn last_write_wins_per_key() {
        let mut state = make_gl_scene3d_state();
        let a = make_source("a", "a");
        let b = make_source("b", "b");
        register_gl_custom_material_shader(&mut state, "key", &a);
        register_gl_custom_material_shader(&mut state, "key", &b);
        assert_eq!(get_gl_custom_material_shader_source(&state, "key"), Some(&b));
    }
}

mod register_gl_custom_shader_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_custom_shader_material_kind() {
        let mut state = make_gl_scene3d_state();
        register_gl_custom_shader_material(&mut state);
        assert!(
            get_gl_mesh_material_renderer(&state, &CUSTOM_SHADER_MATERIAL_KIND.to_string())
                .is_some_and(|renderer| std::ptr::eq(renderer, &GL_CUSTOM_SHADER_MESH_MATERIAL_RENDERER))
        );
    }
}
