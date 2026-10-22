use flight_entity::Ref;
use flight_materials::{ExtendedPbrMaterial, PbrExtension};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMaterial};
use flight_scene3d_formats::contract::*;

pub fn extension_gltf(
    image: &str,
    material: serde_json::Value,
    handlers: &[Ref<GltfExtensionHandler>],
) -> Ref<Scene3DDocument> {
    let source = serde_json::json!({"asset":{"version":"2.0"},"images":[{"uri":image}],"materials":[material],"samplers":[{}],"scenes":[{"nodes":[]}],"textures":[{"sampler":0,"source":0}]}).to_string();
    return parse_gltf(
        &GltfSource::Json(GltfJsonSource { source: &source }),
        None,
        Some(&GltfImportOptions {
            base_path: None,
            draco_registry: None,
            external_buffers: None,
            extension_handlers: Some(handlers.to_vec()),
        }),
    );
}

pub fn first_gltf_extension(document: &Ref<Scene3DDocument>) -> Ref<PbrExtension> {
    let document = document.read().unwrap();
    let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
        panic!("expected material entity");
    };
    let material = material.material.read().unwrap();
    let extended = material
        .as_any()
        .downcast_ref::<ExtendedPbrMaterial>()
        .unwrap();
    return extended.extensions[0].clone();
}

pub fn packed_gltf_color(r: f32, g: f32, b: f32) -> u32 {
    let mut color = flight_color::allocate_linear_color();
    color.r = r;
    color.g = g;
    color.b = b;
    color.a = 1.0;
    return flight_color::pack_linear_to_color(&color);
}

pub fn assert_gltf_close(actual: f32, expected: f64) {
    // D1 f32 bound (TS: 0.0000005)
    let bound = 0.0000005_f64.max(4.0 * f32::EPSILON as f64 * expected.abs().max(1.0));
    assert!(
        (actual as f64 - expected).abs() <= bound,
        "{actual} != {expected}, bound {bound}"
    );
}

pub fn with_gltf_material<T: std::any::Any>(
    document: &Ref<Scene3DDocument>,
    check: impl FnOnce(&T),
) {
    let document = document.read().unwrap();
    let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
        panic!("expected material entity");
    };
    let material = material.material.read().unwrap();
    check(material.as_any().downcast_ref::<T>().unwrap());
}

pub fn gltf_material_kind(document: &Ref<Scene3DDocument>) -> String {
    let document = document.read().unwrap();
    let Scene3DDocumentMaterial::Entity(material) = &document.materials[0] else {
        panic!("expected material entity");
    };
    return material
        .material
        .read()
        .unwrap()
        .material_fields()
        .kind
        .clone();
}

pub fn parse_extension_source(
    source: serde_json::Value,
    diagnostics: Option<&Ref<Vec<flight_importdiagnostics::ImportDiagnostic>>>,
    handlers: &[Ref<GltfExtensionHandler>],
) -> Ref<Scene3DDocument> {
    let source = source.to_string();
    return parse_gltf(
        &GltfSource::Json(GltfJsonSource { source: &source }),
        diagnostics,
        Some(&GltfImportOptions {
            base_path: None,
            draco_registry: None,
            external_buffers: None,
            extension_handlers: Some(handlers.to_vec()),
        }),
    );
}
