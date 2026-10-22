use std::sync::{Arc, Mutex};

use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

fn ramp_uploads(records: &Arc<Mutex<Vec<WgpuCommandRecord>>>) -> Vec<Vec<u8>> {
    return records
        .lock()
        .unwrap()
        .iter()
        .filter_map(|record| match record {
            WgpuCommandRecord::WriteTexture(write) => Some(write.data.clone()),
            _ => None,
        })
        .collect();
}

fn ramp_for(colors: &[u32], alphas: &[f32], ratios: &[f32]) -> Vec<u8> {
    let mut state = create_wgpu_render_state_for_test(None);
    let records = record_test_commands(&state);
    get_wgpu_effect_gradient_ramp_texture(
        &mut state,
        &colors.to_vec(),
        &alphas.to_vec(),
        &ratios.to_vec(),
    );
    return ramp_uploads(&records)[0].clone();
}

fn entry_at(ramp: &[u8], index: usize) -> Vec<u8> {
    return ramp[index * 4..index * 4 + 4].to_vec();
}

mod get_wgpu_effect_gradient_ramp_texture {
    use super::*;

    #[test]
    fn builds_a_256_entry_rgba_table() {
        assert_eq!(
            ramp_for(&[0x000000, 0xffffff], &[1.0, 1.0], &[0.0, 255.0]).len(),
            256 * 4
        );
    }

    // `ratios` are BYTE scale, 0..255, and index into the table directly.
    #[test]
    fn places_a_stop_at_its_byte_scale_ratio_not_at_a_normalised_one() {
        let ramp = ramp_for(
            &[0x000000, 0xff0000, 0x000000],
            &[1.0, 1.0, 1.0],
            &[0.0, 64.0, 255.0],
        );

        assert_eq!(entry_at(&ramp, 64), vec![255, 0, 0, 255]);
        assert!(entry_at(&ramp, 32)[0] < 255);
        assert!(entry_at(&ramp, 128)[0] < 255);
    }

    #[test]
    fn holds_the_first_colour_below_the_first_stop_and_the_last_above_the_last() {
        let ramp = ramp_for(&[0x112233, 0x445566], &[0.5, 1.0], &[64.0, 192.0]);

        assert_eq!(entry_at(&ramp, 0), vec![0x11, 0x22, 0x33, 128]);
        assert_eq!(entry_at(&ramp, 255), vec![0x44, 0x55, 0x66, 255]);
    }

    #[test]
    fn interpolates_linearly_between_two_stops() {
        let ramp = ramp_for(&[0x000000, 0xffffff], &[1.0, 1.0], &[0.0, 255.0]);

        assert_eq!(entry_at(&ramp, 128), vec![128, 128, 128, 255]);
        assert_eq!(entry_at(&ramp, 64), vec![64, 64, 64, 255]);
    }

    // Alpha is a separate ramp over the same stops; holding the colour constant makes an alpha
    // error visible.
    #[test]
    fn ramps_alpha_independently_of_colour() {
        let ramp = ramp_for(&[0x808080, 0x808080], &[0.0, 1.0], &[0.0, 255.0]);

        assert_eq!(entry_at(&ramp, 0), vec![128, 128, 128, 0]);
        assert_eq!(entry_at(&ramp, 128), vec![128, 128, 128, 128]);
        assert_eq!(entry_at(&ramp, 255), vec![128, 128, 128, 255]);
    }

    // GradientBevelEffect declares packed RGB integers with a separate alpha field, not packed
    // RGBA: read as RGBA, 0x112233 would be r=0x00 g=0x11 b=0x22.
    #[test]
    fn reads_a_colour_as_packed_rgb_with_the_alpha_supplied_separately() {
        assert_eq!(
            entry_at(&ramp_for(&[0x112233], &[1.0], &[0.0]), 0),
            vec![0x11, 0x22, 0x33, 255]
        );
    }

    #[test]
    fn returns_a_transparent_table_for_no_stops_at_all_rather_than_failing() {
        assert_eq!(entry_at(&ramp_for(&[], &[], &[]), 0), vec![0, 0, 0, 0]);
    }

    // A recipe runs inside the frame's command encoder and cannot safely destroy a per-call texture;
    // caching removes the question.
    #[test]
    fn reuses_one_texture_for_the_same_stops_rather_than_building_a_new_one_each_frame() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);

        let first = get_wgpu_effect_gradient_ramp_texture(
            &mut state,
            &vec![0x000000, 0xffffff],
            &vec![1.0, 1.0],
            &vec![0.0, 255.0],
        );
        let second = get_wgpu_effect_gradient_ramp_texture(
            &mut state,
            &vec![0x000000, 0xffffff],
            &vec![1.0, 1.0],
            &vec![0.0, 255.0],
        );

        assert_eq!(first, second);
        assert_eq!(ramp_uploads(&records).len(), 1);
    }

    // The cache key covers colours, alphas AND ratios.
    #[test]
    fn gives_distinct_stops_distinct_textures_on_every_axis_of_the_key() {
        let mut state = create_wgpu_render_state_for_test(None);
        let records = record_test_commands(&state);
        let base = get_wgpu_effect_gradient_ramp_texture(
            &mut state,
            &vec![0x000000, 0xffffff],
            &vec![1.0, 1.0],
            &vec![0.0, 255.0],
        );

        assert_ne!(
            get_wgpu_effect_gradient_ramp_texture(
                &mut state,
                &vec![0xff0000, 0x0000ff],
                &vec![1.0, 1.0],
                &vec![0.0, 255.0]
            ),
            base
        );
        assert_ne!(
            get_wgpu_effect_gradient_ramp_texture(
                &mut state,
                &vec![0x000000, 0xffffff],
                &vec![0.0, 1.0],
                &vec![0.0, 255.0]
            ),
            base
        );
        assert_ne!(
            get_wgpu_effect_gradient_ramp_texture(
                &mut state,
                &vec![0x000000, 0xffffff],
                &vec![1.0, 1.0],
                &vec![0.0, 128.0]
            ),
            base
        );
        assert_eq!(ramp_uploads(&records).len(), 4);
    }

    // Keyed by STATE: a texture belongs to the device that created it.
    #[test]
    fn gives_each_render_state_its_own_ramp_texture() {
        let mut first = create_wgpu_render_state_for_test(None);
        let mut second = create_wgpu_render_state_for_test(None);

        get_wgpu_effect_gradient_ramp_texture(
            &mut first,
            &vec![0x000000, 0xffffff],
            &vec![1.0, 1.0],
            &vec![0.0, 255.0],
        );
        // wgpu resource equality compares per-instance ids, so the second state's own upload is the
        // observable: it builds a texture of its own rather than reusing the first state's.
        let records = record_test_commands(&second);
        get_wgpu_effect_gradient_ramp_texture(
            &mut second,
            &vec![0x000000, 0xffffff],
            &vec![1.0, 1.0],
            &vec![0.0, 255.0],
        );

        assert_eq!(ramp_uploads(&records).len(), 1);
    }
}
