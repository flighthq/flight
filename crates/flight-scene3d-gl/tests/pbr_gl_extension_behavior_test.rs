use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_materials::anisotropy_pbr_extension::create_anisotropy_pbr_extension;
use flight_materials::clearcoat_pbr_extension::create_clearcoat_pbr_extension;
use flight_materials::iridescence_pbr_extension::create_iridescence_pbr_extension;
use flight_materials::sheen_pbr_extension::create_sheen_pbr_extension;
use flight_materials::specular_pbr_extension::create_specular_pbr_extension;
use flight_materials::transmission_volume_pbr_extension::create_transmission_volume_pbr_extension;
use flight_materials::wrapped_diffuse_pbr_extension::create_wrapped_diffuse_pbr_extension;
use flight_materials::{PbrExtension, PbrUvSet};
use flight_render_gl::{
    GlPbrExtensionBindContext, GlPbrExtensionRegistration, GlPbrExtensionShaderContext,
};
use flight_scene3d_gl::*;
use flight_texture::{Texture, create_texture_2d};

struct ExpectedMap {
    name: &'static str,
    texture: Ref<Texture>,
    uv_set: PbrUvSet,
}

struct ExtensionCase {
    colors: Vec<(&'static str, u32)>,
    extension: PbrExtension,
    floats: Vec<(&'static str, f32)>,
    maps: Vec<ExpectedMap>,
    name: &'static str,
    registration: &'static GlPbrExtensionRegistration,
    transmission_scene_color: bool,
}

struct TextureBindCall {
    sampler_uniform: String,
    texture: Option<Ref<Texture>>,
    uv_set: PbrUvSet,
    uv_set_uniform: String,
    uv_transform_uniform: String,
}

struct BindRecorder {
    colors: Vec<(String, u32)>,
    floats: Vec<(String, f32)>,
    textures: Vec<TextureBindCall>,
    transmission_scene_color_count: usize,
}

impl GlPbrExtensionBindContext for BindRecorder {
    fn bind_transmission_scene_color(
        &mut self,
        _sampler_uniform: &str,
        _max_lod_uniform: &str,
    ) -> bool {
        self.transmission_scene_color_count += 1;
        return true;
    }

    fn bind_texture(
        &mut self,
        sampler_uniform: &str,
        uv_set_uniform: &str,
        uv_transform_uniform: &str,
        texture: Option<&Ref<Texture>>,
        uv_set: PbrUvSet,
    ) -> bool {
        self.textures.push(TextureBindCall {
            sampler_uniform: sampler_uniform.to_string(),
            texture: texture.cloned(),
            uv_set,
            uv_set_uniform: uv_set_uniform.to_string(),
            uv_transform_uniform: uv_transform_uniform.to_string(),
        });
        return true;
    }

    fn set_linear_color(&mut self, uniform: &str, color: u32) {
        self.colors.push((uniform.to_string(), color));
    }

    fn set_float(&mut self, uniform: &str, value: f32) {
        self.floats.push((uniform.to_string(), value));
    }
}

struct TestShaderContext {
    ready: Vec<Ref<Texture>>,
    scene_color: bool,
}

impl GlPbrExtensionShaderContext for TestShaderContext {
    fn has_transmission_scene_color(&self) -> bool {
        return self.scene_color;
    }

    fn is_texture_ready(&self, texture: Option<&Ref<Texture>>) -> bool {
        return texture
            .is_some_and(|texture| self.ready.iter().any(|ready| Arc::ptr_eq(ready, texture)));
    }
}

fn map() -> Ref<Texture> {
    return Arc::new(RwLock::new(Texture::Texture2D(create_texture_2d())));
}

fn expected(name: &'static str, texture: &Ref<Texture>, uv_set: PbrUvSet) -> ExpectedMap {
    return ExpectedMap {
        name,
        texture: texture.clone(),
        uv_set,
    };
}

fn create_cases() -> Vec<ExtensionCase> {
    let anisotropy = map();
    let clearcoat = map();
    let clearcoat_roughness = map();
    let clearcoat_normal = map();
    let iridescence = map();
    let iridescence_thickness = map();
    let sheen_color = map();
    let sheen_roughness = map();
    let specular = map();
    let specular_color = map();
    let transmission = map();
    let transmission_thickness = map();
    let wrapped_diffuse = map();
    let wrapped_diffuse_thickness = map();

    let mut anisotropy_extension = create_anisotropy_pbr_extension();
    anisotropy_extension.anisotropy_map = Some(anisotropy.clone());
    anisotropy_extension.anisotropy_map_uv_set = 1;
    anisotropy_extension.anisotropy_rotation = 0.7;
    anisotropy_extension.anisotropy_strength = 0.6;

    let mut clearcoat_extension = create_clearcoat_pbr_extension();
    clearcoat_extension.clearcoat = 0.8;
    clearcoat_extension.clearcoat_map = Some(clearcoat.clone());
    clearcoat_extension.clearcoat_map_uv_set = 1;
    clearcoat_extension.clearcoat_normal_map = Some(clearcoat_normal.clone());
    clearcoat_extension.clearcoat_normal_map_uv_set = 1;
    clearcoat_extension.clearcoat_normal_scale = 0.5;
    clearcoat_extension.clearcoat_roughness = 0.3;
    clearcoat_extension.clearcoat_roughness_map = Some(clearcoat_roughness.clone());
    clearcoat_extension.clearcoat_roughness_map_uv_set = 0;

    let mut iridescence_extension = create_iridescence_pbr_extension();
    iridescence_extension.iridescence = 0.75;
    iridescence_extension.iridescence_ior = 1.4;
    iridescence_extension.iridescence_map = Some(iridescence.clone());
    iridescence_extension.iridescence_map_uv_set = 0;
    iridescence_extension.iridescence_thickness_map = Some(iridescence_thickness.clone());
    iridescence_extension.iridescence_thickness_map_uv_set = 1;
    iridescence_extension.iridescence_thickness_max = 700.0;
    iridescence_extension.iridescence_thickness_min = 200.0;

    let mut sheen_extension = create_sheen_pbr_extension();
    sheen_extension.sheen_color = 0x804020ff;
    sheen_extension.sheen_color_map = Some(sheen_color.clone());
    sheen_extension.sheen_color_map_uv_set = 1;
    sheen_extension.sheen_roughness = 0.4;
    sheen_extension.sheen_roughness_map = Some(sheen_roughness.clone());
    sheen_extension.sheen_roughness_map_uv_set = 0;

    let mut specular_extension = create_specular_pbr_extension();
    specular_extension.specular = 0.65;
    specular_extension.specular_color = 0x406080ff;
    specular_extension.specular_color_map = Some(specular_color.clone());
    specular_extension.specular_color_map_uv_set = 0;
    specular_extension.specular_map = Some(specular.clone());
    specular_extension.specular_map_uv_set = 1;

    let mut transmission_extension = create_transmission_volume_pbr_extension();
    transmission_extension.attenuation_color = 0x204060ff;
    transmission_extension.attenuation_distance = 9.0;
    transmission_extension.ior = 1.45;
    transmission_extension.thickness = 0.25;
    transmission_extension.thickness_map = Some(transmission_thickness.clone());
    transmission_extension.thickness_map_uv_set = 1;
    transmission_extension.transmission = 0.85;
    transmission_extension.transmission_map = Some(transmission.clone());
    transmission_extension.transmission_map_uv_set = 0;

    let mut wrapped_extension = create_wrapped_diffuse_pbr_extension();
    wrapped_extension.thickness = 0.35;
    wrapped_extension.thickness_map = Some(wrapped_diffuse_thickness.clone());
    wrapped_extension.thickness_map_uv_set = 0;
    wrapped_extension.wrapped_diffuse_color = 0x608040ff;
    wrapped_extension.wrapped_diffuse_map = Some(wrapped_diffuse.clone());
    wrapped_extension.wrapped_diffuse_map_uv_set = 1;
    wrapped_extension.wrapped_diffuse_strength = 0.9;

    return vec![
        ExtensionCase {
            colors: vec![],
            extension: PbrExtension::Anisotropy(anisotropy_extension),
            floats: vec![
                ("u_flightAnisotropyRotation", 0.7),
                ("u_flightAnisotropyStrength", 0.6),
            ],
            maps: vec![expected("Anisotropy", &anisotropy, 1)],
            name: "anisotropy",
            registration: &ANISOTROPY_PBR_GL_EXTENSION,
            transmission_scene_color: false,
        },
        ExtensionCase {
            colors: vec![],
            extension: PbrExtension::Clearcoat(clearcoat_extension),
            floats: vec![
                ("u_flightClearcoat", 0.8),
                ("u_flightClearcoatNormalScale", 0.5),
                ("u_flightClearcoatRoughness", 0.3),
            ],
            maps: vec![
                expected("Clearcoat", &clearcoat, 1),
                expected("ClearcoatRoughness", &clearcoat_roughness, 0),
                expected("ClearcoatNormal", &clearcoat_normal, 1),
            ],
            name: "clearcoat",
            registration: &CLEARCOAT_PBR_GL_EXTENSION,
            transmission_scene_color: false,
        },
        ExtensionCase {
            colors: vec![],
            extension: PbrExtension::Iridescence(iridescence_extension),
            floats: vec![
                ("u_flightIridescence", 0.75),
                ("u_flightIridescenceIor", 1.4),
                ("u_flightIridescenceThicknessMax", 700.0),
                ("u_flightIridescenceThicknessMin", 200.0),
            ],
            maps: vec![
                expected("Iridescence", &iridescence, 0),
                expected("IridescenceThickness", &iridescence_thickness, 1),
            ],
            name: "iridescence",
            registration: &IRIDESCENCE_PBR_GL_EXTENSION,
            transmission_scene_color: false,
        },
        ExtensionCase {
            colors: vec![("u_flightSheenColor", 0x804020ff)],
            extension: PbrExtension::Sheen(sheen_extension),
            floats: vec![("u_flightSheenRoughness", 0.4)],
            maps: vec![
                expected("SheenColor", &sheen_color, 1),
                expected("SheenRoughness", &sheen_roughness, 0),
            ],
            name: "sheen",
            registration: &SHEEN_PBR_GL_EXTENSION,
            transmission_scene_color: false,
        },
        ExtensionCase {
            colors: vec![("u_flightSpecularColor", 0x406080ff)],
            extension: PbrExtension::Specular(specular_extension),
            floats: vec![("u_flightSpecular", 0.65)],
            maps: vec![
                expected("Specular", &specular, 1),
                expected("SpecularColor", &specular_color, 0),
            ],
            name: "specular",
            registration: &SPECULAR_PBR_GL_EXTENSION,
            transmission_scene_color: false,
        },
        ExtensionCase {
            colors: vec![("u_flightAttenuationColor", 0x204060ff)],
            extension: PbrExtension::TransmissionVolume(transmission_extension),
            floats: vec![
                ("u_flightAttenuationDistance", 9.0),
                ("u_flightTransmission", 0.85),
                ("u_flightTransmissionIor", 1.45),
                ("u_flightTransmissionThickness", 0.25),
            ],
            maps: vec![
                expected("Transmission", &transmission, 0),
                expected("TransmissionThickness", &transmission_thickness, 1),
            ],
            name: "transmission-volume",
            registration: &TRANSMISSION_VOLUME_PBR_GL_EXTENSION,
            transmission_scene_color: true,
        },
        ExtensionCase {
            colors: vec![("u_flightWrappedDiffuseColor", 0x608040ff)],
            extension: PbrExtension::WrappedDiffuse(wrapped_extension),
            floats: vec![
                ("u_flightWrappedDiffuseStrength", 0.9),
                ("u_flightWrappedDiffuseThickness", 0.35),
            ],
            maps: vec![
                expected("WrappedDiffuse", &wrapped_diffuse, 1),
                expected("WrappedDiffuseThickness", &wrapped_diffuse_thickness, 0),
            ],
            name: "wrapped-diffuse",
            registration: &WRAPPED_DIFFUSE_PBR_GL_EXTENSION,
            transmission_scene_color: false,
        },
    ];
}

// TS compares Object.fromEntries records: order-independent, last write wins.
fn to_record<T: Copy>(entries: &[(String, T)]) -> BTreeMap<String, T> {
    return entries
        .iter()
        .map(|(name, value)| (name.clone(), *value))
        .collect();
}

fn to_expected_record<T: Copy>(entries: &[(&'static str, T)]) -> BTreeMap<String, T> {
    return entries
        .iter()
        .map(|(name, value)| (name.to_string(), *value))
        .collect();
}

mod pbr_extension_binding_behavior {
    use super::*;

    #[test]
    fn binds_every_scalar_color_map_uv_set_and_transform_independently() {
        for test_case in create_cases() {
            let mut calls = BindRecorder {
                colors: Vec::new(),
                floats: Vec::new(),
                textures: Vec::new(),
                transmission_scene_color_count: 0,
            };

            (test_case.registration.bind)(&mut calls, &test_case.extension);

            assert_eq!(
                to_record(&calls.floats),
                to_expected_record(&test_case.floats),
                "{}",
                test_case.name
            );
            assert_eq!(
                to_record(&calls.colors),
                to_expected_record(&test_case.colors),
                "{}",
                test_case.name
            );
            assert_eq!(
                calls.transmission_scene_color_count,
                usize::from(test_case.transmission_scene_color),
                "{}",
                test_case.name
            );
            assert_eq!(
                calls.textures.len(),
                test_case.maps.len(),
                "{}",
                test_case.name
            );
            for (call, map) in calls.textures.iter().zip(&test_case.maps) {
                assert_eq!(
                    call.sampler_uniform,
                    format!("u_flight{}Map", map.name),
                    "{}",
                    test_case.name
                );
                assert!(
                    call.texture
                        .as_ref()
                        .is_some_and(|texture| Arc::ptr_eq(texture, &map.texture)),
                    "{}",
                    test_case.name
                );
                assert_eq!(call.uv_set, map.uv_set, "{}", test_case.name);
                assert_eq!(
                    call.uv_set_uniform,
                    format!("u_flight{}MapUvSet", map.name),
                    "{}",
                    test_case.name
                );
                assert_eq!(
                    call.uv_transform_uniform,
                    format!("u_flight{}MapTransform", map.name),
                    "{}",
                    test_case.name
                );
            }
        }
    }
}

mod pbr_extension_map_shader_behavior {
    use super::*;

    #[test]
    fn samples_every_ready_map_through_its_own_uv_selector_and_transform() {
        for test_case in create_cases() {
            let context = TestShaderContext {
                ready: test_case
                    .maps
                    .iter()
                    .map(|value| value.texture.clone())
                    .collect(),
                scene_color: test_case.transmission_scene_color,
            };
            let contribution =
                (test_case.registration.create_shader_contribution)(&context, &test_case.extension);
            let source = format!(
                "{}\n{}\n{}\n{}\n{}\n{}",
                contribution.fragment_declarations,
                contribution.fragment_functions,
                contribution.apply_surface,
                contribution.contribute_punctual,
                contribution.contribute_ibl,
                contribution.finalize
            );

            assert_eq!(
                contribution.texture_count as usize,
                test_case.maps.len() + usize::from(test_case.transmission_scene_color),
                "{}",
                test_case.name
            );
            for map in &test_case.maps {
                let name = map.name;
                assert!(
                    source.contains(&format!("uniform sampler2D u_flight{name}Map")),
                    "{name}"
                );
                assert!(
                    source.contains(&format!(
                        "u_flight{name}MapUvSet == 1 ? v_pbrExtensionUv1 : v_pbrExtensionUv0"
                    )),
                    "{name}"
                );
                assert!(
                    source.contains(&format!("u_flight{name}MapTransform * vec3(uv, 1.0)")),
                    "{name}"
                );
                assert!(
                    source.contains(&format!("texture(u_flight{name}Map")),
                    "{name}"
                );
            }
        }
    }

    #[test]
    fn omits_map_uniforms_and_texture_units_when_no_map_is_ready() {
        for test_case in create_cases() {
            let context = TestShaderContext {
                ready: Vec::new(),
                scene_color: false,
            };
            let contribution =
                (test_case.registration.create_shader_contribution)(&context, &test_case.extension);

            assert_eq!(contribution.texture_count, 0, "{}", test_case.name);
            for map in &test_case.maps {
                assert!(
                    !contribution
                        .fragment_declarations
                        .contains(&format!("u_flight{}Map", map.name)),
                    "{}",
                    test_case.name
                );
            }
        }
    }
}
