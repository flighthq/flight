use std::sync::{Arc, RwLock};

use flight_materials::contract::create_standard_pbr_material;
use flight_materials::{MaterialAlphaMode, StandardPbrMaterial, StandardPbrMaterialProperties};
use flight_meshgeometry::create_box_mesh_geometry;
use flight_scene3d_wgpu::*;

use crate::support::*;

fn properties(material: &StandardPbrMaterial) -> StandardPbrMaterialProperties {
    return StandardPbrMaterialProperties {
        alpha_map: material.alpha_map.clone(),
        base_color: material.base_color,
        base_color_map: material.base_color_map.clone(),
        emissive: material.emissive,
        emissive_map: material.emissive_map.clone(),
        emissive_strength: material.emissive_strength,
        metallic: material.metallic,
        metallic_roughness_map: material.metallic_roughness_map.clone(),
        normal_map: material.normal_map.clone(),
        normal_scale: material.normal_scale,
        occlusion_map: material.occlusion_map.clone(),
        occlusion_strength: material.occlusion_strength,
        roughness: material.roughness,
    };
}

fn bind(test: &mut WgpuScene3DTestState, material: &StandardPbrMaterial) {
    (WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER.bind)(
        &mut test.state,
        Some(material),
        &make_test_lights(),
        &make_test_camera(),
    );
}

fn null_pipeline(test: &mut WgpuScene3DTestState) -> WgpuPbrPipeline {
    return ensure_wgpu_pbr_pipeline(
        &mut test.state,
        &build_wgpu_pbr_standard_define_key(None, None),
        wgpu::TextureFormat::Bgra8Unorm,
    );
}

mod build_wgpu_pbr_standard_define_key {
    use super::*;

    #[test]
    fn reads_the_alpha_mode_and_double_sidedness_and_leaves_every_extension_flag_off() {
        let mut material = create_standard_pbr_material();
        material.alpha_mode = MaterialAlphaMode::Mask;
        material.double_sided = true;
        let key = build_wgpu_pbr_standard_define_key(Some(&properties(&material)), Some(&material));
        assert!(key.alpha_mask_enabled);
        assert!(key.double_sided);
        assert!(!key.clearcoat_enabled);
        assert!(!key.transmission_enabled);
    }

    #[test]
    fn returns_all_false_flags_for_a_null_surface() {
        let key = build_wgpu_pbr_standard_define_key(None, None);
        assert!(!key.alpha_mask_enabled);
        assert!(!key.has_base_color_map);
    }

    #[test]
    fn derives_the_five_standard_map_flags_from_the_material_maps_that_carry_an_image_source() {
        let mut material = create_standard_pbr_material();
        let sourced = Arc::new(RwLock::new(create_test_bitmap_texture(1, 1)));
        material.base_color_map = Some(sourced.clone());
        material.metallic_roughness_map = Some(sourced);
        let key = build_wgpu_pbr_standard_define_key(Some(&properties(&material)), Some(&material));
        assert!(key.has_base_color_map);
        assert!(key.has_metallic_roughness_map);
        assert!(!key.has_normal_map);
        assert!(!key.has_occlusion_map);
        assert!(!key.has_emissive_map);
    }
}

mod ensure_wgpu_pbr_material_bind_group {
    use super::*;

    #[test]
    fn creates_a_material_bind_group_once_per_key_and_reuses_it() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = null_pipeline(&mut test);
        let a = ensure_wgpu_pbr_material_bind_group(&mut test.state, &pipeline, 7, None);
        let groups = test.count("createBindGroup");
        let b = ensure_wgpu_pbr_material_bind_group(&mut test.state, &pipeline, 7, None);
        assert_eq!(b.bind_group, a.bind_group);
        assert_eq!(test.count("createBindGroup"), groups);
    }
}

mod get_wgpu_pbr_material_scratch {
    use super::*;

    #[test]
    fn returns_the_shared_48_float_material_block_scratch() {
        let mut test = make_wgpu_scene3d_state(None);
        assert_eq!(
            get_wgpu_pbr_material_scratch(&mut test.state).len(),
            WGPU_PBR_MATERIAL_UNIFORM_FLOATS
        );
    }
}

mod wgpu_pbr_material_uniform_floats {
    use super::*;

    #[test]
    fn is_the_48_float_192_byte_material_block_size() {
        assert_eq!(WGPU_PBR_MATERIAL_UNIFORM_FLOATS, 48);
    }
}

mod wgpu_standard_pbr_mesh_material_renderer {
    use super::*;

    #[test]
    fn bind_selects_a_pipeline_and_binds_frame_and_material_groups_and_uploads_uniforms() {
        let mut test = make_wgpu_scene3d_state(None);
        bind(&mut test, &create_standard_pbr_material());

        assert!(test.count("createRenderPipeline") > 0);
        assert!(test.count("setPipeline") > 0);
        assert!(test.count("setBindGroup") >= 2);
        assert!(test.count("writeBuffer") > 0);
    }

    #[test]
    fn bind_compiles_a_cull_none_pipeline_for_a_double_sided_material() {
        let mut test = make_wgpu_scene3d_state(None);
        let mut material = create_standard_pbr_material();
        material.double_sided = true;
        bind(&mut test, &material);
        assert_eq!(test.pipelines()[0].primitive.cull_mode, None);
    }

    #[test]
    fn draw_uploads_geometry_and_issues_an_indexed_draw_over_the_subset_range() {
        let mut test = make_wgpu_scene3d_state(None);
        let proxy = make_test_proxy();
        let geometry = create_box_mesh_geometry(None, None, None);
        bind(&mut test, &create_standard_pbr_material());
        (WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER.draw)(&mut test.state, &proxy, &geometry);

        let draws = test.draws_indexed();
        assert_eq!(draws.len(), 1);
        assert_eq!(draws[0].index_count, proxy.subset.index_count);
        assert_eq!(draws[0].first_index, proxy.subset.index_offset);
        assert!(test.count("setIndexBuffer") > 0);
        assert!(test.count("setVertexBuffer") > 0);
    }

    #[test]
    fn draw_is_a_no_op_when_bind_has_not_selected_a_pipeline() {
        let mut test = make_wgpu_scene3d_state(None);
        (WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER.draw)(
            &mut test.state,
            &make_test_proxy(),
            &create_box_mesh_geometry(None, None, None),
        );
        assert_eq!(test.count("drawIndexed"), 0);
    }

    #[test]
    fn bind_with_no_material_uses_the_neutral_block() {
        let mut test = make_wgpu_scene3d_state(None);
        (WGPU_STANDARD_PBR_MESH_MATERIAL_RENDERER.bind)(
            &mut test.state,
            None,
            &make_test_lights(),
            &make_test_camera(),
        );
        let block = *get_wgpu_pbr_material_scratch(&mut test.state);
        assert_eq!(&block[..4], &[1.0, 1.0, 1.0, 1.0]);
        assert_eq!(block[12], 0.5);
        assert!(block[16..].iter().all(|value| *value == 0.0));
    }
}

mod write_wgpu_pbr_material_uniform {
    use super::*;

    #[test]
    fn writes_the_scratch_into_the_binding_buffer() {
        let mut test = make_wgpu_scene3d_state(None);
        let pipeline = null_pipeline(&mut test);
        let binding = ensure_wgpu_pbr_material_bind_group(&mut test.state, &pipeline, 7, None);
        let writes = test.count("writeBuffer");
        write_wgpu_pbr_material_uniform(&mut test.state, &binding);
        let all = test.buffer_writes();
        assert_eq!(all.len(), writes + 1);
        assert_eq!(all.last().unwrap().buffer, binding.buffer);
        assert_eq!(all.last().unwrap().data.len(), 192);
    }
}

mod write_wgpu_pbr_standard_block {
    use super::*;

    #[test]
    fn packs_the_base_color_and_alpha_cutoff_and_uses_neutral_defaults_for_a_null_block() {
        let mut out = [0.0_f32; WGPU_PBR_MATERIAL_UNIFORM_FLOATS];
        let mut material = create_standard_pbr_material();
        material.base_color = 0xff0000ff;
        write_wgpu_pbr_standard_block(&mut out, Some(&properties(&material)), 0.25);
        assert!(out[0] > 0.9);
        assert_eq!(out[12], 0.25);

        let mut neutral = [0.0_f32; WGPU_PBR_MATERIAL_UNIFORM_FLOATS];
        write_wgpu_pbr_standard_block(&mut neutral, None, 0.5);
        assert_eq!(neutral[0], 1.0);
        assert_eq!(neutral[9], 1.0);
    }
}
