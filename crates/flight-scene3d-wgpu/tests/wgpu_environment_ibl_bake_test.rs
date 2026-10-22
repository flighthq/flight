use flight_scene3d_wgpu::contract::*;

use crate::support::*;

// Whether `view`'s texture is destroyed, observed through real validation: binding a destroyed
// texture's view into a bind group raises a validation error inside an error scope (the source
// spied on `texture.destroy`).
fn is_view_destroyed(
    test: &WgpuScene3DTestState,
    view: &wgpu::TextureView,
    dimension: wgpu::TextureViewDimension,
) -> bool {
    let device = &test.native.device;
    let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: None,
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: dimension,
                multisampled: false,
            },
            count: None,
        }],
    });
    let scope = device.push_error_scope(wgpu::ErrorFilter::Validation);
    let _ = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &layout,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::TextureView(view),
        }],
    });
    return block_on(scope.pop()).is_some();
}

mod bake_wgpu_environment_ibl {
    use super::*;

    #[test]
    fn is_a_no_op_leaving_runtime_ibl_null_when_the_environment_has_no_source_cube() {
        let mut test = make_wgpu_scene3d_state(None);
        bake_wgpu_environment_ibl(&mut test.state, &flight_lighting::create_environment());
        assert!(get_wgpu_scene3d_runtime(&mut test.state).ibl.is_none());
    }

    #[test]
    fn bakes_the_split_sum_set_rgba16float_irradiance_and_prefiltered_cubes_and_brdf_lut_with_the_mip_chain() {
        let mut test = make_wgpu_scene3d_state(None);
        let (environment, _fake) = create_test_image_environment();
        bake_wgpu_environment_ibl(&mut test.state, &environment);

        let runtime = get_wgpu_scene3d_runtime(&mut test.state);
        let ibl = runtime.ibl.as_ref().unwrap();
        assert_eq!(ibl.prefiltered_mip_count, 5);
        assert_eq!(ibl.intensity, 1.0);

        let bake_textures: Vec<_> = test
            .textures()
            .into_iter()
            .filter(|texture| texture.format == wgpu::TextureFormat::Rgba16Float)
            .collect();
        // irradiance cube + prefiltered cube + BRDF LUT.
        assert_eq!(bake_textures.len(), 3);
        assert!(bake_textures.iter().any(|texture| texture.mip_level_count == 5));
        assert!(test
            .shader_sources()
            .iter()
            .any(|source| source.contains("importanceSampleGGX")));
    }
}

mod destroy_wgpu_scene3d_ibl {
    use super::*;

    #[test]
    fn frees_the_baked_textures_and_source_cube_and_clears_the_runtime_slots() {
        let mut test = make_wgpu_scene3d_state(None);
        let (environment, _fake) = create_test_image_environment();
        bake_wgpu_environment_ibl(&mut test.state, &environment);
        let ibl = get_wgpu_scene3d_runtime(&mut test.state).ibl.clone().unwrap();
        let cube = wgpu::TextureViewDimension::Cube;
        let flat = wgpu::TextureViewDimension::D2;
        assert!(!is_view_destroyed(&test, &ibl.irradiance_cube_view, cube));

        destroy_wgpu_scene3d_ibl(&mut test.state);

        assert!(is_view_destroyed(&test, &ibl.brdf_lut_view, flat));
        assert!(is_view_destroyed(&test, &ibl.irradiance_cube_view, cube));
        assert!(is_view_destroyed(&test, &ibl.prefiltered_cube_view, cube));
        let runtime = get_wgpu_scene3d_runtime(&mut test.state);
        assert!(runtime.ibl.is_none());
        assert!(runtime.environment_source_cube.is_none());
        assert!(runtime.environment_source_cube_view.is_none());
    }

    #[test]
    fn is_a_safe_no_op_when_no_bake_ran_for_the_state() {
        let mut test = make_wgpu_scene3d_state(None);
        destroy_wgpu_scene3d_ibl(&mut test.state);
        destroy_wgpu_scene3d_ibl(&mut test.state);
        assert!(get_wgpu_scene3d_runtime(&mut test.state).ibl.is_none());
    }
}
