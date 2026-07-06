//! The built-in SpecularGlossiness forward-lit mesh-material renderer (legacy
//! KHR_materials_pbrSpecularGlossiness workflow).
//!
//! Ports `@flighthq/scene-gl` `specularGlossinessPbrGlMeshMaterialRenderer.ts`. There
//! is no spec-gloss path in the shader: this renderer converts the material to a
//! [`StandardPbrMaterialProperties`] block on the CPU at bind time and drives the SAME
//! base PBR program (no extension define), so spec-gloss assets render through the one
//! metallic-roughness uber-shader.
//!
//! CONVERSION (Khronos glTF spec-gloss → metallic-roughness). `roughness` is
//! `1 - glossiness` (glossiness is the inverse of roughness). `metallic` comes from
//! `solve_metallic(diffuseBrightness, specularBrightness)` — the quadratic that
//! recovers the metallic factor from how far the specular reflectance sits above the
//! 0.04 dielectric floor. `baseColor` lerps from the dielectric estimate
//! (`diffuse / (1 - 0.04)`) toward the specular color by metallic, so a dielectric
//! keeps its diffuse albedo and a conductor takes its specular tint as F0.
//!
//! The conversion is an approximation but matches the reference converter. The
//! specular-glossiness map is NOT remapped to a metallic-roughness map here (different
//! packing); only the scalar conversion is applied, while diffuse/emissive/normal/
//! occlusion maps pass straight through to the standard block. Colors are decoded to
//! linear on the CPU before the conversion math and re-packed to RGBA8 for the standard
//! block to decode, so nothing is double-decoded.

use flighthq_render_gl::GlRenderState;
use flighthq_types::SpecularGlossinessPbrMaterial;
use flighthq_types::camera::Camera;
use flighthq_types::kind::KindId;
use flighthq_types::pbr_material::{MaterialAlphaMode, StandardPbrMaterialProperties};
use flighthq_types::scene_render::{SceneLightBlock, SceneRenderProxy};

use crate::gl_mesh_material_registry::{
    GlMeshMaterialRenderer, MeshMaterial, register_gl_mesh_material_renderer,
};
use crate::gl_pbr_standard_bind::{
    bind_gl_pbr_mesh_common, build_gl_pbr_standard_define_key, unpack_color_to_linear,
};
use crate::gl_scene_runtime::{GlMeshUpload, GlSceneRuntime};
use crate::standard_pbr_gl_mesh_material_renderer::draw_gl_pbr_mesh_subset;

/// The built-in SpecularGlossiness forward-lit mesh-material renderer. See
/// [`register_specular_glossiness_pbr_gl_material`] to install it.
pub struct SpecularGlossinessPbrGlMeshMaterialRenderer;

impl GlMeshMaterialRenderer for SpecularGlossinessPbrGlMeshMaterialRenderer {
    fn bind(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        material: Option<&dyn MeshMaterial>,
        lights: &SceneLightBlock,
        camera: &Camera,
    ) {
        let spec_gloss = material.and_then(|m| m.as_specular_glossiness_pbr());
        let standard = spec_gloss.map(convert_specular_glossiness_to_standard);

        let key = build_gl_pbr_standard_define_key(
            standard.as_ref(),
            spec_gloss.is_some_and(|s| s.alpha_mode == MaterialAlphaMode::Mask),
        );
        bind_gl_pbr_mesh_common(
            state,
            scene,
            &key,
            spec_gloss.is_some_and(|s| s.double_sided),
            standard.as_ref(),
            spec_gloss.map_or(0.5, |s| s.alpha_cutoff),
            lights,
            camera,
        );
    }

    fn draw(
        &self,
        state: &mut GlRenderState,
        scene: &mut GlSceneRuntime,
        proxy: &SceneRenderProxy,
        upload: &GlMeshUpload,
    ) {
        draw_gl_pbr_mesh_subset(state, scene, proxy, upload);
    }
}

/// Installs the built-in SpecularGlossiness renderer for the SpecularGlossiness
/// material kind on this scene runtime. Opt-in (no top-level side effect):
/// `draw_gl_scene` only draws SpecularGlossiness subsets once this is called.
pub fn register_specular_glossiness_pbr_gl_material(scene: &mut GlSceneRuntime) {
    register_gl_mesh_material_renderer(
        scene,
        KindId::of::<SpecularGlossinessPbrMaterial>(),
        Box::new(SpecularGlossinessPbrGlMeshMaterialRenderer),
    );
}

/// The dielectric specular floor F0 (4%) shared by the metallic solver and the
/// baseColor blend.
const DIELECTRIC_SPECULAR: f32 = 0.04;

/// Builds a [`StandardPbrMaterialProperties`] block from a spec-gloss material via the
/// Khronos reference conversion. Writes a packed RGBA8 baseColor/emissive (the standard
/// block re-decodes them), so the downstream bind path stays identical to a native
/// StandardPbr material. Ports `convertSpecularGlossinessToStandard`.
fn convert_specular_glossiness_to_standard(
    material: &SpecularGlossinessPbrMaterial,
) -> StandardPbrMaterialProperties {
    let diffuse = unpack_color_to_linear(material.diffuse);
    let specular = unpack_color_to_linear(material.specular);

    let specular_brightness = specular[0].max(specular[1]).max(specular[2]);
    let one_minus_specular_strength = 1.0 - specular_brightness;
    let diffuse_brightness = diffuse[0].max(diffuse[1]).max(diffuse[2]);
    let metallic = solve_metallic(
        diffuse_brightness,
        specular_brightness,
        one_minus_specular_strength,
    );

    // baseColor: blend the dielectric diffuse estimate and the specular tint by
    // metallic, per the reference converter, then re-pack to RGBA8 for the standard
    // block to decode.
    let denom = (1.0 - DIELECTRIC_SPECULAR).max(1e-4);
    let r = lerp(
        diffuse[0] * one_minus_specular_strength / denom,
        specular[0],
        metallic,
    );
    let g = lerp(
        diffuse[1] * one_minus_specular_strength / denom,
        specular[1],
        metallic,
    );
    let b = lerp(
        diffuse[2] * one_minus_specular_strength / denom,
        specular[2],
        metallic,
    );

    StandardPbrMaterialProperties {
        base_color: pack_linear_rgba(r, g, b, diffuse[3]),
        base_color_map: material.diffuse_map.clone(),
        emissive: material.emissive,
        emissive_map: material.emissive_map.clone(),
        emissive_strength: material.emissive_strength,
        metallic,
        metallic_roughness_map: None,
        normal_map: material.normal_map.clone(),
        normal_scale: material.normal_scale,
        occlusion_map: material.occlusion_map.clone(),
        occlusion_strength: material.occlusion_strength,
        roughness: 1.0 - material.glossiness,
    }
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

/// Re-encodes a linear RGBA color (components in `[0,1]`) back to a packed
/// `0xRRGGBBAA` integer with the sRGB transfer, the inverse of
/// `unpack_color_to_linear`, so the standard block's CPU decode round-trips. Ports
/// `packLinearRgba`.
fn pack_linear_rgba(r: f32, g: f32, b: f32, a: f32) -> u32 {
    let to_byte = |linear: f32| -> u32 {
        let clamped = linear.clamp(0.0, 1.0);
        let srgb = if clamped <= 0.0031308 {
            clamped * 12.92
        } else {
            1.055 * clamped.powf(1.0 / 2.4) - 0.055
        };
        ((srgb * 255.0).round() as u32) & 0xff
    };
    let alpha = ((a.clamp(0.0, 1.0) * 255.0).round() as u32) & 0xff;
    (to_byte(r) << 24) | (to_byte(g) << 16) | (to_byte(b) << 8) | alpha
}

/// The Khronos spec-gloss → metallic solver: recovers the metallic factor from the
/// diffuse and specular reflectances by solving the quadratic that the
/// metallic-roughness F0 model implies. Below the 0.04 dielectric floor the surface is
/// fully dielectric (metallic 0). Ports `solveMetallic`.
fn solve_metallic(diffuse: f32, specular: f32, one_minus_specular_strength: f32) -> f32 {
    if specular < DIELECTRIC_SPECULAR {
        return 0.0;
    }
    let a = DIELECTRIC_SPECULAR;
    let b = diffuse * one_minus_specular_strength / (1.0 - DIELECTRIC_SPECULAR) + specular
        - 2.0 * DIELECTRIC_SPECULAR;
    let c = DIELECTRIC_SPECULAR - specular;
    let discriminant = (b * b - 4.0 * a * c).max(0.0);
    ((-b + discriminant.sqrt()) / (2.0 * a)).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::gl_mesh_material_registry::get_gl_mesh_material_renderer;
    use crate::gl_scene_runtime::create_gl_scene_runtime;

    // convert_specular_glossiness_to_standard

    #[test]
    fn convert_specular_glossiness_maps_glossiness_to_inverse_roughness() {
        let material = make_material(0.25);
        let standard = convert_specular_glossiness_to_standard(&material);
        assert!((standard.roughness - 0.75).abs() < 1e-6);
    }

    #[test]
    fn convert_specular_glossiness_reports_a_dielectric_as_metallic_zero() {
        // A black (0) specular is below the 0.04 floor → fully dielectric.
        let material = make_material(1.0);
        let standard = convert_specular_glossiness_to_standard(&material);
        assert_eq!(standard.metallic, 0.0);
    }

    // solve_metallic

    #[test]
    fn solve_metallic_is_zero_below_the_dielectric_floor() {
        assert_eq!(solve_metallic(0.5, 0.02, 0.98), 0.0);
    }

    #[test]
    fn solve_metallic_climbs_toward_one_for_bright_specular() {
        let m = solve_metallic(0.0, 1.0, 0.0);
        assert!(m > 0.9);
    }

    // pack_linear_rgba

    #[test]
    fn pack_linear_rgba_round_trips_white_through_the_srgb_transfer() {
        let packed = pack_linear_rgba(1.0, 1.0, 1.0, 1.0);
        assert_eq!(packed, 0xffffffff);
    }

    // register_specular_glossiness_pbr_gl_material

    #[test]
    fn register_specular_glossiness_pbr_gl_material_registers_for_the_kind() {
        let mut scene = create_gl_scene_runtime();
        register_specular_glossiness_pbr_gl_material(&mut scene);
        let kind = KindId::of::<SpecularGlossinessPbrMaterial>();
        assert!(get_gl_mesh_material_renderer(&scene, kind).is_some());
    }

    fn make_material(glossiness: f32) -> SpecularGlossinessPbrMaterial {
        SpecularGlossinessPbrMaterial {
            kind: KindId::of::<SpecularGlossinessPbrMaterial>(),
            alpha_cutoff: 0.5,
            alpha_mode: MaterialAlphaMode::Opaque,
            alpha_type: flighthq_types::alpha::AlphaType::default(),
            blend_mode: flighthq_types::blend::BlendMode::Normal,
            double_sided: false,
            diffuse: 0xffffffff,
            diffuse_map: None,
            emissive: 0x000000ff,
            emissive_map: None,
            emissive_strength: 1.0,
            glossiness,
            normal_map: None,
            normal_scale: 1.0,
            occlusion_map: None,
            occlusion_strength: 1.0,
            specular: 0x000000ff,
            specular_glossiness_map: None,
        }
    }
}
