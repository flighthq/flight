use flight_effects::{
    create_crt_effect, create_directional_blur_effect, create_displacement_effect,
    create_dither_effect, create_fxaa_effect, create_glitch_effect, create_kuwahara_effect,
    create_motion_blur_effect, create_pixelate_effect, create_sharpen_effect, create_smaa_effect,
    create_ssao_effect, create_tilt_shift_effect,
};
use flight_effects_wgpu::contract::*;
use flight_render_wgpu::*;

use crate::support::*;

type ApplyEffect = fn(&mut WgpuRenderState, &WgpuTextureRenderTarget, &WgpuTextureRenderTarget, &wgpu::Texture);

fn apply_tilt_shift(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_tilt_shift_effect_to_wgpu(state, source, dest, &create_tilt_shift_effect().read().unwrap());
}

fn apply_displacement(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_displacement_effect_to_wgpu(state, source, dest, &create_displacement_effect().read().unwrap());
}

fn apply_directional_blur(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_directional_blur_effect_to_wgpu(state, source, dest, &create_directional_blur_effect().read().unwrap());
}

fn apply_kuwahara(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_kuwahara_effect_to_wgpu(state, source, dest, &create_kuwahara_effect().read().unwrap());
}

fn apply_glitch(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_glitch_effect_to_wgpu(state, source, dest, &create_glitch_effect().read().unwrap());
}

fn apply_active_motion_blur(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    velocity: &wgpu::Texture,
) {
    apply_motion_blur_effect_to_wgpu(state, source, dest, Some(velocity), &create_motion_blur_effect().read().unwrap());
}

fn apply_ssao(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_ssao_effect_to_wgpu(state, source, dest, &create_ssao_effect().read().unwrap());
}

fn apply_pixelate(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_pixelate_effect_to_wgpu(state, source, dest, &create_pixelate_effect().read().unwrap());
}

fn apply_dither(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_dither_effect_to_wgpu(state, source, dest, &create_dither_effect().read().unwrap());
}

fn apply_crt(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_crt_effect_to_wgpu(state, source, dest, &create_crt_effect().read().unwrap());
}

fn apply_sharpen(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_sharpen_effect_to_wgpu(state, source, dest, &create_sharpen_effect().read().unwrap());
}

fn apply_fxaa(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_fxaa_effect_to_wgpu(state, source, dest, &create_fxaa_effect().read().unwrap());
}

fn apply_smaa(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    _velocity: &wgpu::Texture,
) {
    apply_smaa_effect_to_wgpu(state, source, dest, &create_smaa_effect().read().unwrap());
}

fn logical_effects() -> Vec<(&'static str, ApplyEffect, usize)> {
    return vec![
        ("tilt-shift", apply_tilt_shift as ApplyEffect, 4),
        ("displacement", apply_displacement as ApplyEffect, 4),
        ("directional blur", apply_directional_blur as ApplyEffect, 4),
        ("kuwahara", apply_kuwahara as ApplyEffect, 2),
        ("glitch", apply_glitch as ApplyEffect, 4),
        ("active motion blur", apply_active_motion_blur as ApplyEffect, 2),
        ("SSAO", apply_ssao as ApplyEffect, 2),
        ("pixelate", apply_pixelate as ApplyEffect, 2),
        ("dither", apply_dither as ApplyEffect, 2),
        ("CRT", apply_crt as ApplyEffect, 4),
        ("sharpen", apply_sharpen as ApplyEffect, 2),
    ];
}

fn physical_effects() -> Vec<(&'static str, ApplyEffect)> {
    return vec![
        ("FXAA", apply_fxaa as ApplyEffect),
        ("SMAA", apply_smaa as ApplyEffect),
    ];
}

// The uniforms the effect's first pass uploads when it runs inside an open 800x600 pass on
// `width`x`height` targets (the logical extent is the open pass's viewport).
fn uploaded_by(apply: ApplyEffect, width: u32, height: u32) -> Vec<f32> {
    let mut state = create_wgpu_render_state_for_test(None);
    let source = create_test_target(&state, width, height);
    let dest = create_test_target(&state, width, height);
    let velocity = create_test_target(&state, width, height);
    let records = record_test_commands(&state);
    let pass = begin_wgpu_screen_render_pass_for_test(&mut state, 800, 600);
    apply(
        pass.state,
        &source.read().unwrap(),
        &dest.read().unwrap(),
        &velocity.read().unwrap().texture,
    );
    end_wgpu_render_pass(pass);
    return recorded_effect_uniforms(&records)[0].clone();
}

mod logical_effect_resolution {
    use super::*;

    // Replacing the dimension-derived scale with 1 makes every row fail on the scratch target; the
    // physical rows stay green. This guards the shared unit conversion and every effect's wiring.
    #[test]
    fn keeps_descriptor_distances_stable_across_supersampled_scratch_targets() {
        for (name, apply, slot) in logical_effects() {
            assert_eq!(&uploaded_by(apply, 800, 600)[slot..slot + 2], &[800.0, 600.0], "{name}");
            assert_eq!(&uploaded_by(apply, 1600, 1200)[slot..slot + 2], &[800.0, 600.0], "{name}");
        }
    }

    // FXAA and SMAA are deliberately excluded from logical normalization: they are physical
    // one-texel raster kernels rather than descriptor-distance effects.
    #[test]
    fn retains_physical_source_resolution() {
        for (name, apply) in physical_effects() {
            assert_eq!(&uploaded_by(apply, 800, 600)[0..2], &[800.0, 600.0], "{name}");
            assert_eq!(&uploaded_by(apply, 1600, 1200)[0..2], &[1600.0, 1200.0], "{name}");
        }
    }
}
