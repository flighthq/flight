use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_lighting::{SCENE_LIGHT_BLOCK_FLOATS, Scene3DLightBlock};
use flight_materials::custom_shader_material::create_custom_shader_material;
use flight_materials::{CUSTOM_SHADER_MATERIAL_KIND, CustomShaderMaterial, UniformValue};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_render_wgpu::*;
use flight_scene3d_wgpu::*;
use flight_texture::{Texture, TextureUvTransform, TextureWrap};

use crate::support::*;

const SOURCE: &str = "
@group(0) @binding(0) var<uniform> frame: vec4f;
@group(1) @binding(0) var<uniform> draw: vec4f;
@group(2) @binding(0) var<uniform> user: vec4f;
@vertex fn vs_main(@location(0) position: vec3f) -> @builtin(position) vec4f {
  return vec4f(position, 1.0);
}
@fragment fn fs_main() -> @location(0) vec4f { return user; }
";

fn no_lights() -> Scene3DLightBlock {
    return Scene3DLightBlock {
        ambient_count: 0,
        data: vec![0.0; SCENE_LIGHT_BLOCK_FLOATS].into_boxed_slice(),
        directional_count: 0,
        hemisphere_count: 0,
        point_count: 0,
        spot_count: 0,
        version: 1,
    };
}

fn make_material(shader_key: &str) -> CustomShaderMaterial {
    let mut material = create_custom_shader_material();
    material.shader_key = shader_key.to_string();
    return material;
}

fn bind(test: &mut WgpuScene3DTestState, material: &CustomShaderMaterial, lights: &Scene3DLightBlock) {
    (WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.bind)(
        &mut test.state,
        Some(material),
        lights,
        &make_test_camera(),
    );
}

mod get_wgpu_custom_material_shader_source {
    use super::*;

    #[test]
    fn returns_null_for_an_unknown_key() {
        let test = make_wgpu_scene3d_state(None);
        assert!(get_wgpu_custom_material_shader_source(&test.state, "unknown").is_none());
    }
}

mod register_wgpu_custom_material_shader {
    use super::*;

    #[test]
    fn registers_wgsl_by_key_with_last_write_wins_lookup() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_custom_material_shader(&mut test.state, "ripple", SOURCE);
        assert_eq!(
            get_wgpu_custom_material_shader_source(&test.state, "ripple").as_deref(),
            Some(SOURCE)
        );
        register_wgpu_custom_material_shader(&mut test.state, "ripple", &format!("{}\n// edited", SOURCE));
        assert!(get_wgpu_custom_material_shader_source(&test.state, "ripple")
            .unwrap()
            .contains("edited"));
        assert!(get_wgpu_custom_material_shader_source(&test.state, "missing").is_none());
    }

    #[test]
    fn replaces_the_persistent_table_while_an_explicit_pipeline_state_retains_its_snapshot() {
        let mut screen = make_wgpu_scene3d_state(None);
        let replacement = format!("{}\n// replacement", SOURCE);
        register_wgpu_custom_material_shader(&mut screen.state, "ripple", SOURCE);
        let snapshot = get_wgpu_render_state_runtime(&screen.state)
            .registries
            .custom_material_shaders
            .clone();
        let mut derived = make_wgpu_scene3d_state(Some(WgpuRenderStateOptions {
            custom_material_shaders: Some((*snapshot).clone()),
            ..test_default()
        }));

        get_wgpu_scene3d_runtime(&mut derived.state);
        register_wgpu_custom_material_shader(&mut screen.state, "ripple", &replacement);

        assert!(!Arc::ptr_eq(
            &get_wgpu_render_state_runtime(&derived.state).registries.custom_material_shaders,
            &snapshot
        ));
        assert!(!Arc::ptr_eq(
            &get_wgpu_render_state_runtime(&screen.state).registries.custom_material_shaders,
            &snapshot
        ));
        assert_eq!(snapshot.entries.get("ripple").map(String::as_str), Some(SOURCE));
        assert_eq!(
            get_wgpu_custom_material_shader_source(&derived.state, "ripple").as_deref(),
            Some(SOURCE)
        );
        assert_eq!(
            get_wgpu_custom_material_shader_source(&screen.state, "ripple"),
            Some(replacement)
        );
    }
}

mod register_wgpu_custom_shader_material {
    use super::*;

    #[test]
    fn installs_the_renderer_for_custom_shader_material_kind() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_custom_shader_material(&mut test.state);
        assert!(get_wgpu_mesh_material_renderer(&test.state, CUSTOM_SHADER_MATERIAL_KIND)
            .is_some_and(|renderer| std::ptr::eq(renderer, &WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER)));
    }
}

mod wgpu_custom_shader_mesh_material_renderer {
    use super::*;

    #[test]
    fn reuses_frame_draw_layouts_and_binds_reserved_user_and_texture_groups() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_custom_material_shader(&mut test.state, "test", SOURCE);
        bind(&mut test, &make_material("test"), &no_lights());

        let layouts = test.named("createPipelineLayout");
        let Some(WgpuCommandRecord::CreatePipelineLayout(layout)) = layouts.first() else {
            panic!("a pipeline layout");
        };
        assert_eq!(layout.bind_group_layouts.len(), 4);
        let indices: Vec<u32> = test.set_bind_groups().iter().map(|set| set.index).collect();
        assert_eq!(indices, vec![0, 2, 3]);
    }

    #[test]
    fn packs_logical_values_into_alphabetically_sorted_vec4_slots() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_custom_material_shader(&mut test.state, "test", SOURCE);
        let mut material = make_material("test");
        let mut uniforms = HashMap::new();
        uniforms.insert("zeta".to_string(), UniformValue::Array(vec![5.0, 6.0]));
        uniforms.insert("alpha".to_string(), UniformValue::Scalar(2.0));
        material.uniforms = Some(uniforms);
        bind(&mut test, &material, &no_lights());

        let packed = bytes_to_f32(&test.buffer_writes()[0].data);
        assert_eq!(&packed[..8], &[2.0, 0.0, 0.0, 0.0, 5.0, 6.0, 0.0, 0.0]);
    }

    #[test]
    fn reuses_the_group_3_bind_group_when_the_texture_bag_is_unchanged() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut material = make_material("test");
        let mut textures = HashMap::new();
        textures.insert("map".to_string(), Arc::new(RwLock::new(create_test_unbacked_texture())));
        material.textures = Some(textures);
        register_wgpu_custom_material_shader(&mut test.state, "test", SOURCE);
        register_wgpu_image_texture_resolver(&mut test.state);
        let lights = no_lights();
        bind(&mut test, &material, &lights);
        let first_count = test.count("createBindGroup");

        bind(&mut test, &material, &lights);
        assert_eq!(test.count("createBindGroup"), first_count);
    }

    // The source's last step reorders the bag's keys; a Rust map keeps no insertion order, so the
    // slot order is the sorted key order and a pure reorder is not a change (see the module note).
    #[test]
    fn rebuilds_group_3_for_readiness_replacement_sampler_and_key_changes() {
        let mut test = make_wgpu_scene3d_state(None);
        let first = Arc::new(RwLock::new(create_test_unbacked_texture()));
        let second = Arc::new(RwLock::new(create_test_unbacked_texture()));
        let mut material = make_material("test");
        let mut textures = HashMap::new();
        textures.insert("first".to_string(), first.clone());
        textures.insert("second".to_string(), second.clone());
        material.textures = Some(textures);
        register_wgpu_custom_material_shader(&mut test.state, "test", SOURCE);
        register_wgpu_image_texture_resolver(&mut test.state);
        let lights = no_lights();
        let bind_and_expect_rebuild = |test: &mut WgpuScene3DTestState, material: &CustomShaderMaterial, previous: usize| -> usize {
            bind(test, material, &lights);
            let next = test.count("createBindGroup");
            assert!(next > previous);
            return next;
        };

        let mut count = bind_and_expect_rebuild(&mut test, &material, 0);
        first.write().unwrap().texture_fields_mut().sampler.wrap_u = TextureWrap::Repeat;
        count = bind_and_expect_rebuild(&mut test, &material, count);

        let (image, _fake) = create_test_image_resource(1, 1);
        if let Texture::Texture2D(texture) = &mut *first.write().unwrap() {
            texture.source = Some(image);
        }
        count = bind_and_expect_rebuild(&mut test, &material, count);
        let (replacement, _fake) = create_test_image_resource(1, 1);
        if let Texture::Texture2D(texture) = &mut *first.write().unwrap() {
            texture.source = Some(replacement);
        }
        count = bind_and_expect_rebuild(&mut test, &material, count);

        let mut renamed = HashMap::new();
        renamed.insert("renamed".to_string(), first.clone());
        renamed.insert("second".to_string(), second.clone());
        material.textures = Some(renamed);
        bind_and_expect_rebuild(&mut test, &material, count);
    }

    #[test]
    fn draws_an_indexed_subset_after_a_valid_bind_and_skips_a_missing_shader() {
        let mut test = make_wgpu_scene3d_state(None);
        let geometry = create_box_mesh_geometry(None, None, None);
        let material = make_material("test");
        let proxy = make_test_proxy_for(&geometry, share_test_material(material.clone()));
        let lights = no_lights();
        bind(&mut test, &material, &lights);
        (WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.draw)(&mut test.state, &proxy, &geometry);
        assert_eq!(test.count("drawIndexed"), 0);

        register_wgpu_custom_material_shader(&mut test.state, "test", SOURCE);
        bind(&mut test, &material, &lights);
        (WGPU_CUSTOM_SHADER_MESH_MATERIAL_RENDERER.draw)(&mut test.state, &proxy, &geometry);
        assert!(test.count("drawIndexed") > 0);
    }

    #[test]
    fn skips_a_user_block_that_exceeds_the_fixed_packing_capacity() {
        let mut test = make_wgpu_scene3d_state(None);
        register_wgpu_custom_material_shader(&mut test.state, "test", SOURCE);
        let mut material = make_material("test");
        let mut uniforms = HashMap::new();
        for i in 0..33 {
            uniforms.insert(format!("value{}", i), UniformValue::Scalar(i as f32));
        }
        material.uniforms = Some(uniforms);
        bind(&mut test, &material, &no_lights());
        assert_eq!(test.count("createRenderPipeline"), 0);
    }
}
