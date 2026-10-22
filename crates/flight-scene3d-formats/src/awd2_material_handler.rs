use crate::awd2_parse::report_awd_diagnostic;
use crate::awd2_reader::{
    read_awd_properties, read_awd_property_float32, read_awd_property_number,
    read_awd_property_uint32, read_awd_string,
};
use crate::awd2_schema::*;
use crate::awd2_types::{
    Awd2Block, Awd2BlockHandler, Awd2MaterialEntry, Awd2ParsedMaterial, Awd2ParsedTexture,
    Awd2TextureEntry,
};
use crate::shared::{create_embedded_texture_ref, create_external_texture_ref};
use crate::three_ds_read::read_three_ds_u32;
use flight_entity::{Ref, Uint8Array};
use flight_image_codec::detect_image_mime_type;
use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_materials::{Material3D, MaterialAlphaMode};
use flight_scene3d::{Scene3DDocument, Scene3DDocumentMaterial, Scene3DDocumentMaterialEntity};
use flight_shading::create_shaded_material;
use flight_texture::{Texture, TextureColorSpace, TextureUvTransform};
use std::collections::HashMap;
use std::sync::{Arc, LazyLock, RwLock};

struct AwdResolvedMaterial {
    id: u32,
    index: i32,
}

pub static AWD2_MATERIAL_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_MATERIAL],
        build_phase: Some(AWD2_BUILD_PHASE_MATERIALS as f32),
        deferred: None,
        parse: Arc::new(|state, block| {
            if let Some(material) = parse_material_block(block, state.diagnostics.as_ref()) {
                let mut materials = state.materials.write().unwrap();
                if let Some(entry) = materials
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = material;
                } else {
                    materials.push(Awd2MaterialEntry {
                        key: block.block_id,
                        value: material,
                    });
                }
            }
        }),
        build: Some(Arc::new(|state| {
            let cache = Arc::new(RwLock::new(Vec::new()));
            let materials = state.materials.clone();
            let textures = state.textures.clone();
            let document = state.document.clone();
            let diagnostics = state.diagnostics.clone();
            state.resolve_material = Some(Arc::new(move |id| {
                return resolve_awd_material(
                    &document,
                    id,
                    &materials,
                    &textures,
                    &cache,
                    diagnostics.as_ref(),
                );
            }));
        })),
    }))
});

pub static AWD2_TEXTURE_HANDLER: LazyLock<Ref<Awd2BlockHandler>> = LazyLock::new(|| {
    Arc::new(RwLock::new(Awd2BlockHandler {
        block_types: vec![AWD2_BLOCK_TEXTURE],
        build_phase: None,
        deferred: None,
        parse: Arc::new(|state, block| {
            if let Some(texture) = parse_texture_block(block, state.diagnostics.as_ref()) {
                let mut textures = state.textures.write().unwrap();
                if let Some(entry) = textures
                    .iter_mut()
                    .find(|entry| entry.key == block.block_id)
                {
                    entry.value = texture;
                } else {
                    textures.push(Awd2TextureEntry {
                        key: block.block_id,
                        value: texture,
                    });
                }
            }
        }),
        build: None,
    }))
});

// flight-lint: allow(f64) Principal192423ac: preserve Number multiplication and rounding before exact packed alpha byte
fn get_awd_diffuse_rgba(color: Option<u32>, alpha: Option<f32>) -> u32 {
    let rgb = color.unwrap_or(0xffffff);
    let alpha = alpha
        .map(|value| (f64::from(value) * 255.0).round().clamp(0.0, 255.0) as u32)
        .unwrap_or(255);
    return (rgb << 8) | alpha;
}

// flight-lint: allow(f64) Principal192423ac: preserve Number channel products and rounding before exact packed specular bytes
fn get_awd_specular_rgba(color: Option<u32>, strength: f32) -> u32 {
    let rgb = color.unwrap_or(AWD2_MATERIAL_DEFAULT_SPECULAR_RGB);
    let scale = f64::from(strength).clamp(0.0, 1.0);
    let red = (f64::from((rgb >> 16) & 255) * scale).round() as u32;
    let green = (f64::from((rgb >> 8) & 255) * scale).round() as u32;
    let blue = (f64::from(rgb & 255) * scale).round() as u32;
    return (red << 24) | (green << 16) | (blue << 8) | 255;
}

fn material_texture_truncated(
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
    texture: bool,
    field: &str,
    bytes: Option<u32>,
) {
    let mut detail = HashMap::from([(
        "field".to_string(),
        ImportDiagnosticDetailValue::String(field.to_string()),
    )]);
    if let Some(bytes) = bytes {
        detail.insert(
            "bytes".to_string(),
            ImportDiagnosticDetailValue::Number(bytes as f32),
        );
    }
    report_awd_diagnostic(
        diagnostics,
        ImportDiagnosticSeverity::Drop,
        if texture {
            "awd2.texture-truncated"
        } else {
            "awd2.material-truncated"
        },
        if texture {
            "parseTextureBlock"
        } else {
            "parseMaterialBlock"
        },
        Some(detail),
    );
}

fn parse_material_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedMaterial> {
    let parse = |view: &Uint8Array, source: &Uint8Array| {
        let mut offset = block.data_start;
        if offset + 2 > block.data_end {
            material_texture_truncated(diagnostics, false, "name", None);
            return None;
        }
        let name = read_awd_string(view, source, offset);
        offset = name.end;
        if offset + 2 > block.data_end {
            material_texture_truncated(diagnostics, false, "type", None);
            return None;
        }
        offset += 1;
        let num_methods = source[offset];
        offset += 1;
        let props = read_awd_properties(view, offset, block.data_end);
        return Some(Awd2ParsedMaterial {
            alpha: read_awd_property_float32(view, &props.values, AWD2_MATERIAL_PROP_ALPHA),
            color: read_awd_property_uint32(view, &props.values, AWD2_MATERIAL_PROP_COLOR),
            diffuse_texture_id: read_awd_property_uint32(
                view,
                &props.values,
                AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
            )
            .unwrap_or(0),
            gloss: read_awd_property_number(view, &props.values, AWD2_MATERIAL_PROP_GLOSS),
            name: name.value,
            normal_texture_id: read_awd_property_uint32(
                view,
                &props.values,
                AWD2_MATERIAL_PROP_NORMAL_TEXTURE,
            )
            .unwrap_or(0),
            num_methods,
            specular_color: read_awd_property_uint32(
                view,
                &props.values,
                AWD2_MATERIAL_PROP_SPECULAR_COLOR,
            ),
            specular_strength: read_awd_property_number(
                view,
                &props.values,
                AWD2_MATERIAL_PROP_SPECULAR_STRENGTH,
            ),
            specular_texture_id: read_awd_property_uint32(
                view,
                &props.values,
                AWD2_MATERIAL_PROP_SPECULAR_TEXTURE,
            )
            .unwrap_or(0),
        });
    };
    if Arc::ptr_eq(&block.source, &block.view) {
        let bytes = block.view.read().unwrap();
        return parse(&bytes, &bytes);
    }
    let view = block.view.read().unwrap();
    let source = block.source.read().unwrap();
    return parse(&view, &source);
}

fn parse_texture_block(
    block: &Awd2Block,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Awd2ParsedTexture> {
    let parse = |view: &Uint8Array, source: &Uint8Array| {
        let mut offset = block.data_start;
        if offset + 2 > block.data_end {
            material_texture_truncated(diagnostics, true, "name", None);
            return None;
        }
        let name = read_awd_string(view, source, offset);
        offset = name.end;
        if offset + 5 > block.data_end {
            material_texture_truncated(diagnostics, true, "payload", None);
            return None;
        }
        let texture_type = source[offset];
        offset += 1;
        let length = read_three_ds_u32(view, offset);
        offset += 4;
        if offset + length as usize > block.data_end {
            material_texture_truncated(diagnostics, true, "data", Some(length));
            return None;
        }
        if texture_type != AWD2_TEXTURE_TYPE_EMBEDDED {
            return Some(Awd2ParsedTexture {
                bytes: None,
                mime_type: None,
                url: Some(name.value.clone()),
                name: name.value,
            });
        }
        let bytes = source[offset..offset + length as usize]
            .to_vec()
            .into_boxed_slice();
        let Some(mime_type) = detect_image_mime_type(&bytes) else {
            report_awd_diagnostic(
                diagnostics,
                ImportDiagnosticSeverity::Recover,
                "awd2.texture-unrecognized-format",
                "parseTextureBlock",
                None,
            );
            return Some(Awd2ParsedTexture {
                bytes: None,
                mime_type: None,
                name: name.value,
                url: None,
            });
        };
        return Some(Awd2ParsedTexture {
            bytes: Some(Arc::new(RwLock::new(bytes))),
            mime_type: Some(mime_type),
            name: name.value,
            url: None,
        });
    };
    if Arc::ptr_eq(&block.source, &block.view) {
        let bytes = block.view.read().unwrap();
        return parse(&bytes, &bytes);
    }
    let view = block.view.read().unwrap();
    let source = block.source.read().unwrap();
    return parse(&view, &source);
}

fn resolve_awd_material(
    document: &Ref<Scene3DDocument>,
    material_id: u32,
    material_blocks: &Ref<Vec<Awd2MaterialEntry>>,
    texture_blocks: &Ref<Vec<Awd2TextureEntry>>,
    cache: &Ref<Vec<AwdResolvedMaterial>>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> i32 {
    if material_id == 0 {
        return -1;
    }
    if let Some(index) = cache
        .read()
        .unwrap()
        .iter()
        .find(|entry| entry.id == material_id)
        .map(|entry| entry.index)
    {
        return index;
    }
    let material_blocks = material_blocks.read().unwrap();
    let Some(parsed) = material_blocks
        .iter()
        .find(|entry| entry.key == material_id)
        .map(|entry| &entry.value)
    else {
        report_awd_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Drop,
            "awd2.material-missing",
            "resolveAwdMaterial",
            Some(HashMap::from([(
                "material".to_string(),
                ImportDiagnosticDetailValue::Number(material_id as f32),
            )])),
        );
        cache.write().unwrap().push(AwdResolvedMaterial {
            id: material_id,
            index: -1,
        });
        return -1;
    };
    let diffuse_texture = if parsed.diffuse_texture_id != 0 {
        resolve_awd_texture(
            document,
            parsed.diffuse_texture_id,
            texture_blocks,
            diagnostics,
        )
    } else {
        None
    };
    let normal_texture = if parsed.normal_texture_id != 0 {
        resolve_awd_texture(
            document,
            parsed.normal_texture_id,
            texture_blocks,
            diagnostics,
        )
    } else {
        None
    };
    if let Some(texture) = &normal_texture {
        texture.write().unwrap().texture_fields_mut().color_space = TextureColorSpace::Linear;
    }
    let specular_texture = if parsed.specular_texture_id != 0 {
        resolve_awd_texture(
            document,
            parsed.specular_texture_id,
            texture_blocks,
            diagnostics,
        )
    } else {
        None
    };
    if parsed.num_methods > 0 {
        report_awd_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Skip,
            "awd2.material-methods-unsupported",
            "resolveAwdMaterial",
            Some(HashMap::from([(
                "methods".to_string(),
                ImportDiagnosticDetailValue::Number(parsed.num_methods as f32),
            )])),
        );
    }
    let diffuse = get_awd_diffuse_rgba(parsed.color, parsed.alpha);
    let strength = parsed
        .specular_strength
        .unwrap_or(AWD2_MATERIAL_DEFAULT_SPECULAR_STRENGTH);
    if strength > 1.0 {
        report_awd_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Recover,
            "awd2.material-specular-strength-clamped",
            "resolveAwdMaterial",
            Some(HashMap::from([(
                "strength".to_string(),
                ImportDiagnosticDetailValue::Number(strength),
            )])),
        );
    }
    let mut material = create_shaded_material();
    material.diffuse = diffuse;
    material.diffuse_map = diffuse_texture;
    material.normal_map = normal_texture;
    material.shininess = parsed.gloss.unwrap_or(AWD2_MATERIAL_DEFAULT_GLOSS);
    material.specular = get_awd_specular_rgba(parsed.specular_color, strength);
    material.specular_map = specular_texture;
    if parsed.alpha.is_some_and(|alpha| alpha < 1.0) {
        material.material3d_fields_mut().alpha_mode = MaterialAlphaMode::Blend;
    }
    material.name = (!parsed.name.is_empty()).then(|| parsed.name.clone());
    let mut document = document.write().unwrap();
    let index = document.materials.len() as i32;
    document.materials.push(Scene3DDocumentMaterial::Entity(
        Scene3DDocumentMaterialEntity {
            material: Arc::new(RwLock::new(material)),
        },
    ));
    cache.write().unwrap().push(AwdResolvedMaterial {
        id: material_id,
        index,
    });
    return index;
}

fn resolve_awd_texture(
    document: &Ref<Scene3DDocument>,
    texture_id: u32,
    texture_blocks: &Ref<Vec<Awd2TextureEntry>>,
    diagnostics: Option<&Ref<Vec<ImportDiagnostic>>>,
) -> Option<Ref<Texture>> {
    let texture_blocks = texture_blocks.read().unwrap();
    let Some(parsed) = texture_blocks
        .iter()
        .find(|entry| entry.key == texture_id)
        .map(|entry| &entry.value)
    else {
        report_awd_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Drop,
            "awd2.texture-missing",
            "resolveAwdTexture",
            Some(HashMap::from([(
                "texture".to_string(),
                ImportDiagnosticDetailValue::Number(texture_id as f32),
            )])),
        );
        return None;
    };
    if let (Some(bytes), Some(mime_type)) = (&parsed.bytes, &parsed.mime_type) {
        return Some(create_embedded_texture_ref(
            bytes.clone(),
            Some(mime_type),
            Some(&mut document.write().unwrap().resources),
        ));
    }
    if let Some(url) = &parsed.url {
        return Some(create_external_texture_ref(
            url,
            None,
            Some(&mut document.write().unwrap().resources),
        ));
    }
    return None;
}
