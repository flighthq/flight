use crate::gltf_schema::*;
use flight_entity::{Record, Ref, Unknown, set_record_value};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

#[cfg(test)]
#[path = "../tests/internal/gltf_json_test.rs"]
mod tests;

pub(crate) struct GltfJsonDocument {
    pub source: Ref<GltfDocument>,
    pub metadata: Arc<GltfJsonMetadata>,
}

pub(crate) struct GltfJsonMetadata {
    by_record_id: HashMap<usize, HashMap<String, Value>>,
}

fn decode_gltf_accessor(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfAccessor> {
    let record = Arc::new(RwLock::new(GltfAccessor {
        buffer_view: source.get("bufferView").map(json_number),
        byte_offset: source.get("byteOffset").map(json_number),
        component_type: json_number(source.get("componentType").unwrap_or(&Value::Null)),
        count: json_number(source.get("count").unwrap_or(&Value::Null)),
        normalized: source.get("normalized").and_then(Value::as_bool),
        r#type: source
            .get("type")
            .unwrap_or(&Value::Null)
            .as_str()
            .unwrap_or("")
            .to_string(),
        sparse: source
            .get("sparse")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_accessor_sparse(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_accessor_sparse(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfAccessorSparse> {
    let record = Arc::new(RwLock::new(GltfAccessorSparse {
        count: json_number(source.get("count").unwrap_or(&Value::Null)),
        indices: decode_gltf_accessor_sparse_indices(
            source.get("indices").unwrap_or(&Value::Null),
            metadata,
        ),
        values: decode_gltf_accessor_sparse_values(
            source.get("values").unwrap_or(&Value::Null),
            metadata,
        ),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_accessor_sparse_indices(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfAccessorSparseIndices> {
    let record = Arc::new(RwLock::new(GltfAccessorSparseIndices {
        buffer_view: json_number(source.get("bufferView").unwrap_or(&Value::Null)),
        byte_offset: source.get("byteOffset").map(json_number),
        component_type: json_number(source.get("componentType").unwrap_or(&Value::Null)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_accessor_sparse_values(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfAccessorSparseValues> {
    let record = Arc::new(RwLock::new(GltfAccessorSparseValues {
        buffer_view: json_number(source.get("bufferView").unwrap_or(&Value::Null)),
        byte_offset: source.get("byteOffset").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_animation(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfAnimation> {
    let record = Arc::new(RwLock::new(GltfAnimation {
        name: source
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        channels: source
            .get("channels")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_animation_channel(value, metadata))
                    .collect()
            })
            .unwrap_or_default(),
        samplers: source
            .get("samplers")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_animation_sampler(value, metadata))
                    .collect()
            })
            .unwrap_or_default(),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_animation_channel(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfAnimationChannel> {
    let record = Arc::new(RwLock::new(GltfAnimationChannel {
        sampler: json_number(source.get("sampler").unwrap_or(&Value::Null)),
        target: decode_gltf_animation_target(
            source.get("target").unwrap_or(&Value::Null),
            metadata,
        ),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_animation_sampler(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfAnimationSampler> {
    let record = Arc::new(RwLock::new(GltfAnimationSampler {
        input: json_number(source.get("input").unwrap_or(&Value::Null)),
        output: json_number(source.get("output").unwrap_or(&Value::Null)),
        interpolation: source
            .get("interpolation")
            .and_then(Value::as_str)
            .map(str::to_string),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_animation_target(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfAnimationTarget> {
    let record = Arc::new(RwLock::new(GltfAnimationTarget {
        node: source.get("node").map(json_number),
        path: source
            .get("path")
            .unwrap_or(&Value::Null)
            .as_str()
            .unwrap_or("")
            .to_string(),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_asset(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfAsset> {
    let record = Arc::new(RwLock::new(GltfAsset {
        version: source
            .get("version")
            .unwrap_or(&Value::Null)
            .as_str()
            .unwrap_or("")
            .to_string(),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_buffer(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfBuffer> {
    let record = Arc::new(RwLock::new(GltfBuffer {
        byte_length: json_number(source.get("byteLength").unwrap_or(&Value::Null)),
        uri: source
            .get("uri")
            .and_then(Value::as_str)
            .map(str::to_string),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_buffer_view(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfBufferView> {
    let record = Arc::new(RwLock::new(GltfBufferView {
        buffer: json_number(source.get("buffer").unwrap_or(&Value::Null)),
        byte_length: json_number(source.get("byteLength").unwrap_or(&Value::Null)),
        byte_offset: source.get("byteOffset").map(json_number),
        byte_stride: source.get("byteStride").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_camera(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfCamera> {
    let record = Arc::new(RwLock::new(GltfCamera {
        name: source
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        orthographic: source
            .get("orthographic")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_orthographic_camera(value, metadata)),
        perspective: source
            .get("perspective")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_perspective_camera(value, metadata)),
        r#type: source
            .get("type")
            .unwrap_or(&Value::Null)
            .as_str()
            .unwrap_or("")
            .to_string(),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_document(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfDocument> {
    let record = Arc::new(RwLock::new(GltfDocument {
        asset: source
            .get("asset")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_asset(value, metadata)),
        cameras: source.get("cameras").and_then(Value::as_array).map(|rows| {
            rows.iter()
                .map(|value| decode_gltf_camera(value, metadata))
                .collect()
        }),
        scene: source.get("scene").map(json_number),
        scenes: source.get("scenes").and_then(Value::as_array).map(|rows| {
            rows.iter()
                .map(|value| decode_gltf_scene3d(value, metadata))
                .collect()
        }),
        nodes: source.get("nodes").and_then(Value::as_array).map(|rows| {
            rows.iter()
                .map(|value| decode_gltf_node(value, metadata))
                .collect()
        }),
        meshes: source.get("meshes").and_then(Value::as_array).map(|rows| {
            rows.iter()
                .map(|value| decode_gltf_mesh(value, metadata))
                .collect()
        }),
        materials: source
            .get("materials")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_material(value, metadata))
                    .collect()
            }),
        textures: source
            .get("textures")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_texture(value, metadata))
                    .collect()
            }),
        samplers: source
            .get("samplers")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_sampler(value, metadata))
                    .collect()
            }),
        images: source.get("images").and_then(Value::as_array).map(|rows| {
            rows.iter()
                .map(|value| decode_gltf_image(value, metadata))
                .collect()
        }),
        animations: source
            .get("animations")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_animation(value, metadata))
                    .collect()
            }),
        accessors: source
            .get("accessors")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_accessor(value, metadata))
                    .collect()
            }),
        buffer_views: source
            .get("bufferViews")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_buffer_view(value, metadata))
                    .collect()
            }),
        buffers: source.get("buffers").and_then(Value::as_array).map(|rows| {
            rows.iter()
                .map(|value| decode_gltf_buffer(value, metadata))
                .collect()
        }),
        skins: source.get("skins").and_then(Value::as_array).map(|rows| {
            rows.iter()
                .map(|value| decode_gltf_skin(value, metadata))
                .collect()
        }),
        extensions_used: source
            .get("extensionsUsed")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            }),
        extensions_required: source
            .get("extensionsRequired")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            }),
        extensions: source
            .get("extensions")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_document_extensions(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_document_extensions(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfDocumentExtensions> {
    let record = Arc::new(RwLock::new(GltfDocumentExtensions {
        khr_lights_punctual: source
            .get("KHR_lights_punctual")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_punctual_lights(value, metadata)),
        vendor: json_vendor_fields(source, &["KHR_lights_punctual"]),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_draco_mesh_compression(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfDracoMeshCompression> {
    let record = Arc::new(RwLock::new(GltfDracoMeshCompression {
        attributes: decode_gltf_number_record(
            source.get("attributes").unwrap_or(&Value::Null),
            metadata,
        ),
        buffer_view: json_number(source.get("bufferView").unwrap_or(&Value::Null)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_image(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfImage> {
    let record = Arc::new(RwLock::new(GltfImage {
        uri: source
            .get("uri")
            .and_then(Value::as_str)
            .map(str::to_string),
        mime_type: source
            .get("mimeType")
            .and_then(Value::as_str)
            .map(str::to_string),
        buffer_view: source.get("bufferView").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

pub(crate) fn decode_gltf_json(source: &Value) -> GltfJsonDocument {
    let mut metadata = GltfJsonMetadata {
        by_record_id: HashMap::new(),
    };
    let source = decode_gltf_document(source, &mut metadata);
    return GltfJsonDocument {
        source,
        metadata: Arc::new(metadata),
    };
}

fn decode_gltf_material(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfMaterial> {
    let record = Arc::new(RwLock::new(GltfMaterial {
        name: source
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        pbr_metallic_roughness: source
            .get("pbrMetallicRoughness")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_pbr_metallic_roughness(value, metadata)),
        normal_texture: source
            .get("normalTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_normal_texture_info(value, metadata)),
        occlusion_texture: source
            .get("occlusionTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_occlusion_texture_info(value, metadata)),
        emissive_texture: source
            .get("emissiveTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
        emissive_factor: source
            .get("emissiveFactor")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        alpha_mode: source
            .get("alphaMode")
            .and_then(Value::as_str)
            .map(str::to_string),
        alpha_cutoff: source.get("alphaCutoff").map(json_number),
        double_sided: source.get("doubleSided").and_then(Value::as_bool),
        extensions: source
            .get("extensions")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_material_extensions(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_material_extensions(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialExtensions> {
    let record = Arc::new(RwLock::new(GltfMaterialExtensions {
        khr_materials_anisotropy: source
            .get("KHR_materials_anisotropy")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_anisotropy(value, metadata)),
        khr_materials_clearcoat: source
            .get("KHR_materials_clearcoat")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_clearcoat(value, metadata)),
        khr_materials_emissive_strength: source
            .get("KHR_materials_emissive_strength")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_emissive_strength(value, metadata)),
        khr_materials_ior: source
            .get("KHR_materials_ior")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_ior(value, metadata)),
        khr_materials_iridescence: source
            .get("KHR_materials_iridescence")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_iridescence(value, metadata)),
        khr_materials_pbr_specular_glossiness: source
            .get("KHR_materials_pbrSpecularGlossiness")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_pbr_specular_glossiness(value, metadata)),
        khr_materials_sheen: source
            .get("KHR_materials_sheen")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_sheen(value, metadata)),
        khr_materials_unlit: source
            .get("KHR_materials_unlit")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_unlit(value, metadata)),
        khr_materials_specular: source
            .get("KHR_materials_specular")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_specular(value, metadata)),
        khr_materials_transmission: source
            .get("KHR_materials_transmission")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_transmission(value, metadata)),
        khr_materials_volume: source
            .get("KHR_materials_volume")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_materials_volume(value, metadata)),
        vendor: json_vendor_fields(
            source,
            &[
                "KHR_materials_anisotropy",
                "KHR_materials_clearcoat",
                "KHR_materials_emissive_strength",
                "KHR_materials_ior",
                "KHR_materials_iridescence",
                "KHR_materials_pbrSpecularGlossiness",
                "KHR_materials_sheen",
                "KHR_materials_unlit",
                "KHR_materials_specular",
                "KHR_materials_transmission",
                "KHR_materials_volume",
            ],
        ),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_anisotropy(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsAnisotropy> {
    let record = Arc::new(RwLock::new(GltfMaterialsAnisotropy {
        anisotropy_rotation: source.get("anisotropyRotation").map(json_number),
        anisotropy_strength: source.get("anisotropyStrength").map(json_number),
        anisotropy_texture: source
            .get("anisotropyTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_clearcoat(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsClearcoat> {
    let record = Arc::new(RwLock::new(GltfMaterialsClearcoat {
        clearcoat_factor: source.get("clearcoatFactor").map(json_number),
        clearcoat_normal_texture: source
            .get("clearcoatNormalTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_normal_texture_info(value, metadata)),
        clearcoat_roughness_factor: source.get("clearcoatRoughnessFactor").map(json_number),
        clearcoat_roughness_texture: source
            .get("clearcoatRoughnessTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
        clearcoat_texture: source
            .get("clearcoatTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_emissive_strength(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsEmissiveStrength> {
    let record = Arc::new(RwLock::new(GltfMaterialsEmissiveStrength {
        emissive_strength: source.get("emissiveStrength").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_ior(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsIor> {
    let record = Arc::new(RwLock::new(GltfMaterialsIor {
        ior: source.get("ior").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_iridescence(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsIridescence> {
    let record = Arc::new(RwLock::new(GltfMaterialsIridescence {
        iridescence_factor: source.get("iridescenceFactor").map(json_number),
        iridescence_ior: source.get("iridescenceIor").map(json_number),
        iridescence_texture: source
            .get("iridescenceTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
        iridescence_thickness_maximum: source.get("iridescenceThicknessMaximum").map(json_number),
        iridescence_thickness_minimum: source.get("iridescenceThicknessMinimum").map(json_number),
        iridescence_thickness_texture: source
            .get("iridescenceThicknessTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_pbr_specular_glossiness(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsPbrSpecularGlossiness> {
    let record = Arc::new(RwLock::new(GltfMaterialsPbrSpecularGlossiness {
        diffuse_factor: source
            .get("diffuseFactor")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        diffuse_texture: source
            .get("diffuseTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
        glossiness_factor: source.get("glossinessFactor").map(json_number),
        specular_factor: source
            .get("specularFactor")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        specular_glossiness_texture: source
            .get("specularGlossinessTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_sheen(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsSheen> {
    let record = Arc::new(RwLock::new(GltfMaterialsSheen {
        sheen_color_factor: source
            .get("sheenColorFactor")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        sheen_color_texture: source
            .get("sheenColorTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
        sheen_roughness_factor: source.get("sheenRoughnessFactor").map(json_number),
        sheen_roughness_texture: source
            .get("sheenRoughnessTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_specular(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsSpecular> {
    let record = Arc::new(RwLock::new(GltfMaterialsSpecular {
        specular_color_factor: source
            .get("specularColorFactor")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        specular_color_texture: source
            .get("specularColorTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
        specular_factor: source.get("specularFactor").map(json_number),
        specular_texture: source
            .get("specularTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_transmission(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsTransmission> {
    let record = Arc::new(RwLock::new(GltfMaterialsTransmission {
        transmission_factor: source.get("transmissionFactor").map(json_number),
        transmission_texture: source
            .get("transmissionTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_unlit(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsUnlit> {
    let record = Arc::new(RwLock::new(GltfMaterialsUnlit {}));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_materials_volume(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMaterialsVolume> {
    let record = Arc::new(RwLock::new(GltfMaterialsVolume {
        attenuation_color: source
            .get("attenuationColor")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        attenuation_distance: source.get("attenuationDistance").map(json_number),
        thickness_factor: source.get("thicknessFactor").map(json_number),
        thickness_texture: source
            .get("thicknessTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_mesh(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfMesh> {
    let record = Arc::new(RwLock::new(GltfMesh {
        name: source
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        primitives: source
            .get("primitives")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_primitive(value, metadata))
                    .collect()
            })
            .unwrap_or_default(),
        weights: source
            .get("weights")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_morph_target(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfMorphTarget> {
    let record = Arc::new(RwLock::new(GltfMorphTarget {
        normal: source.get("NORMAL").map(json_number),
        position: source.get("POSITION").map(json_number),
        tangent: source.get("TANGENT").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_node(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfNode> {
    let record = Arc::new(RwLock::new(GltfNode {
        camera: source.get("camera").map(json_number),
        name: source
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        children: source
            .get("children")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        mesh: source.get("mesh").map(json_number),
        skin: source.get("skin").map(json_number),
        matrix: source
            .get("matrix")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        translation: source
            .get("translation")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        rotation: source
            .get("rotation")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        scale: source
            .get("scale")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        extensions: source
            .get("extensions")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_node_extensions(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_node_extensions(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfNodeExtensions> {
    let record = Arc::new(RwLock::new(GltfNodeExtensions {
        khr_lights_punctual: source
            .get("KHR_lights_punctual")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_node_punctual_light(value, metadata)),
        vendor: json_vendor_fields(source, &["KHR_lights_punctual"]),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_node_punctual_light(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfNodePunctualLight> {
    let record = Arc::new(RwLock::new(GltfNodePunctualLight {
        light: json_number(source.get("light").unwrap_or(&Value::Null)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_normal_texture_info(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfNormalTextureInfo> {
    let record = Arc::new(RwLock::new(GltfNormalTextureInfo {
        fields: decode_gltf_texture_info_fields(source, metadata),
        scale: source.get("scale").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_number_record(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<Record<f32>> {
    let mut record = Record::default();
    if let Some(object_members) = source.as_object() {
        for (key, value) in object_members {
            set_record_value(&mut record, key.clone(), json_number(value));
        }
    }
    let record = Arc::new(RwLock::new(record));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_occlusion_texture_info(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfOcclusionTextureInfo> {
    let record = Arc::new(RwLock::new(GltfOcclusionTextureInfo {
        fields: decode_gltf_texture_info_fields(source, metadata),
        strength: source.get("strength").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_orthographic_camera(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfOrthographicCamera> {
    let record = Arc::new(RwLock::new(GltfOrthographicCamera {
        xmag: json_number(source.get("xmag").unwrap_or(&Value::Null)),
        ymag: json_number(source.get("ymag").unwrap_or(&Value::Null)),
        zfar: json_number(source.get("zfar").unwrap_or(&Value::Null)),
        znear: json_number(source.get("znear").unwrap_or(&Value::Null)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_pbr_metallic_roughness(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfPbrMetallicRoughness> {
    let record = Arc::new(RwLock::new(GltfPbrMetallicRoughness {
        base_color_factor: source
            .get("baseColorFactor")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        base_color_texture: source
            .get("baseColorTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
        metallic_factor: source.get("metallicFactor").map(json_number),
        roughness_factor: source.get("roughnessFactor").map(json_number),
        metallic_roughness_texture: source
            .get("metallicRoughnessTexture")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_perspective_camera(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfPerspectiveCamera> {
    let record = Arc::new(RwLock::new(GltfPerspectiveCamera {
        aspect_ratio: source.get("aspectRatio").map(json_number),
        yfov: json_number(source.get("yfov").unwrap_or(&Value::Null)),
        zfar: source.get("zfar").map(json_number),
        znear: json_number(source.get("znear").unwrap_or(&Value::Null)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_primitive(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfPrimitive> {
    let record = Arc::new(RwLock::new(GltfPrimitive {
        attributes: decode_gltf_primitive_attributes(
            source.get("attributes").unwrap_or(&Value::Null),
            metadata,
        ),
        indices: source.get("indices").map(json_number),
        material: source.get("material").map(json_number),
        mode: source.get("mode").map(json_number),
        extensions: source
            .get("extensions")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_primitive_extensions(value, metadata)),
        targets: source.get("targets").and_then(Value::as_array).map(|rows| {
            rows.iter()
                .map(|value| decode_gltf_morph_target(value, metadata))
                .collect()
        }),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_primitive_attributes(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfPrimitiveAttributes> {
    let record = Arc::new(RwLock::new(GltfPrimitiveAttributes {
        joints_0: source.get("JOINTS_0").map(json_number),
        normal: source.get("NORMAL").map(json_number),
        position: source.get("POSITION").map(json_number),
        tangent: source.get("TANGENT").map(json_number),
        texcoord_0: source.get("TEXCOORD_0").map(json_number),
        weights_0: source.get("WEIGHTS_0").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_primitive_extensions(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfPrimitiveExtensions> {
    let record = Arc::new(RwLock::new(GltfPrimitiveExtensions {
        khr_draco_mesh_compression: source
            .get("KHR_draco_mesh_compression")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_draco_mesh_compression(value, metadata)),
        vendor: json_vendor_fields(source, &["KHR_draco_mesh_compression"]),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_punctual_light(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfPunctualLight> {
    let record = Arc::new(RwLock::new(GltfPunctualLight {
        color: source
            .get("color")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        intensity: source.get("intensity").map(json_number),
        name: source
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        range: source.get("range").map(json_number),
        spot: source
            .get("spot")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_punctual_light_spot(value, metadata)),
        r#type: source
            .get("type")
            .unwrap_or(&Value::Null)
            .as_str()
            .unwrap_or("")
            .to_string(),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_punctual_light_spot(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfPunctualLightSpot> {
    let record = Arc::new(RwLock::new(GltfPunctualLightSpot {
        inner_cone_angle: source.get("innerConeAngle").map(json_number),
        outer_cone_angle: source.get("outerConeAngle").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_punctual_lights(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfPunctualLights> {
    let record = Arc::new(RwLock::new(GltfPunctualLights {
        lights: source
            .get("lights")
            .and_then(Value::as_array)
            .map(|rows| {
                rows.iter()
                    .map(|value| decode_gltf_punctual_light(value, metadata))
                    .collect()
            })
            .unwrap_or_default(),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_sampler(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfSampler> {
    let record = Arc::new(RwLock::new(GltfSampler {
        mag_filter: source.get("magFilter").map(json_number),
        min_filter: source.get("minFilter").map(json_number),
        wrap_s: source.get("wrapS").map(json_number),
        wrap_t: source.get("wrapT").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_scene3d(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfScene3D> {
    let record = Arc::new(RwLock::new(GltfScene3D {
        name: source
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        nodes: source
            .get("nodes")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_skin(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfSkin> {
    let record = Arc::new(RwLock::new(GltfSkin {
        name: source
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string),
        inverse_bind_matrices: source.get("inverseBindMatrices").map(json_number),
        joints: source
            .get("joints")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect())
            .unwrap_or_default(),
        skeleton: source.get("skeleton").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_texture(source: &Value, metadata: &mut GltfJsonMetadata) -> Ref<GltfTexture> {
    let record = Arc::new(RwLock::new(GltfTexture {
        extensions: source
            .get("extensions")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_extensions(value, metadata)),
        sampler: source.get("sampler").map(json_number),
        source: source.get("source").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_texture_basisu(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfTextureBasisu> {
    let record = Arc::new(RwLock::new(GltfTextureBasisu {
        source: json_number(source.get("source").unwrap_or(&Value::Null)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_texture_extensions(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfTextureExtensions> {
    let record = Arc::new(RwLock::new(GltfTextureExtensions {
        khr_texture_basisu: source
            .get("KHR_texture_basisu")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_basisu(value, metadata)),
        vendor: json_vendor_fields(source, &["KHR_texture_basisu"]),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_texture_info(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfTextureInfo> {
    let record = Arc::new(RwLock::new(GltfTextureInfo {
        index: json_number(source.get("index").unwrap_or(&Value::Null)),
        tex_coord: source.get("texCoord").map(json_number),
        extensions: source
            .get("extensions")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info_extensions(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_texture_info_extensions(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfTextureInfoExtensions> {
    let record = Arc::new(RwLock::new(GltfTextureInfoExtensions {
        khr_texture_transform: source
            .get("KHR_texture_transform")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_transform(value, metadata)),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

fn decode_gltf_texture_info_fields(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> GltfTextureInfo {
    return GltfTextureInfo {
        index: json_number(source.get("index").unwrap_or(&Value::Null)),
        tex_coord: source.get("texCoord").map(json_number),
        extensions: source
            .get("extensions")
            .filter(|value| !value.is_null())
            .map(|value| decode_gltf_texture_info_extensions(value, metadata)),
    };
}

fn decode_gltf_texture_transform(
    source: &Value,
    metadata: &mut GltfJsonMetadata,
) -> Ref<GltfTextureTransform> {
    let record = Arc::new(RwLock::new(GltfTextureTransform {
        offset: source
            .get("offset")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        rotation: source.get("rotation").map(json_number),
        scale: source
            .get("scale")
            .and_then(Value::as_array)
            .map(|rows| rows.iter().map(json_number).collect()),
        tex_coord: source.get("texCoord").map(json_number),
    }));
    retain_json_scalars(metadata, &record, source);
    return record;
}

pub(crate) fn empty_gltf_json_metadata() -> Arc<GltfJsonMetadata> {
    return Arc::new(GltfJsonMetadata {
        by_record_id: HashMap::new(),
    });
}

pub(crate) fn gltf_json_field<'a, T: ?Sized>(
    metadata: &'a GltfJsonMetadata,
    record: &Ref<T>,
    field: &str,
) -> Option<&'a Value> {
    return metadata
        .by_record_id
        .get(&(Arc::as_ptr(record) as *const () as usize))
        .and_then(|scalar_members| scalar_members.get(field));
}

// flight-lint: allow(f64) private exact-integer limb preserves original JSON array indices until integer lookup; coordinates and transform arrays are never widened
pub(crate) fn gltf_original_array_number<T: ?Sized>(
    metadata: &GltfJsonMetadata,
    record: &Ref<T>,
    field: &str,
    index: usize,
    current: f32,
) -> f64 {
    if let Some(Value::Number(value)) =
        gltf_json_field(metadata, record, field).and_then(|value| value.get(index))
    {
        let original = value
            .as_f64()
            .unwrap_or_else(|| value.to_string().parse::<f64>().unwrap_or(f64::NAN));
        if (original as f32).to_bits() == current.to_bits() {
            return original;
        }
    }
    return current as f64;
}

// flight-lint: allow(f64) private JSON Number validation retains original count/index precision until exact integer decisions, without widening public wire fields
pub(crate) fn gltf_original_number<T: ?Sized>(
    metadata: &GltfJsonMetadata,
    record: &Ref<T>,
    field: &str,
    current: f32,
) -> f64 {
    if let Some(Value::Number(value)) = gltf_json_field(metadata, record, field) {
        let original = value
            .as_f64()
            .unwrap_or_else(|| value.to_string().parse::<f64>().unwrap_or(f64::NAN));
        if (original as f32).to_bits() == current.to_bits() {
            return original;
        }
    }
    return current as f64;
}

// flight-lint: allow(f64) private JSON boundary reads the source Number before one final canonical f32 scalar write; original index/count tokens are retained separately
fn json_number(value: &Value) -> f32 {
    let Value::Number(value) = value else {
        return f32::NAN;
    };
    return value
        .as_f64()
        .unwrap_or_else(|| value.to_string().parse::<f64>().unwrap_or(f64::NAN)) as f32;
}

fn json_unknown(value: &Value) -> Unknown {
    return match value {
        Value::Null => None,
        Value::Bool(value) => Some(Arc::new(*value)),
        Value::Number(_) => Some(Arc::new(json_number(value))),
        Value::String(value) => Some(Arc::new(value.clone())),
        Value::Array(values) => Some(Arc::new(Arc::new(RwLock::new(
            values.iter().map(json_unknown).collect::<Vec<Unknown>>(),
        )))),
        Value::Object(values) => {
            let mut record = Record::default();
            for (key, value) in values {
                set_record_value(&mut record, key.clone(), json_unknown(value));
            }
            Some(Arc::new(Arc::new(RwLock::new(record))))
        }
    };
}

fn json_vendor_fields(source: &Value, named: &[&str]) -> Record<Unknown> {
    let mut record = Record::default();
    if let Some(object_members) = source.as_object() {
        for (key, value) in object_members {
            if !named.iter().any(|named| *named == key) {
                set_record_value(&mut record, key.clone(), json_unknown(value));
            }
        }
    }
    return record;
}

fn retain_json_scalars<T>(metadata: &mut GltfJsonMetadata, record: &Ref<T>, source: &Value) {
    let Some(object_members) = source.as_object() else {
        return;
    };
    let scalars = object_members
        .iter()
        .filter(|(_, value)| {
            !value.is_object()
                && !value.as_array().is_some_and(|items| {
                    items.iter().any(|item| item.is_object() || item.is_array())
                })
        })
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    metadata
        .by_record_id
        .insert(Arc::as_ptr(record) as usize, scalars);
}
