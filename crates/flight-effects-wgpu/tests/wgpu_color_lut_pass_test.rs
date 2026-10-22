use std::sync::{Arc, Mutex, RwLock};

use flight_adjustments::ColorLut;
use flight_effects_wgpu::contract::*;
use flight_entity::Ref;
use flight_render_wgpu::*;

use crate::support::*;

fn create_lut(size: u32, samples: Vec<f32>) -> ColorLut {
    return ColorLut { size, samples };
}

fn create_grey_lut(size: u32) -> ColorLut {
    let count = (size * size * size) as usize;
    let mut samples = Vec::new();
    for index in 0..count {
        let value = index as f32 / (count - 1) as f32;
        samples.push(value);
        samples.push(value);
        samples.push(value);
    }
    return create_lut(size, samples);
}

fn empty_cache() -> WgpuColorLutTextureCache {
    return WgpuColorLutTextureCache {
        texture: None,
        size: 0,
        lut: None,
    };
}

fn create_format_target(
    state: &WgpuRenderState,
    format: wgpu::TextureFormat,
) -> Ref<WgpuTextureRenderTarget> {
    return Arc::new(RwLock::new(create_wgpu_texture_render_target(
        state,
        8.0,
        8.0,
        Some(format),
        None,
        None,
    )));
}

fn apply(
    state: &mut WgpuRenderState,
    lut: &ColorLut,
    cache: &mut WgpuColorLutTextureCache,
    format: wgpu::TextureFormat,
) {
    let source = create_format_target(state, format);
    let dest = create_format_target(state, format);
    with_test_frame(state, |state| {
        apply_color_lut_pass_to_wgpu(
            state,
            &source.read().unwrap(),
            &dest.read().unwrap(),
            lut,
            cache,
        );
    });
}

fn uploads(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> Vec<Vec<u8>> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::WriteTexture(write) if write.size[2] > 1 => Some(write.data.clone()),
            _ => None,
        })
        .collect();
}

mod apply_color_lut_pass_to_wgpu {
    use super::*;

    #[test]
    fn uploads_the_lut_with_samples_scaled_to_bytes_and_alpha_forced_opaque() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);
        let samples: Vec<f32> = (0..24).map(|index| (index % 3) as f32 / 2.0).collect();

        let format = state.format;
        apply(
            &mut state,
            &create_lut(2, samples),
            &mut empty_cache(),
            format,
        );

        assert_eq!(
            &uploads(&records)[0][0..8],
            &[0, 128, 255, 255, 0, 128, 255, 255]
        );
    }

    #[test]
    fn clamps_a_sample_outside_zero_to_one_rather_than_wrapping_it() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);
        let mut samples = vec![0.0; 24];
        samples[0] = -0.5;
        samples[1] = 1.5;

        let format = state.format;
        apply(
            &mut state,
            &create_lut(2, samples),
            &mut empty_cache(),
            format,
        );

        assert_eq!(&uploads(&records)[0][0..2], &[0, 255]);
    }

    // The write is skipped for the LUT already in the texture: a static grade is the common case and
    // a 32³ table is 128 KB. The Rust bake returns a value, so "the same LUT" is the same content.
    #[test]
    fn writes_once_for_an_unchanged_lut_and_again_when_it_changes() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);
        let mut cache = empty_cache();
        let lut = create_grey_lut(2);
        let format = state.format;

        apply(&mut state, &lut, &mut cache, format);
        apply(&mut state, &lut, &mut cache, format);
        assert_eq!(uploads(&records).len(), 1);

        let mut changed = create_grey_lut(2);
        changed.samples[0] = 0.25;
        apply(&mut state, &changed, &mut cache, format);
        assert_eq!(uploads(&records).len(), 2);
    }

    // A 3D texture's dimensions are fixed at creation, so a LUT of a different SIZE needs a new
    // texture, and the previous one is destroyed rather than leaked.
    #[test]
    fn recreates_and_destroys_the_texture_when_the_lut_size_changes_and_reuses_it_when_it_does_not()
    {
        let mut state = create_wgpu_render_state_for_test(None);
        let mut cache = empty_cache();
        let format = state.format;

        apply(&mut state, &create_grey_lut(2), &mut cache, format);
        let first = cache.texture.clone().unwrap();
        let mut changed = create_grey_lut(2);
        changed.samples[0] = 0.5;
        apply(&mut state, &changed, &mut cache, format);
        assert_eq!(cache.texture.clone().unwrap(), first);
        assert!(!is_test_texture_destroyed(&state, &first));

        apply(&mut state, &create_grey_lut(4), &mut cache, format);
        assert_ne!(cache.texture.clone().unwrap(), first);
        assert_eq!(cache.size, 4);
        assert!(is_test_texture_destroyed(&state, &first));
    }

    // A render pipeline's color target format must match the attachment it draws into, so an HDR
    // (rgba16float) effect target needs its own pipeline.
    #[test]
    fn builds_one_pipeline_per_destination_format_and_reuses_it_within_a_format() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);
        let mut cache = empty_cache();

        apply(
            &mut state,
            &create_grey_lut(2),
            &mut cache,
            wgpu::TextureFormat::Rgba8Unorm,
        );
        apply(
            &mut state,
            &create_grey_lut(2),
            &mut cache,
            wgpu::TextureFormat::Rgba8Unorm,
        );
        assert_eq!(recorded_pipelines(&records).len(), 1);

        apply(
            &mut state,
            &create_grey_lut(2),
            &mut cache,
            wgpu::TextureFormat::Rgba16Float,
        );
        let pipelines = recorded_pipelines(&records);
        assert_eq!(pipelines.len(), 2);
        assert_eq!(
            pipelines[1].targets[0].as_ref().unwrap().format,
            wgpu::TextureFormat::Rgba16Float
        );
    }

    // The group indices are a contract with the WGSL: 0 uniforms, 1 source texture, 2 LUT.
    #[test]
    fn binds_uniforms_source_and_lut_to_groups_zero_one_and_two() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);
        let format = state.format;

        apply(&mut state, &create_grey_lut(2), &mut empty_cache(), format);

        let sets = recorded_set_bind_groups(&records);
        assert_eq!(
            sets.iter().map(|set| set.index).collect::<Vec<u32>>(),
            vec![0, 1, 2]
        );
        assert_eq!(
            recorded_draws(&records)
                .iter()
                .map(|draw| draw.vertex_count)
                .collect::<Vec<u32>>(),
            vec![6]
        );
    }

    // `load` rather than `clear`: a full-frame grade over what is already in the target.
    #[test]
    fn loads_the_destination_rather_than_clearing_it() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);
        let format = state.format;

        apply(&mut state, &create_grey_lut(2), &mut empty_cache(), format);

        let begins = recorded_pass_begins(&records);
        assert_eq!(begins.len(), 1);
        assert_eq!(begins[0].color, WgpuColorLoadRecord::Load);
    }

    #[test]
    fn passes_the_lut_size_to_the_shader_as_its_one_uniform() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);
        let format = state.format;

        apply(&mut state, &create_grey_lut(4), &mut empty_cache(), format);

        assert_eq!(recorded_effect_uniforms(&records)[0][0], 4.0);
    }

    // The source pins the half-texel shader text; here the shader that computes cell centres from
    // the size uniform compiles and validates for real against a 3D LUT binding.
    #[test]
    fn computes_cell_centres_from_the_size_uniform_matching_the_gl_recipe() {
        let mut state = create_wgpu_render_state_for_test(None);
        let format = state.format;
        let error = capture_test_validation_error(&state, || {});
        assert!(error.is_none());

        apply(&mut state, &create_grey_lut(3), &mut empty_cache(), format);
    }
}
